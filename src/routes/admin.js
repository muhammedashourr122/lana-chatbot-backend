const express = require("express");
const {
  getProducts,
  getProduct,
  updateProduct,
  createProduct,
  getCategories,
  createCategory,
  getOrder,
  getOrderByShortId,
  updateOrderStatus,
  addOrderNote,
} = require("../easyorders");
const {
  getTrackingEvents,
  getKnownOrderIds,
  getOrderIdsForPhone,
} = require("../tracking-store");
const adminCache = require("../lib/admin-cache");
const { BOSTA_STATE_TO_EASYORDERS_STATUS } = require("./webhooks");
const { requireOwner } = require("./auth");
const usersStore = require("../lib/users-store");
const homepageContentStore = require("../lib/homepage-content-store");
const { getDeliveryByTrackingNumber, getPickupsForTrackingNumbers, checkOtherBrandPackageSizes } = require("../lib/bosta");
const { logActivity, getRecentActivity } = require("../lib/activity-log-store");
const rawMaterialsStore = require("../lib/raw-materials-store");
const recipesStore = require("../lib/product-recipes-store");
const productionRunsStore = require("../lib/production-runs-store");
const suppliersStore = require("../lib/suppliers-store");
const purchasesStore = require("../lib/purchases-store");
const cashLedgerStore = require("../lib/cash-ledger-store");

const router = express.Router();

const TERMINAL_STATUSES = ["delivered", "canceled", "refunded"];
const ATTENTION_STATES = [47, 100, 101, 102, 103, 105]; // Exception, Lost, Damaged, Investigation, Awaiting action, On hold

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
  const settings = await usersStore.getSettings();
  const STALE_HOURS = settings.staleHours;
  const PENDING_STALE_HOURS = settings.pendingStaleHours;
  const SILENT_DISPATCH_HOURS = settings.silentDispatchHours;
  const LOW_STOCK_THRESHOLD = settings.lowStockThreshold;

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
      govMap[r.government] = { name: r.government, order_count: 0, revenue: 0, shippingRevenue: 0, delivered: 0, terminal: 0, deliveryHoursSamples: [] };
    }
    const g = govMap[r.government];
    g.order_count += 1;
    if (typeof r.total_cost === "number") g.revenue += r.total_cost;
    if (typeof r.shipping_cost === "number") g.shippingRevenue += r.shipping_cost;
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
      // "Shipping revenue" is what customers were charged for shipping on
      // Easy Orders, not Bosta's actual cost to us (we have no access to
      // that) — this shows where shipping fees are heaviest, not margin.
      avg_shipping_cost: g.order_count ? Math.round(g.shippingRevenue / g.order_count) : null,
      total_shipping_revenue: g.shippingRevenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ---- Low stock (live product catalog, not order-derived) ----
  let lowStock = [];
  try {
    const productData = await getProducts({ limit: 200 });
    const products = productData.data || productData;

    // Cross-reference against orders not yet fulfilled/terminal, so a
    // low-stock item that already has unfulfilled demand queued up
    // stands out as the one to restock first.
    const pendingCountByName = {};
    validRows.forEach((r) => {
      if (TERMINAL_STATUSES.includes(r.status)) return;
      (r.cart_items || []).forEach((item) => {
        const name = item.product ? item.product.name : null;
        if (!name) return;
        pendingCountByName[name] = (pendingCountByName[name] || 0) + (item.quantity || 1);
      });
    });

    lowStock = products
      .filter((p) => p.track_stock && p.quantity <= LOW_STOCK_THRESHOLD)
      .map((p) => ({ name: p.name, quantity: p.quantity, pending_demand: pendingCountByName[p.name] || 0 }))
      .sort((a, b) => (b.pending_demand - a.pending_demand) || (a.quantity - b.quantity));
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
      bosta_timeline: r.events.map((e) => ({
        state_name: e.stateName,
        timestamp: e.timestamp,
      })),
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

// Moderators must never receive revenue/financial fields in the JSON
// response itself — not just have them hidden in the UI, since a
// moderator could otherwise read them straight from devtools/curl.
function isModerator(req) {
  return req.user && req.user.role === "moderator";
}
function stripStats(stats) {
  const { revenue, avg_order_value, cod_collected, cod_pending, ...safe } = stats;
  return safe;
}
function stripGovernorate(g) {
  const { revenue, total_shipping_revenue, avg_shipping_cost, ...safe } = g;
  return safe;
}
function stripOrderMoney(o) {
  const { total_cost, shipping_cost, ...safe } = o;
  return safe;
}

router.get("/overview", async (req, res) => {
  try {
    const data = await getAdminData();
    const moderator = isModerator(req);
    res.json({
      success: true,
      stats: moderator ? stripStats(data.stats) : data.stats,
      status_counts: data.status_counts,
      revenue_trend: moderator ? undefined : data.revenue_trend,
      governorates: moderator ? data.governorates.map(stripGovernorate) : data.governorates,
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
    const items = isModerator(req) ? data.needs_attention.map(stripOrderMoney) : data.needs_attention;
    res.json({ success: true, items });
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
    const q = String(req.query.q || "").trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((o) =>
        String(o.full_name || "").toLowerCase().includes(q) ||
        String(o.phone || "").includes(q) ||
        String(o.short_id || "").toLowerCase().includes(q)
      );
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 25));
    const start = (page - 1) * pageSize;
    let pageOrders = filtered.slice(start, start + pageSize);
    if (isModerator(req)) pageOrders = pageOrders.map(stripOrderMoney);

    res.json({ success: true, page, page_size: pageSize, total: filtered.length, orders: pageOrders });
  } catch (error) {
    console.error("Orders list error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load orders" });
  }
});

// Single order, full detail — backs the dedicated order detail page
// (a cleaner alternative to the cramped expanded table row).
router.get("/orders/:orderId", async (req, res) => {
  try {
    const data = await getAdminData();
    let order = data.orders.find((o) => o.order_id === req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    if (isModerator(req)) order = stripOrderMoney(order);

    const events = await getTrackingEvents(req.params.orderId);
    res.json({ success: true, order, events });
  } catch (error) {
    console.error("Order detail error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load order" });
  }
});

router.post("/orders/:orderId/notes", async (req, res) => {
  try {
    const note = String(req.body?.note || "").trim();
    if (!note) {
      return res.status(400).json({ success: false, error: "note is required" });
    }
    await addOrderNote(req.params.orderId, `[${req.user.username}] ${note}`, "public");
    logActivity(req.user.username, "order_note_added", { order_id: req.params.orderId, note });
    res.json({ success: true });
  } catch (error) {
    console.error("Add order note error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to add note" });
  }
});

// Live pull straight from Bosta (not our webhook-derived history) — used
// on demand from an order's expanded row, since polling this for every
// order on every page load would be slow and needlessly hit Bosta's API.
router.get("/orders/:orderId/bosta-live", async (req, res) => {
  try {
    const events = await getTrackingEvents(req.params.orderId);
    const trackingNumber = events.length > 0 ? events[events.length - 1].trackingNumber : null;
    if (!trackingNumber) {
      return res.status(404).json({ success: false, error: "This order has no Bosta delivery yet" });
    }

    const delivery = await getDeliveryByTrackingNumber(trackingNumber);
    if (!delivery) {
      return res.status(404).json({ success: false, error: "Delivery not found on Bosta" });
    }

    // Bosta's audit log has an entry per field changed on the delivery —
    // most are noise (address edits, etc). Only state-transition entries
    // are useful here: what changed, when, and who/what changed it.
    const stateLog = (delivery.log || [])
      .filter((entry) => entry.actionsList?.state_value)
      .map((entry) => ({
        from: entry.actionsList.state_value.before,
        to: entry.actionsList.state_value.after,
        time: entry.time,
        by: entry.takenBy?.userName || null,
      }));

    res.json({
      success: true,
      state: delivery.state,
      timeline: delivery.timeline,
      cod: isModerator(req) ? undefined : delivery.cod,
      shipmentFees: isModerator(req) ? undefined : delivery.shipmentFees,
      numberOfAttempts: delivery.numberOfAttempts,
      isDelayed: delivery.isDelayed,
      slaBreached: Boolean(delivery.sla?.e2eSla?.isExceededE2ESla || delivery.sla?.orderSla?.isExceededOrderSla),
      nextCashoutDate: isModerator(req) ? undefined : delivery.wallet?.cashout?.next_cashout_date,
      packageType: delivery.specs?.packageType || null,
      packageWeight: delivery.specs?.weight || null,
      attempts: (delivery.attempts || []).map((a) => ({
        type: a.type,
        date: a.attemptDate,
        courierName: a.star?.name || null,
        courierPhone: a.star?.phone || null,
      })),
      stateLog,
    });
  } catch (error) {
    console.error("Bosta live fetch error:", error.response?.data || error.message);
    res.status(502).json({ success: false, error: "Unable to fetch live Bosta data" });
  }
});

// Bosta's own /pickups is account-wide (mixes in other brands under the
// same Bosta account) — this only ever returns pickups that contain at
// least one delivery matching one of our own known tracking numbers,
// and only those specific deliveries, never another brand's.
router.get("/pickups", async (req, res) => {
  try {
    const data = await getAdminData();
    const trackingNumbers = data.orders.map((o) => o.bosta?.tracking_number).filter(Boolean);

    if (trackingNumbers.length === 0) {
      return res.json({ success: true, pickups: [] });
    }

    const pickups = await getPickupsForTrackingNumbers(trackingNumbers);
    res.json({ success: true, pickups });
  } catch (error) {
    console.error("Pickups fetch error:", error.response?.data || error.message);
    res.status(502).json({ success: false, error: "Unable to fetch pickups from Bosta" });
  }
});

// Package-size check for the OTHER brand(s) sharing this Bosta account
// (Circle V) — deliberately returns only tracking number + package
// type, never receiver name/phone, even though this is explicitly
// requested by the account owner (not a third party).
router.get("/pickups/other-brand-package-check", requireOwner, async (req, res) => {
  try {
    const data = await getAdminData();
    const ourTrackingNumbers = data.orders.map((o) => o.bosta?.tracking_number).filter(Boolean);
    const flagged = await checkOtherBrandPackageSizes(ourTrackingNumbers);
    res.json({ success: true, flagged });
  } catch (error) {
    console.error("Other-brand package check error:", error.response?.data || error.message);
    res.status(502).json({ success: false, error: "Unable to check package sizes" });
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

    const moderator = isModerator(req);
    res.json({
      success: true,
      results: results.map((o) => ({
        order_id: o.id,
        short_id: o.short_id,
        status: o.status,
        total_cost: moderator ? undefined : o.total_cost,
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

    const moderator = isModerator(req);
    const lifetimeValue = orders.reduce((sum, o) => sum + (o.total_cost || 0), 0);

    res.json({
      success: true,
      full_name: orders[0] ? orders[0].full_name : null,
      phone,
      order_count: orders.length,
      lifetime_value: moderator ? undefined : lifetimeValue,
      orders: orders
        .map((o) => ({
          order_id: o.id,
          short_id: o.short_id,
          status: o.status,
          total_cost: moderator ? undefined : o.total_cost,
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
    if (isModerator(req) && !["confirmed", "canceled"].includes(status)) {
      return res.status(403).json({ success: false, error: "Moderators can only set confirmed or canceled" });
    }

    await updateOrderStatus(order_id, status);
    adminCache.invalidate("admin-data");
    logActivity(req.user.username, "order_status_changed", { order_id, status });
    res.json({ success: true });
  } catch (error) {
    console.error("Admin status update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ success: false, error: "Failed to update status" });
  }
});

// ---- Owner-only: user management ----

router.get("/users", requireOwner, async (req, res) => {
  try {
    const users = await usersStore.listUsers();
    res.json({ success: true, users });
  } catch (error) {
    console.error("List users error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load users" });
  }
});

router.post("/users", requireOwner, async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    const user = await usersStore.createUser(username, password, role);
    res.json({ success: true, user });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete("/users/:username", requireOwner, async (req, res) => {
  try {
    await usersStore.deleteUser(req.params.username);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---- Owner-only: settings ----

router.get("/settings", requireOwner, async (req, res) => {
  try {
    const settings = await usersStore.getSettings();
    // Never send the raw key to the browser — just whether one is set.
    const { bostaApiKey, ...rest } = settings;
    res.json({ success: true, settings: { ...rest, bostaApiKeySet: Boolean(bostaApiKey) } });
  } catch (error) {
    console.error("Get settings error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load settings" });
  }
});

router.post("/settings", requireOwner, async (req, res) => {
  try {
    const { staleHours, pendingStaleHours, silentDispatchHours, lowStockThreshold, bostaApiKey } = req.body || {};
    const values = { staleHours, pendingStaleHours, silentDispatchHours, lowStockThreshold };

    for (const [k, v] of Object.entries(values)) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        return res.status(400).json({ success: false, error: `${k} must be an integer between 1 and 500` });
      }
      values[k] = n;
    }

    // Blank/omitted means "leave the current key alone" — the GET route
    // never sends the real key back, so an empty field can't mean "clear it".
    const current = await usersStore.getSettings();
    values.bostaApiKey = typeof bostaApiKey === "string" && bostaApiKey.trim() ? bostaApiKey.trim() : current.bostaApiKey;

    const saved = await usersStore.saveSettings(values);
    adminCache.invalidate("admin-data");
    const { bostaApiKey: _omit, ...rest } = saved;
    res.json({ success: true, settings: { ...rest, bostaApiKeySet: Boolean(saved.bostaApiKey) } });
  } catch (error) {
    console.error("Save settings error:", error.message);
    res.status(500).json({ success: false, error: "Unable to save settings" });
  }
});

// ---- Owner-only: homepage content (no-code editing of the storefront's
// custom hero/best-sellers/collections/offer blocks) ----

router.get("/homepage-content", requireOwner, async (req, res) => {
  try {
    const content = await homepageContentStore.getHomepageContent();
    res.json({ success: true, content });
  } catch (error) {
    console.error("Get homepage content error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load homepage content" });
  }
});

router.post("/homepage-content", requireOwner, async (req, res) => {
  try {
    const content = req.body?.content;
    if (!content || typeof content !== "object") {
      return res.status(400).json({ success: false, error: "content is required" });
    }

    // Referenced product slugs are optional, but if set, they must be
    // real — otherwise the storefront would silently show a blank card.
    const slugsToCheck = [
      ...(content.bestSellers?.productSlugs || []),
      content.collections?.her?.productSlug,
      content.collections?.him?.productSlug,
      content.collections?.unisex?.productSlug,
    ].filter(Boolean);

    if (slugsToCheck.length > 0) {
      const productData = await getProducts({ limit: 200 });
      const products = productData.data || productData;
      const knownSlugs = new Set(products.map((p) => p.slug));
      const unknown = slugsToCheck.filter((slug) => !knownSlugs.has(slug));
      if (unknown.length > 0) {
        return res.status(400).json({ success: false, error: `Unknown product slug(s): ${unknown.join(", ")}` });
      }
    }

    const saved = await homepageContentStore.saveHomepageContent(content);
    res.json({ success: true, content: saved });
  } catch (error) {
    console.error("Save homepage content error:", error.message);
    res.status(500).json({ success: false, error: "Unable to save homepage content" });
  }
});

// ---- Owner-only: product catalog editing (price, sale price, stock) ----

router.get("/products", requireOwner, async (req, res) => {
  try {
    const data = await getProducts({ limit: 200 });
    const products = data.data || data;
    res.json({ success: true, products });
  } catch (error) {
    console.error("Admin products list error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to load products" });
  }
});

router.get("/products/:productId", requireOwner, async (req, res) => {
  try {
    const product = await getProduct(req.params.productId);
    res.json({ success: true, product });
  } catch (error) {
    console.error("Get product error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to load product" });
  }
});

router.post("/products", requireOwner, async (req, res) => {
  try {
    const { name, price, slug, thumb, quantity, track_stock } = req.body || {};
    if (!name || !slug || price === undefined) {
      return res.status(400).json({ success: false, error: "name, slug, and price are required" });
    }
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ success: false, error: "price must be a non-negative number" });

    const created = await createProduct({
      name,
      slug,
      price: n,
      thumb: thumb || undefined,
      quantity: quantity !== undefined ? Number(quantity) : 0,
      track_stock: Boolean(track_stock),
    });
    logActivity(req.user.username, "product_created", { name, slug });
    res.json({ success: true, product: created });
  } catch (error) {
    console.error("Create product error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to create product" });
  }
});

router.patch("/products/:productId", requireOwner, async (req, res) => {
  try {
    const { price, sale_price, quantity, categories, hidden } = req.body || {};
    const fields = {};

    if (hidden !== undefined) {
      fields.hidden = Boolean(hidden);
    }

    if (price !== undefined) {
      const n = Number(price);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ success: false, error: "price must be a non-negative number" });
      fields.price = n;
    }
    if (sale_price !== undefined) {
      const n = Number(sale_price);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ success: false, error: "sale_price must be a non-negative number" });
      fields.sale_price = n;
    }
    if (quantity !== undefined) {
      const n = Number(quantity);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ success: false, error: "quantity must be a non-negative integer" });
      fields.quantity = n;
    }
    if (categories !== undefined) {
      if (!Array.isArray(categories)) return res.status(400).json({ success: false, error: "categories must be an array of category ids" });
      fields.categories = categories.map((id) => ({ id }));
    }

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ success: false, error: "Nothing to update" });
    }

    const updated = await updateProduct(req.params.productId, fields);
    logActivity(req.user.username, "product_updated", { product_id: req.params.productId, fields: Object.keys(fields) });
    res.json({ success: true, product: updated });
  } catch (error) {
    console.error("Update product error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to update product" });
  }
});

// ---- Owner-only: categories ----

router.get("/categories", requireOwner, async (req, res) => {
  try {
    const data = await getCategories();
    const categories = data.data || data;
    res.json({ success: true, categories });
  } catch (error) {
    console.error("Admin categories list error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to load categories" });
  }
});

router.post("/categories", requireOwner, async (req, res) => {
  try {
    const { name, slug, show_in_header } = req.body || {};
    if (!name || !slug) {
      return res.status(400).json({ success: false, error: "name and slug are required" });
    }
    const created = await createCategory({ name, slug, show_in_header: Boolean(show_in_header) });
    logActivity(req.user.username, "category_created", { name, slug });
    res.json({ success: true, category: created });
  } catch (error) {
    console.error("Create category error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to create category" });
  }
});

// ---- Owner-only: team activity log ----

router.get("/activity", requireOwner, async (req, res) => {
  try {
    const activity = await getRecentActivity(50);
    res.json({ success: true, activity });
  } catch (error) {
    console.error("Activity log fetch error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load activity log" });
  }
});

// ---- Owner-only: production (raw materials -> finished products) ----

router.get("/production/raw-materials", requireOwner, async (req, res) => {
  try {
    const materials = await rawMaterialsStore.getRawMaterials();
    res.json({ success: true, materials });
  } catch (error) {
    console.error("Get raw materials error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load raw materials" });
  }
});

router.post("/production/raw-materials", requireOwner, async (req, res) => {
  try {
    const { name, unit, stock, costPerUnit, lowStockThreshold, category, productId, productName } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: "name is required" });

    const material = await rawMaterialsStore.createRawMaterial({ name, unit, stock, costPerUnit, lowStockThreshold, category, productId, productName });
    logActivity(req.user.username, "raw_material_created", { name });
    res.json({ success: true, material });
  } catch (error) {
    console.error("Create raw material error:", error.message);
    res.status(500).json({ success: false, error: "Unable to create raw material" });
  }
});

router.patch("/production/raw-materials/:id", requireOwner, async (req, res) => {
  try {
    const { name, unit, stock, costPerUnit, lowStockThreshold, category, productId, productName } = req.body || {};
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (unit !== undefined) fields.unit = unit;
    if (stock !== undefined) fields.stock = Number(stock);
    if (costPerUnit !== undefined) fields.costPerUnit = Number(costPerUnit);
    if (lowStockThreshold !== undefined) fields.lowStockThreshold = Number(lowStockThreshold);
    if (category !== undefined) fields.category = category;
    if (productId !== undefined) fields.productId = productId || null;
    if (productName !== undefined) fields.productName = productName || null;

    const material = await rawMaterialsStore.updateRawMaterial(req.params.id, fields);
    logActivity(req.user.username, "raw_material_updated", { name: material.name, fields: Object.keys(fields) });
    res.json({ success: true, material });
  } catch (error) {
    console.error("Update raw material error:", error.message);
    res.status(400).json({ success: false, error: error.message || "Unable to update raw material" });
  }
});

router.delete("/production/raw-materials/:id", requireOwner, async (req, res) => {
  try {
    await rawMaterialsStore.deleteRawMaterial(req.params.id);
    logActivity(req.user.username, "raw_material_deleted", { id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete raw material error:", error.message);
    res.status(500).json({ success: false, error: "Unable to delete raw material" });
  }
});

router.get("/production/recipes/:productId", requireOwner, async (req, res) => {
  try {
    const ingredients = await recipesStore.getRecipe(req.params.productId);
    res.json({ success: true, ingredients });
  } catch (error) {
    console.error("Get recipe error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load recipe" });
  }
});

router.put("/production/recipes/:productId", requireOwner, async (req, res) => {
  try {
    const { ingredients } = req.body || {};
    if (!Array.isArray(ingredients)) {
      return res.status(400).json({ success: false, error: "ingredients must be an array" });
    }
    const materials = await rawMaterialsStore.getRawMaterials();
    const materialIds = new Set(materials.map((m) => m.id));
    for (const ing of ingredients) {
      if (!materialIds.has(ing.materialId)) {
        return res.status(400).json({ success: false, error: `Unknown material id: ${ing.materialId}` });
      }
      if (!(Number(ing.quantityPerUnit) > 0)) {
        return res.status(400).json({ success: false, error: "quantityPerUnit must be greater than 0 for every ingredient" });
      }
    }

    const saved = await recipesStore.setRecipe(
      req.params.productId,
      ingredients.map((ing) => ({ materialId: ing.materialId, quantityPerUnit: Number(ing.quantityPerUnit) }))
    );
    logActivity(req.user.username, "recipe_updated", { product_id: req.params.productId, ingredient_count: saved.length });
    res.json({ success: true, ingredients: saved });
  } catch (error) {
    console.error("Set recipe error:", error.message);
    res.status(500).json({ success: false, error: "Unable to save recipe" });
  }
});

// "What's remaining" — for every product with a recipe, how many more
// units can be produced right now given current raw material stock, and
// which material is the bottleneck.
router.get("/production/capacity", requireOwner, async (req, res) => {
  try {
    const [allRecipes, materials, productData] = await Promise.all([
      recipesStore.getAllRecipes(),
      rawMaterialsStore.getRawMaterials(),
      getProducts({ limit: 200 }),
    ]);
    const products = productData.data || productData;
    const materialsById = Object.fromEntries(materials.map((m) => [m.id, m]));

    const capacity = Object.entries(allRecipes)
      .filter(([, ingredients]) => ingredients.length > 0)
      .map(([productId, ingredients]) => {
        const product = products.find((p) => p.id === productId);
        const breakdown = ingredients.map((ing) => {
          const material = materialsById[ing.materialId];
          const unitsSupportable = material ? Math.floor(material.stock / ing.quantityPerUnit) : 0;
          return {
            materialId: ing.materialId,
            materialName: material ? material.name : "(deleted material)",
            stock: material ? material.stock : 0,
            quantityPerUnit: ing.quantityPerUnit,
            unitsSupportable,
          };
        });
        const limiting = breakdown.reduce((min, b) => (b.unitsSupportable < min.unitsSupportable ? b : min), breakdown[0]);

        return {
          productId,
          productName: product ? product.name : "(unknown product)",
          maxProducible: limiting ? limiting.unitsSupportable : 0,
          limitingMaterial: limiting ? { id: limiting.materialId, name: limiting.materialName } : null,
          breakdown,
        };
      })
      .sort((a, b) => a.maxProducible - b.maxProducible);

    res.json({ success: true, capacity });
  } catch (error) {
    console.error("Production capacity error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to compute production capacity" });
  }
});

router.get("/production/runs", requireOwner, async (req, res) => {
  try {
    const runs = await productionRunsStore.getProductionRuns(50);
    res.json({ success: true, runs });
  } catch (error) {
    console.error("Get production runs error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load production runs" });
  }
});

router.post("/production/runs", requireOwner, async (req, res) => {
  try {
    const { productId, quantityProduced, notes } = req.body || {};
    const qty = Number(quantityProduced);
    if (!productId || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: "productId and a positive quantityProduced are required" });
    }

    const ingredients = await recipesStore.getRecipe(productId);
    if (ingredients.length === 0) {
      return res.status(400).json({ success: false, error: "This product has no recipe defined yet" });
    }

    const materials = await rawMaterialsStore.getRawMaterials();
    const materialsById = Object.fromEntries(materials.map((m) => [m.id, m]));

    const shortages = [];
    const deltas = {};
    let totalCost = 0;
    const materialsConsumed = [];

    for (const ing of ingredients) {
      const material = materialsById[ing.materialId];
      const required = ing.quantityPerUnit * qty;
      if (!material) {
        shortages.push({ materialName: "(deleted material)", required, available: 0 });
        continue;
      }
      if (material.stock < required) {
        shortages.push({ materialName: material.name, required, available: material.stock });
        continue;
      }
      deltas[material.id] = (deltas[material.id] || 0) - required;
      totalCost += required * material.costPerUnit;
      materialsConsumed.push({ materialId: material.id, materialName: material.name, quantityUsed: required, unitCost: material.costPerUnit });
    }

    if (shortages.length > 0) {
      return res.status(400).json({ success: false, error: "Not enough raw material stock", shortages });
    }

    await rawMaterialsStore.adjustRawMaterialStocks(deltas);

    // Add the produced quantity to the finished product's stock on Easy
    // Orders — read current quantity first since PATCH here replaces the
    // field, it doesn't increment it.
    const product = await getProduct(productId);
    await updateProduct(productId, { quantity: (product.quantity || 0) + qty });

    const unitCost = totalCost / qty;
    const run = await productionRunsStore.logProductionRun({
      productId,
      productName: product.name,
      quantityProduced: qty,
      materialsConsumed,
      totalCost,
      unitCost,
      producedBy: req.user.username,
      notes: notes || null,
    });

    logActivity(req.user.username, "production_run", { product_name: product.name, quantity: qty, unit_cost: Math.round(unitCost * 100) / 100 });
    res.json({ success: true, run });
  } catch (error) {
    console.error("Production run error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to log production run" });
  }
});

// ---------------- Suppliers ----------------

router.get("/production/suppliers", requireOwner, async (req, res) => {
  try {
    const suppliers = await suppliersStore.getSuppliers();
    res.json({ success: true, suppliers });
  } catch (error) {
    console.error("Get suppliers error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load suppliers" });
  }
});

router.post("/production/suppliers", requireOwner, async (req, res) => {
  try {
    const { name, phone, notes } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: "Supplier name is required" });
    }
    const supplier = await suppliersStore.createSupplier({ name: String(name).trim(), phone, notes });
    logActivity(req.user.username, "supplier_created", { supplier_name: supplier.name });
    res.json({ success: true, supplier });
  } catch (error) {
    console.error("Create supplier error:", error.message);
    res.status(500).json({ success: false, error: "Unable to create supplier" });
  }
});

router.patch("/production/suppliers/:id", requireOwner, async (req, res) => {
  try {
    const { name, phone, notes } = req.body || {};
    const fields = {};
    if (name !== undefined) fields.name = String(name).trim();
    if (phone !== undefined) fields.phone = phone;
    if (notes !== undefined) fields.notes = notes;
    const supplier = await suppliersStore.updateSupplier(req.params.id, fields);
    logActivity(req.user.username, "supplier_updated", { supplier_name: supplier.name });
    res.json({ success: true, supplier });
  } catch (error) {
    console.error("Update supplier error:", error.message);
    res.status(400).json({ success: false, error: error.message || "Unable to update supplier" });
  }
});

router.delete("/production/suppliers/:id", requireOwner, async (req, res) => {
  try {
    await suppliersStore.deleteSupplier(req.params.id);
    logActivity(req.user.username, "supplier_deleted", { supplier_id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete supplier error:", error.message);
    res.status(500).json({ success: false, error: "Unable to delete supplier" });
  }
});

router.post("/production/suppliers/:id/payments", requireOwner, async (req, res) => {
  try {
    const { amount, notes } = req.body || {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: "A positive amount is required" });
    }
    const suppliers = await suppliersStore.getSuppliers();
    const supplier = suppliers.find((s) => s.id === req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: "Supplier not found" });

    await suppliersStore.adjustSupplierBalance(supplier.id, -amt);
    const payment = await purchasesStore.logSupplierPayment({
      supplierId: supplier.id,
      supplierName: supplier.name,
      amount: amt,
      paidBy: req.user.username,
      notes: notes || null,
    });
    await cashLedgerStore.logCashEntry({
      type: "disbursement",
      category: "supplier_payment",
      amount: amt,
      description: "Payment to " + supplier.name,
      recordedBy: req.user.username,
    });
    logActivity(req.user.username, "supplier_payment", { supplier_name: supplier.name, amount: amt });
    res.json({ success: true, payment });
  } catch (error) {
    console.error("Supplier payment error:", error.message);
    res.status(500).json({ success: false, error: "Unable to record payment" });
  }
});

router.get("/production/payments", requireOwner, async (req, res) => {
  try {
    const payments = await purchasesStore.getSupplierPayments(50);
    res.json({ success: true, payments });
  } catch (error) {
    console.error("Get supplier payments error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load payments" });
  }
});

// ---------------- Purchases ----------------

router.get("/production/purchases", requireOwner, async (req, res) => {
  try {
    const purchases = await purchasesStore.getPurchases(50);
    res.json({ success: true, purchases });
  } catch (error) {
    console.error("Get purchases error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load purchases" });
  }
});

router.post("/production/purchases", requireOwner, async (req, res) => {
  try {
    const { supplierId, items, amountPaid, notes } = req.body || {};
    if (!supplierId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "supplierId and at least one item are required" });
    }

    const suppliers = await suppliersStore.getSuppliers();
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) return res.status(404).json({ success: false, error: "Supplier not found" });

    const materials = await rawMaterialsStore.getRawMaterials();
    const materialsById = Object.fromEntries(materials.map((m) => [m.id, m]));

    const lineItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const material = materialsById[item.materialId];
      const quantity = Number(item.quantity);
      const unitCost = Number(item.unitCost);
      if (!material) {
        return res.status(400).json({ success: false, error: "One of the selected materials no longer exists" });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ success: false, error: "Each item needs a positive quantity" });
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        return res.status(400).json({ success: false, error: "Each item needs a valid unit cost" });
      }
      const lineTotal = quantity * unitCost;
      totalAmount += lineTotal;
      lineItems.push({ materialId: material.id, materialName: material.name, quantity, unitCost, lineTotal });
    }

    // Apply stock increases and refresh each material's cost to the latest purchase price.
    for (const item of lineItems) {
      const material = materialsById[item.materialId];
      await rawMaterialsStore.updateRawMaterial(material.id, {
        stock: material.stock + item.quantity,
        costPerUnit: item.unitCost,
      });
    }

    let paid = Number(amountPaid);
    if (!Number.isFinite(paid) || paid < 0) paid = 0;
    if (paid > totalAmount) paid = totalAmount;

    await suppliersStore.adjustSupplierBalance(supplier.id, totalAmount - paid);

    const purchase = await purchasesStore.logPurchase({
      supplierId: supplier.id,
      supplierName: supplier.name,
      items: lineItems,
      totalAmount,
      amountPaid: paid,
      loggedBy: req.user.username,
      notes: notes || null,
    });

    if (paid > 0) {
      await cashLedgerStore.logCashEntry({
        type: "disbursement",
        category: "purchase",
        amount: paid,
        description: "Purchase from " + supplier.name,
        recordedBy: req.user.username,
      });
    }

    logActivity(req.user.username, "purchase_logged", { supplier_name: supplier.name, total_amount: Math.round(totalAmount * 100) / 100 });
    res.json({ success: true, purchase });
  } catch (error) {
    console.error("Log purchase error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Unable to log purchase" });
  }
});

// ---------------- Cash Ledger ----------------

router.get("/production/cash-ledger", requireOwner, async (req, res) => {
  try {
    const entries = await cashLedgerStore.getCashEntries(100);
    const balance = entries.reduce((sum, e) => sum + (e.type === "receipt" ? e.amount : -e.amount), 0);
    res.json({ success: true, entries, balance: Math.round(balance * 100) / 100 });
  } catch (error) {
    console.error("Get cash ledger error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load cash ledger" });
  }
});

router.post("/production/cash-ledger", requireOwner, async (req, res) => {
  try {
    const { type, amount, category, description } = req.body || {};
    const amt = Number(amount);
    if (type !== "receipt" && type !== "disbursement") {
      return res.status(400).json({ success: false, error: "type must be 'receipt' or 'disbursement'" });
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, error: "A positive amount is required" });
    }
    const entry = await cashLedgerStore.logCashEntry({
      type,
      category: category || "manual",
      amount: amt,
      description: description || "",
      recordedBy: req.user.username,
    });
    logActivity(req.user.username, "cash_ledger_entry", { type, amount: amt, category: category || "manual" });
    res.json({ success: true, entry });
  } catch (error) {
    console.error("Log cash entry error:", error.message);
    res.status(500).json({ success: false, error: "Unable to log cash entry" });
  }
});

router.VALID_ORDER_STATUSES = VALID_ORDER_STATUSES;

module.exports = router;
