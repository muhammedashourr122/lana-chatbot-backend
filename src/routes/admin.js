const express = require("express");
const {
  getProducts,
  getOrder,
  getOrderByShortId,
  updateOrderStatus,
} = require("../easyorders");
const {
  getTrackingEvents,
  getKnownOrderIds,
  getOrderIdsForPhone,
} = require("../tracking-store");
const adminCache = require("../lib/admin-cache");
const { BOSTA_STATE_TO_EASYORDERS_STATUS } = require("./webhooks");

const router = express.Router();

const STALE_HOURS = 48;
const PENDING_STALE_HOURS = 24;
const SILENT_DISPATCH_HOURS = 24;
const TERMINAL_STATUSES = ["delivered", "canceled", "refunded"];
const ATTENTION_STATES = [47, 100, 101, 102, 103, 105]; // Exception, Lost, Damaged, Investigation, Awaiting action, On hold
const LOW_STOCK_THRESHOLD = 5;

const VALID_ORDER_STATUSES = [
  "pending", "confirmed", "pending_payment", "paid", "paid_failed",
  "processing", "waiting_for_pickup", "in_delivery", "delivered",
  "canceled", "returning_from_delivery", "request_refund",
  "refund_in_progress", "refunded",
];

// Everything the dashboard needs, computed once from Easy Orders + Redis
// and shared across /overview, /needs-attention, and /orders via the
// admin-cache so a 30s poll from any number of open tabs only triggers
// this computation once per cache window, not once per request.
async function computeAdminData() {
  const orderIds = await getKnownOrderIds();
  const now = Date.now();

  const rows = await Promise.all(
    orderIds.map(async (id) => {
      let order = null;
      try {
        order = await getOrder(id);
      } catch (e) {}

      const events = await getTrackingEvents(id);
      const status = order ? order.status : null;

      let delivery = null;
      if (events.length > 0) {
        const latest = events[events.length - 1];
        const hoursSinceUpdate = (now - latest.timestamp) / (1000 * 60 * 60);
        const isTerminal = status && TERMINAL_STATUSES.includes(status);
        const needsAttention =
          ATTENTION_STATES.includes(latest.state) ||
          (!isTerminal && hoursSinceUpdate > STALE_HOURS);

        delivery = {
          state: latest.state,
          state_name: latest.stateName,
          tracking_number: latest.trackingNumber,
          hours_since_update: Math.round(hoursSinceUpdate),
          needs_attention: needsAttention,
        };
      }

      return {
        order_id: id,
        short_id: order ? order.short_id : null,
        status,
        total_cost: order ? order.total_cost : null,
        full_name: order ? order.full_name : null,
        phone: order ? order.phone : null,
        government: order ? order.government : null,
        address: order ? order.address : null,
        payment_method: order ? order.payment_method : null,
        shipping_cost: order ? order.shipping_cost : null,
        created_at: order ? order.created_at : null,
        orders_count: order?.metadata?.tracking?.orders_count || 1,
        cart_items: order ? order.cart_items : [],
        events,
        delivery,
      };
    })
  );

  const validRows = rows.filter((r) => r.short_id != null || r.delivery);

  // ---- Business health stats ----
  const statusCounts = {};
  const productCounts = {};
  const repeatPhones = new Set();
  let revenue = 0;
  let codCollected = 0;
  let codPending = 0;

  validRows.forEach((r) => {
    if (r.status) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    if (typeof r.total_cost === "number") revenue += r.total_cost;
    if (r.orders_count > 1 && r.phone) repeatPhones.add(r.phone);

    if (r.payment_method === "cod" && typeof r.total_cost === "number") {
      if (r.status === "delivered") codCollected += r.total_cost;
      else if (!TERMINAL_STATUSES.includes(r.status)) codPending += r.total_cost;
    }

    (r.cart_items || []).forEach((item) => {
      const name = item?.product?.name;
      if (!name) return;
      productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
    });
  });

  const deliveredCount = validRows.filter((r) => r.status === "delivered").length;
  const terminalCount = validRows.filter((r) => TERMINAL_STATUSES.includes(r.status)).length;

  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, qty]) => ({ name, qty }));

  // ---- Revenue trend, last 30 days ----
  const revenueByDay = {};
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  validRows.forEach((r) => {
    if (!r.created_at || typeof r.total_cost !== "number") return;
    const t = new Date(r.created_at).getTime();
    if (t < thirtyDaysAgo) return;
    const day = r.created_at.slice(0, 10);
    revenueByDay[day] = (revenueByDay[day] || 0) + r.total_cost;
  });
  const revenueTrend = Object.entries(revenueByDay)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, total]) => ({ day, total }));

  // ---- Governorate performance ----
  // "Delivered" for a row is derived the same way regardless of source:
  // either Easy Orders' own status says delivered, or the latest Bosta
  // event maps to "delivered" via the same table the webhook uses.
  function isDeliveredRow(r) {
    if (r.delivery) {
      return BOSTA_STATE_TO_EASYORDERS_STATUS[r.delivery.state] === "delivered";
    }
    return r.status === "delivered";
  }
  function isTerminalRow(r) {
    if (r.delivery) {
      const mapped = BOSTA_STATE_TO_EASYORDERS_STATUS[r.delivery.state];
      if (mapped && TERMINAL_STATUSES.includes(mapped)) return true;
    }
    return TERMINAL_STATUSES.includes(r.status);
  }
  function firstDeliveredTimestamp(r) {
    const hit = r.events.find((e) => BOSTA_STATE_TO_EASYORDERS_STATUS[e.state] === "delivered");
    return hit ? hit.timestamp : null;
  }

  const govMap = {};
  validRows.forEach((r) => {
    if (!r.government) return;
    if (!govMap[r.government]) {
      govMap[r.government] = { name: r.government, order_count: 0, revenue: 0, delivered: 0, terminal: 0, deliveryHoursSamples: [] };
    }
    const g = govMap[r.government];
    g.order_count += 1;
    if (typeof r.total_cost === "number") g.revenue += r.total_cost;
    if (isTerminalRow(r)) g.terminal += 1;
    if (isDeliveredRow(r)) {
      g.delivered += 1;
      const deliveredAt = firstDeliveredTimestamp(r);
      if (deliveredAt && r.created_at) {
        const hours = (deliveredAt - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
        if (hours >= 0) g.deliveryHoursSamples.push(hours);
      }
    }
  });

  const governorates = Object.values(govMap)
    .map((g) => ({
      name: g.name,
      order_count: g.order_count,
      revenue: g.revenue,
      success_rate: g.terminal > 0 ? g.delivered / g.terminal : null,
      avg_delivery_hours: g.deliveryHoursSamples.length
        ? Math.round(g.deliveryHoursSamples.reduce((a, b) => a + b, 0) / g.deliveryHoursSamples.length)
        : null,
      avg_delivery_sample_size: g.deliveryHoursSamples.length,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ---- Low stock (live product catalog, not order-derived) ----
  let lowStock = [];
  try {
    const productData = await getProducts({ limit: 200 });
    const products = productData.data || productData;
    lowStock = products
      .filter((p) => p.track_stock && p.quantity <= LOW_STOCK_THRESHOLD)
      .map((p) => ({ name: p.name, quantity: p.quantity }))
      .sort((a, b) => a.quantity - b.quantity);
  } catch (e) {
    console.error("Low stock check failed:", e.message);
  }

  // ---- Needs Attention (unified, order-scoped, multi-reason) ----
  const PRIORITY = { delivery_exception: 1, silent_dispatch: 2, stale_tracking: 3, stuck_payment: 4 };
  const needsAttention = [];
  validRows.forEach((r) => {
    if (!r.created_at) return;
    const hoursSinceCreated = (now - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
    const reasons = [];

    if (["pending", "pending_payment"].includes(r.status) && hoursSinceCreated > PENDING_STALE_HOURS) {
      reasons.push("stuck_payment");
    }
    if (r.delivery && ATTENTION_STATES.includes(r.delivery.state)) {
      reasons.push("delivery_exception");
    }
    if (r.delivery && !ATTENTION_STATES.includes(r.delivery.state) &&
        !TERMINAL_STATUSES.includes(r.status) && r.delivery.hours_since_update > STALE_HOURS) {
      reasons.push("stale_tracking");
    }
    if (!r.delivery && ["in_delivery", "waiting_for_pickup"].includes(r.status) && hoursSinceCreated > SILENT_DISPATCH_HOURS) {
      reasons.push("silent_dispatch");
    }

    if (reasons.length === 0) return;
    const priority = Math.min(...reasons.map((reason) => PRIORITY[reason]));
    needsAttention.push({
      order_id: r.order_id,
      short_id: r.short_id,
      full_name: r.full_name,
      phone: r.phone,
      easyorders_status: r.status,
      bosta_state_name: r.delivery ? r.delivery.state_name : null,
      bosta_tracking_number: r.delivery ? r.delivery.tracking_number : null,
      total_cost: r.total_cost,
      created_at: r.created_at,
      reasons,
      priority,
      hours_since_last_bosta_event: r.delivery ? r.delivery.hours_since_update : null,
      hours_pending: reasons.includes("stuck_payment") ? Math.round(hoursSinceCreated) : null,
    });
  });
  needsAttention.sort((a, b) => a.priority - b.priority);

  // ---- Unified orders list (Easy Orders + Bosta side by side) ----
  const orders = validRows
    .map((r) => ({
      order_id: r.order_id,
      short_id: r.short_id,
      status: r.status,
      total_cost: r.total_cost,
      full_name: r.full_name,
      phone: r.phone,
      government: r.government,
      address: r.address,
      payment_method: r.payment_method,
      shipping_cost: r.shipping_cost,
      created_at: r.created_at,
      orders_count: r.orders_count,
      cart_items: r.cart_items,
      bosta: r.delivery
        ? {
            state_name: r.delivery.state_name,
            tracking_number: r.delivery.tracking_number,
            hours_since_update: r.delivery.hours_since_update,
            needs_attention: r.delivery.needs_attention,
          }
        : null,
    }))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return {
    stats: {
      total_orders: validRows.length,
      revenue,
      avg_order_value: validRows.length ? Math.round(revenue / validRows.length) : 0,
      cod_collected: codCollected,
      cod_pending: codPending,
      delivery_success_rate: terminalCount > 0 ? deliveredCount / terminalCount : null,
      repeat_customers: repeatPhones.size,
    },
    status_counts: statusCounts,
    revenue_trend: revenueTrend,
    governorates,
    top_products: topProducts,
    low_stock: lowStock,
    needs_attention: needsAttention,
    orders,
  };
}

function getAdminData() {
  return adminCache.getOrCompute("admin-data", computeAdminData);
}

router.get("/overview", async (req, res) => {
  try {
    const data = await getAdminData();
    res.json({
      success: true,
      stats: data.stats,
      status_counts: data.status_counts,
      revenue_trend: data.revenue_trend,
      governorates: data.governorates,
      top_products: data.top_products,
      low_stock: data.low_stock,
      needs_attention_count: data.needs_attention.length,
    });
  } catch (error) {
    console.error("Overview error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load overview" });
  }
});

router.get("/needs-attention", async (req, res) => {
  try {
    const data = await getAdminData();
    res.json({ success: true, items: data.needs_attention });
  } catch (error) {
    console.error("Needs-attention error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load needs-attention" });
  }
});

router.get("/orders", async (req, res) => {
  try {
    const data = await getAdminData();
    let filtered = data.orders;

    if (req.query.status) {
      filtered = filtered.filter((o) => o.status === req.query.status);
    }
    if (req.query.government) {
      filtered = filtered.filter((o) => o.government === req.query.government);
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 25));
    const start = (page - 1) * pageSize;
    const pageOrders = filtered.slice(start, start + pageSize);

    res.json({ success: true, page, page_size: pageSize, total: filtered.length, orders: pageOrders });
  } catch (error) {
    console.error("Orders list error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load orders" });
  }
});

router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ success: false, error: "q is required" });

    const digits = q.replace(/\D/g, "");
    let results = [];

    if (digits.length >= 8) {
      const orderIds = await getOrderIdsForPhone(q);
      results = await Promise.all(
        orderIds.map(async (id) => {
          try {
            return await getOrder(id);
          } catch (e) {
            return null;
          }
        })
      );
      results = results.filter(Boolean);
    } else {
      try {
        const order = await getOrderByShortId(q);
        if (order) results = [order];
      } catch (e) {}
    }

    res.json({
      success: true,
      results: results.map((o) => ({
        order_id: o.id,
        short_id: o.short_id,
        status: o.status,
        total_cost: o.total_cost,
        full_name: o.full_name,
        phone: o.phone,
        created_at: o.created_at,
      })),
    });
  } catch (error) {
    console.error("Admin search error:", error.message);
    res.status(500).json({ success: false, error: "Search failed" });
  }
});

router.get("/customer", async (req, res) => {
  try {
    const phone = String(req.query.phone || "").trim();
    if (!phone) return res.status(400).json({ success: false, error: "phone is required" });

    const orderIds = await getOrderIdsForPhone(phone);
    const orders = (
      await Promise.all(
        orderIds.map(async (id) => {
          try {
            return await getOrder(id);
          } catch (e) {
            return null;
          }
        })
      )
    ).filter(Boolean);

    const lifetimeValue = orders.reduce((sum, o) => sum + (o.total_cost || 0), 0);

    res.json({
      success: true,
      full_name: orders[0] ? orders[0].full_name : null,
      phone,
      order_count: orders.length,
      lifetime_value: lifetimeValue,
      orders: orders
        .map((o) => ({
          order_id: o.id,
          short_id: o.short_id,
          status: o.status,
          total_cost: o.total_cost,
          created_at: o.created_at,
        }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    });
  } catch (error) {
    console.error("Customer lookup error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load customer" });
  }
});

router.post("/update-status", async (req, res) => {
  try {
    const { order_id, status } = req.body || {};
    if (!order_id || !status) {
      return res.status(400).json({ success: false, error: "order_id and status are required" });
    }
    if (!VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    await updateOrderStatus(order_id, status);
    adminCache.invalidate("admin-data");
    res.json({ success: true });
  } catch (error) {
    console.error("Admin status update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ success: false, error: "Failed to update status" });
  }
});

router.VALID_ORDER_STATUSES = VALID_ORDER_STATUSES;

module.exports = router;
