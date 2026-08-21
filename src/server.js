require("dotenv").config();

const express = require("express");
const cors = require("cors");
const webhooksRouter = require("./routes/webhooks");
const catalogRouter = require("./routes/catalog");
const chatRouter = require("./routes/chat");

const {
  getProducts,
  getCategories,
  getOrder,
  getOrderByShortId,
  updateOrderStatus,
} = require("./easyorders");
const {
  getTrackingEvents,
  getKnownOrderIds,
  indexPhoneToOrder,
  getOrderIdsForPhone,
} = require("./tracking-store");

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  // Compare the last 9 digits so 01222226107, 201222226107,
  // +201222226107, 00201222226107 etc. all match.
  return digits.slice(-9);
}

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  "https://lana-beauty.com",
  "https://www.lana-beauty.com",
  "https://lana-chatbot-backend.onrender.com",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed"));
    },
  })
);

app.use(express.json());

app.use("/api/webhooks", webhooksRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/chat", chatRouter);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "lana-chatbot-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/products", async (req, res) => {
  try {
    const data = await getProducts({
      limit: req.query.limit || 100,
      page: req.query.page || 1,
      categoryId: req.query.category_id,
      sort: req.query.sort,
    });

    res.json(data);
  } catch (error) {
    console.error(
      "Products error:",
      error.response?.data || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      error: "Unable to load products",
    });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const data = await getCategories();

    res.json(data);
  } catch (error) {
    console.error(
      "Categories error:",
      error.response?.data || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      error: "Unable to load categories",
    });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    const data = await getOrder(req.params.id);

    res.json(data);
  } catch (error) {
    console.error(
      "Order error:",
      error.response?.data || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      error: "Unable to load order",
    });
  }
});

app.get("/api/track-order", async (req, res) => {
  try {
    const orderNumber = String(req.query.order_number || "").trim();
    const phone = String(req.query.phone || "").trim();

    if (!orderNumber || !phone) {
      return res.status(400).json({
        success: false,
        error: "order_number and phone are required",
      });
    }

    const order = await getOrderByShortId(orderNumber);

    const genericError = () =>
      res.status(404).json({
        success: false,
        error: "No order found matching that order number and phone number",
      });

    if (!order || !order.id) return genericError();

    if (normalizePhone(order.phone) !== normalizePhone(phone)) {
      return genericError();
    }

    indexPhoneToOrder(order.phone, order.id).catch(function () {});

    res.json({
      success: true,
      order_id: order.id,
    });
  } catch (error) {
    console.error(
      "Track order error:",
      error.response?.data || error.message
    );

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: "No order found matching that order number and phone number",
      });
    }

    res.status(error.response?.status || 500).json({
      success: false,
      error: "Unable to look up order",
    });
  }
});

app.get("/api/tracking-events/:orderId", async (req, res) => {
  try {
    const events = await getTrackingEvents(req.params.orderId);
    res.json({ success: true, events });
  } catch (error) {
    console.error("Tracking events error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load tracking events" });
  }
});

// Returns every order this phone number has looked up before (via
// /api/track-order) or that a Bosta webhook fired for. Only builds up
// over time — a phone that's never triggered either of those won't
// have any history yet.
app.get("/api/orders-by-phone", async (req, res) => {
  try {
    const phone = String(req.query.phone || "").trim();
    if (!phone) {
      return res.status(400).json({ success: false, error: "phone is required" });
    }

    const orderIds = await getOrderIdsForPhone(phone);
    if (orderIds.length === 0) {
      return res.json({ success: true, orders: [] });
    }

    const orders = await Promise.all(
      orderIds.map(async (id) => {
        try {
          const order = await getOrder(id);
          return {
            order_id: order.id,
            short_id: order.short_id,
            status: order.status,
            total_cost: order.total_cost,
            created_at: order.created_at,
          };
        } catch (e) {
          return null;
        }
      })
    );

    const validOrders = orders
      .filter(Boolean)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ success: true, orders: validOrders });
  } catch (error) {
    console.error("Orders by phone error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load orders" });
  }
});

// Private merchant dashboard: flags orders whose latest Bosta event is
// stale (no update in STALE_HOURS) and not in a terminal state, plus
// anything sitting in an exception-type state. Protected by a shared
// secret query param since it's not meant to be public.
const STALE_HOURS = 48;
const TERMINAL_STATUSES = ["delivered", "canceled", "refunded"];
const ATTENTION_STATES = [47, 100, 101, 102, 103, 105]; // Exception, Lost, Damaged, Investigation, Awaiting action, On hold

function checkAdminKey(req, res) {
  const key = String(req.query.key || "");
  if (!process.env.ADMIN_DASHBOARD_KEY || key !== process.env.ADMIN_DASHBOARD_KEY) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

app.get("/api/admin/delivery-dashboard", async (req, res) => {
  try {
    if (!checkAdminKey(req, res)) return;

    const orderIds = await getKnownOrderIds();
    const now = Date.now();

    // Every known order gets an overview row (status/total), and
    // separately a delivery row if it has Bosta tracking events.
    const rows = await Promise.all(
      orderIds.map(async (id) => {
        let order = null;
        try {
          order = await getOrder(id);
        } catch (e) {}

        const events = await getTrackingEvents(id);
        const status = order ? order.status : null;

        let deliveryRow = null;
        if (events.length > 0) {
          const latest = events[events.length - 1];
          const hoursSinceUpdate = (now - latest.timestamp) / (1000 * 60 * 60);
          const isTerminal = status && TERMINAL_STATUSES.includes(status);
          const needsAttention =
            ATTENTION_STATES.includes(latest.state) ||
            (!isTerminal && hoursSinceUpdate > STALE_HOURS);

          deliveryRow = {
            latest_state: latest.stateName,
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
          delivery: deliveryRow,
        };
      })
    );

    const validRows = rows.filter((r) => r.short_id != null || r.delivery);
    const deliveryRows = validRows.filter((r) => r.delivery);

    const statusCounts = {};
    const govCounts = {};
    const productCounts = {};
    const repeatPhones = new Set();
    let revenue = 0;

    validRows.forEach((r) => {
      if (r.status) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      if (typeof r.total_cost === "number") revenue += r.total_cost;
      if (r.government) govCounts[r.government] = (govCounts[r.government] || 0) + 1;
      if (r.orders_count > 1 && r.phone) repeatPhones.add(r.phone);

      (r.cart_items || []).forEach((item) => {
        const name = item?.product?.name;
        if (!name) return;
        productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
      });
    });

    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, qty]) => ({ name, qty }));

    const governorates = Object.entries(govCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Revenue by day, last 30 days, for the trend chart.
    const revenueByDay = {};
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    validRows.forEach((r) => {
      if (!r.created_at || typeof r.total_cost !== "number") return;
      const t = new Date(r.created_at).getTime();
      if (t < thirtyDaysAgo) return;
      const day = r.created_at.slice(0, 10); // YYYY-MM-DD
      revenueByDay[day] = (revenueByDay[day] || 0) + r.total_cost;
    });
    const revenueTrend = Object.entries(revenueByDay)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, total]) => ({ day, total }));

    // Orders stuck in pending/pending_payment for 24h+ — never even
    // dispatched, separate from Bosta-tracked delivery delays.
    const PENDING_STALE_HOURS = 24;
    const stuckPayments = validRows.filter((r) => {
      if (!["pending", "pending_payment"].includes(r.status)) return false;
      if (!r.created_at) return false;
      const hours = (now - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
      return hours > PENDING_STALE_HOURS;
    }).map((r) => ({
      order_id: r.order_id,
      short_id: r.short_id,
      full_name: r.full_name,
      phone: r.phone,
      status: r.status,
      total_cost: r.total_cost,
      hours_pending: Math.round((now - new Date(r.created_at).getTime()) / (1000 * 60 * 60)),
    }));

    res.json({
      success: true,
      stats: {
        total_orders: validRows.length,
        revenue,
        avg_order_value: validRows.length ? Math.round(revenue / validRows.length) : 0,
        repeat_customers: repeatPhones.size,
        status_counts: statusCounts,
      },
      top_products: topProducts,
      governorates,
      revenue_trend: revenueTrend,
      stuck_payments: stuckPayments,
      total: deliveryRows.length,
      needs_attention: deliveryRows.filter((r) => r.delivery.needs_attention),
      all: deliveryRows,
      orders: validRows,
    });
  } catch (error) {
    console.error("Delivery dashboard error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load dashboard" });
  }
});

app.get("/api/admin/search", async (req, res) => {
  try {
    if (!checkAdminKey(req, res)) return;

    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ success: false, error: "q is required" });

    // If it looks like a phone number, search by phone. Otherwise treat
    // it as an order short id.
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

// All orders + lifetime spend for one phone number — same order index
// used for the customer-facing "all my orders" feature, just richer.
app.get("/api/admin/customer", async (req, res) => {
  try {
    if (!checkAdminKey(req, res)) return;

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

const VALID_ORDER_STATUSES = [
  "pending", "confirmed", "pending_payment", "paid", "paid_failed",
  "processing", "waiting_for_pickup", "in_delivery", "delivered",
  "canceled", "returning_from_delivery", "request_refund",
  "refund_in_progress", "refunded",
];

app.post("/api/admin/update-status", async (req, res) => {
  try {
    if (!checkAdminKey(req, res)) return;

    const { order_id, status } = req.body || {};
    if (!order_id || !status) {
      return res.status(400).json({ success: false, error: "order_id and status are required" });
    }
    if (!VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    await updateOrderStatus(order_id, status);
    res.json({ success: true });
  } catch (error) {
    console.error("Admin status update error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ success: false, error: "Failed to update status" });
  }
});

app.get("/admin/packing-slip/:orderId", async (req, res) => {
  const key = String(req.query.key || "");
  if (!process.env.ADMIN_DASHBOARD_KEY || key !== process.env.ADMIN_DASHBOARD_KEY) {
    return res.status(401).send("Unauthorized");
  }

  let order;
  try {
    order = await getOrder(req.params.orderId);
  } catch (error) {
    return res.status(404).send("Order not found");
  }

  const itemsRows = (order.cart_items || [])
    .map((item) => {
      const name = item.product ? item.product.name : "Item";
      return '<tr><td>' + name + '</td><td>' + item.quantity + '</td><td>' + item.price + ' EGP</td></tr>';
    })
    .join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Packing Slip — Order #${order.short_id}</title>
<style>
  body { font-family: -apple-system, sans-serif; color: #222; margin: 0; padding: 40px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
  .row { display: flex; gap: 40px; margin-bottom: 24px; }
  .row div { flex: 1; }
  .row span { display: block; color: #999; font-size: 11px; text-transform: uppercase; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #ddd; font-size: 13px; }
  th { color: #999; font-size: 11px; text-transform: uppercase; }
  .total { text-align: right; font-size: 15px; font-weight: 700; margin-top: 14px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>Lana Beauty — Packing Slip</h1>
<p class="sub">Order #${order.short_id} — ${new Date(order.created_at).toLocaleDateString()}</p>

<div class="row">
  <div><span>Ship To</span>${order.full_name || "—"}<br>${order.address || "—"}<br>${order.government || "—"}</div>
  <div><span>Phone</span>${order.phone || "—"}<br><span style="margin-top:8px;">Payment</span>${order.payment_method || "—"}</div>
</div>

<table>
<tr><th>Item</th><th>Qty</th><th>Price</th></tr>
${itemsRows}
</table>
<div class="total">Total: ${order.total_cost} EGP</div>

<script>window.onload = function() { window.print(); };</script>
</body>
</html>`);
});

app.get("/admin/dashboard", (req, res) => {
  const key = String(req.query.key || "");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lana Beauty — Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #3a2e2c; --muted: #8b7d82; --paper: #f6ece7; --card: #ffffff;
    --accent: #6C4452; --accent-soft: #F1E4E8; --border: #ece1dc;
    --ok-bg: #e6f4ea; --ok-text: #2e7d32; --danger-bg: #fbe4e4; --danger-text: #c0392b;
    --radius: 14px; --shadow: 0 1px 3px rgba(58,46,44,0.06), 0 1px 2px rgba(58,46,44,0.04);
  }
  * { box-sizing: border-box; }
  body { font-family: "Inter", -apple-system, sans-serif; background: var(--paper); color: var(--ink); margin: 0; }
  .page { max-width: 1200px; margin: 0 auto; padding: 0 20px 60px; }
  .topbar {
    position: sticky; top: 0; z-index: 20; background: rgba(246,236,231,0.92); backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border); padding: 18px 20px; margin-bottom: 24px;
  }
  .topbar-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 18px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
  .sub { color: var(--muted); font-size: 12px; margin: 2px 0 0; }
  h2 { font-size: 14px; font-weight: 600; margin: 0 0 14px; color: var(--ink); }
  .section-card { background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; margin-bottom: 20px; }
  .stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .stat-card { background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px 20px; min-width: 150px; flex: 1; border-left: 3px solid var(--accent); }
  .stat-card .num { font-size: 24px; font-weight: 700; color: var(--accent); letter-spacing: -0.02em; }
  .stat-card .label { font-size: 12px; color: var(--muted); margin-top: 3px; }
  .status-pill { display: inline-block; background: var(--accent-soft); color: var(--accent); border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 600; margin: 2px 4px 2px 0; }
  .search-row { display: flex; gap: 8px; min-width: 260px; flex: 1; max-width: 420px; }
  .search-row input { flex: 1; padding: 9px 14px; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; font-family: inherit; background: var(--card); }
  .search-row input:focus { outline: none; border-color: var(--accent); }
  .search-row button { background: var(--accent); color: #fff; border: none; border-radius: 10px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
  .search-row button:hover { opacity: 0.88; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 11px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:last-child td { border-bottom: none; }
  tr.attention { background: #fdf3f3; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge.ok { background: var(--ok-bg); color: var(--ok-text); }
  .badge.attn { background: var(--danger-bg); color: var(--danger-text); }
  .empty { text-align: center; padding: 28px; color: var(--muted); font-size: 13px; }
  .error { text-align: center; padding: 40px; color: var(--danger-text); background: var(--card); border-radius: var(--radius); }
  .action-link { color: var(--accent); text-decoration: none; margin-right: 12px; font-size: 12px; font-weight: 500; }
  .action-link:hover { text-decoration: underline; }
  .two-col { display: flex; gap: 20px; flex-wrap: wrap; }
  .two-col > div { flex: 1; min-width: 260px; }
  #export-btn { background: var(--card); border: 1px solid var(--accent); color: var(--accent); border-radius: 8px; padding: 7px 16px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  #export-btn:hover { background: var(--accent-soft); }
  #refresh-note { font-size: 11px; color: var(--muted); }
  .controls-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; font-size: 13px; }
  .controls-row select { padding: 7px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; font-family: inherit; background: var(--card); }
  .controls-row label { display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--muted); font-size: 12px; }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: var(--accent); }
  th.sortable .arrow { opacity: 0.6; font-size: 9px; margin-left: 3px; }
  tr.order-row { cursor: pointer; transition: background 0.1s; }
  tr.order-row:hover { background: #fbf6f3; }
  tr.detail-row td { background: var(--paper); padding: 16px; }
  tr.detail-row .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 12px; }
  tr.detail-row .detail-grid div span { display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
  .status-select { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 12px; margin-right: 8px; font-family: inherit; background: #fff; }
  .status-btn { background: var(--accent); color: #fff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer; }
  .table-scroll { overflow-x: auto; }
  .skeleton { background: linear-gradient(90deg, var(--accent-soft) 25%, #f7ecec 37%, var(--accent-soft) 63%); background-size: 400% 100%; animation: shimmer 1.4s ease infinite; border-radius: var(--radius); height: 60px; }
  @keyframes shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
  @media (max-width: 700px) {
    table, thead, tbody, th, td, tr { display: block; }
    thead tr { position: absolute; top: -9999px; left: -9999px; }
    table tr:not(.detail-row) { border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; padding: 6px 0; }
    table td { border: none; position: relative; padding-left: 46%; }
    table td:before {
      position: absolute; left: 14px; width: 40%; white-space: nowrap;
      content: attr(data-label); font-weight: 600; color: var(--accent); font-size: 11px;
    }
    tr.detail-row td { padding-left: 14px; }
    tr.detail-row td:before { content: none; }
  }
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-inner">
    <div>
      <h1>Lana Beauty Dashboard</h1>
      <p class="sub">Orders tracked via order-created, lookup, and Bosta pipelines <span id="refresh-note"></span></p>
    </div>
    <div class="search-row">
      <input type="text" id="search-input" placeholder="Order number or phone number" />
      <button id="search-btn">Search</button>
    </div>
  </div>
</div>

<div class="page">
<div id="search-results"></div>
<div id="customer-panel" style="display:none;margin-bottom:20px;"></div>

<div id="root"><div class="skeleton"></div></div>

<script>
  var DASHBOARD_KEY = ${JSON.stringify(key)};
  var lastData = null;
  var state = {
    dateRange: "all",
    sortKey: "created_at",
    sortDir: "desc",
    attentionOnly: false,
    expandedOrderId: null,
  };

  function withinDateRange(dateStr) {
    if (state.dateRange === "all" || !dateStr) return true;
    var days = state.dateRange === "today" ? 1 : state.dateRange === "7d" ? 7 : 30;
    var cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return new Date(dateStr).getTime() >= cutoff;
  }

  function callLink(phone) {
    if (!phone) return '—';
    return '<a class="action-link" href="tel:' + phone + '">Call</a>' +
      '<a class="action-link" href="https://wa.me/' + phone.replace(/\\D/g, '') + '" target="_blank" rel="noreferrer">WhatsApp</a>';
  }

  function trackLink(orderId) {
    return '<a class="action-link" href="https://www.lana-beauty.com/track/' + orderId + '" target="_blank" rel="noreferrer">Track page</a>';
  }

  function printLink(orderId) {
    return '<a class="action-link" href="/admin/packing-slip/' + orderId + '?key=' + encodeURIComponent(DASHBOARD_KEY) + '" target="_blank" rel="noreferrer">Print slip</a>';
  }

  function customerLink(phone) {
    if (!phone) return '';
    return '<a class="action-link customer-link" href="#" data-phone="' + phone + '">Customer</a>';
  }

  function openCustomerPanel(phone) {
    var panel = document.getElementById("customer-panel");
    panel.style.display = "block";
    panel.innerHTML = '<div class="section-card"><p class="empty">Loading…</p></div>';
    panel.scrollIntoView({ behavior: "smooth", block: "center" });

    fetch("/api/admin/customer?key=" + encodeURIComponent(DASHBOARD_KEY) + "&phone=" + encodeURIComponent(phone))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) {
          panel.innerHTML = '<div class="section-card"><p class="empty">Could not load customer.</p></div>';
          return;
        }
        var html = '<div class="section-card">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
            '<h2 style="margin:0;">' + (data.full_name || phone) + '</h2>' +
            '<button id="customer-close" style="background:none;border:none;color:#8b7d82;cursor:pointer;font-size:13px;">Close ✕</button>' +
          '</div>' +
          '<div class="stats-row" style="margin-bottom:16px;">' +
            '<div class="stat-card"><div class="num">' + data.order_count + '</div><div class="label">Orders</div></div>' +
            '<div class="stat-card"><div class="num">' + data.lifetime_value.toLocaleString() + ' EGP</div><div class="label">Lifetime value</div></div>' +
          '</div>' +
          '<div class="table-scroll"><table><tr><th>Order #</th><th>Status</th><th>Total</th><th>Date</th></tr>';
        data.orders.forEach(function (o) {
          html += '<tr><td data-label="Order #">#' + o.short_id + '</td><td data-label="Status">' + (o.status || '—') +
            '</td><td data-label="Total">' + (o.total_cost != null ? o.total_cost + ' EGP' : '—') +
            '</td><td data-label="Date">' + (o.created_at ? new Date(o.created_at).toLocaleDateString() : '—') + '</td></tr>';
        });
        html += '</table></div></div>';
        panel.innerHTML = html;
        document.getElementById("customer-close").addEventListener("click", function () {
          panel.style.display = "none";
          panel.innerHTML = "";
        });
      })
      .catch(function () {
        panel.innerHTML = '<div class="section-card"><p class="empty">Failed to load customer.</p></div>';
      });
  }

  document.addEventListener("click", function (e) {
    var link = e.target.closest(".customer-link");
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    openCustomerPanel(link.getAttribute("data-phone"));
  });

  function exportCsv() {
    if (!lastData) return;
    var rows = [["Order #", "Name", "Phone", "Status", "Total", "Governorate", "Created"]];
    lastData.orders.forEach(function (o) {
      rows.push([
        o.short_id || "", o.full_name || "", o.phone || "", o.status || "",
        o.total_cost || "", o.government || "", o.created_at || "",
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "lana-orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById("search-btn").addEventListener("click", function () {
    var q = document.getElementById("search-input").value.trim();
    var resultsEl = document.getElementById("search-results");
    if (!q) { resultsEl.innerHTML = ""; return; }

    resultsEl.innerHTML = '<p class="empty">Searching…</p>';

    fetch("/api/admin/search?key=" + encodeURIComponent(DASHBOARD_KEY) + "&q=" + encodeURIComponent(q))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success || data.results.length === 0) {
          resultsEl.innerHTML = '<p class="empty">No matching orders.</p>';
          return;
        }
        var html = '<div class="section-card" style="margin-top:-8px;"><div class="table-scroll"><table><tr><th>Order #</th><th>Name</th><th>Phone</th><th>Status</th><th>Total</th><th>Actions</th></tr>';
        data.results.forEach(function (o) {
          html += '<tr><td data-label="Order #">#' + o.short_id + '</td><td data-label="Name">' + (o.full_name || '—') + '</td><td data-label="Phone">' + (o.phone || '—') +
            '</td><td data-label="Status">' + (o.status || '—') + '</td><td data-label="Total">' + (o.total_cost != null ? o.total_cost + ' EGP' : '—') +
            '</td><td data-label="Actions">' + callLink(o.phone) + trackLink(o.order_id) + printLink(o.order_id) + customerLink(o.phone) + '</td></tr>';
        });
        html += '</table></div></div>';
        resultsEl.innerHTML = html;
      })
      .catch(function () {
        resultsEl.innerHTML = '<p class="empty">Search failed.</p>';
      });
  });

  function renderFromCache() {
    if (lastData) renderDashboard(lastData);
  }

  function renderDashboard(data) {
        var root = document.getElementById("root");
        if (!data.success) {
          root.innerHTML = '<div class="error">' + (data.error || "Unauthorized") + '</div>';
          return;
        }
        lastData = data;

        var statsHtml = '<div class="stats-row">' +
          '<div class="stat-card"><div class="num">' + data.stats.total_orders + '</div><div class="label">Total tracked orders</div></div>' +
          '<div class="stat-card"><div class="num">' + data.stats.revenue.toLocaleString() + ' EGP</div><div class="label">Total revenue</div></div>' +
          '<div class="stat-card"><div class="num">' + data.stats.avg_order_value.toLocaleString() + ' EGP</div><div class="label">Avg order value</div></div>' +
          '<div class="stat-card"><div class="num">' + data.stats.repeat_customers + '</div><div class="label">Repeat customers</div></div>' +
          '</div>';
        var statusHtml = '<div class="section-card" style="padding:14px 20px;">';
        Object.keys(data.stats.status_counts).forEach(function (s) {
          statusHtml += '<span class="status-pill">' + s + ': ' + data.stats.status_counts[s] + '</span>';
        });
        statusHtml += '</div>';

        var revenueChartHtml = '<div class="section-card"><h2>Revenue — Last 30 Days</h2>';
        if (!data.revenue_trend || data.revenue_trend.length === 0) {
          revenueChartHtml += '<div class="empty">No revenue data yet.</div>';
        } else {
          var maxRevenue = Math.max.apply(null, data.revenue_trend.map(function (d) { return d.total; }));
          revenueChartHtml += '<div style="display:flex;align-items:flex-end;gap:3px;height:120px;overflow-x:auto;padding-top:8px;">';
          data.revenue_trend.forEach(function (d) {
            var pct = maxRevenue ? Math.max((d.total / maxRevenue) * 100, 3) : 3;
            var dayLabel = d.day.slice(5); // MM-DD
            revenueChartHtml += '<div title="' + dayLabel + ': ' + d.total.toLocaleString() + ' EGP" ' +
              'style="flex:0 0 18px;height:' + pct + '%;background:#6C4452;border-radius:3px 3px 0 0;"></div>';
          });
          revenueChartHtml += '</div>';
        }
        revenueChartHtml += '</div>';

        var stuckPaymentsHtml = '';
        if (data.stuck_payments && data.stuck_payments.length > 0) {
          stuckPaymentsHtml = '<div class="section-card"><h2>Stuck Payments (' + data.stuck_payments.length + ')</h2>' +
            '<p class="sub" style="margin-bottom:12px;">Orders pending 24h+ that were never dispatched.</p>' +
            '<div class="table-scroll"><table><tr><th>Order #</th><th>Name</th><th>Status</th><th>Total</th><th>Hours Pending</th><th>Actions</th></tr>';
          data.stuck_payments.forEach(function (p) {
            stuckPaymentsHtml += '<tr class="attention">' +
              '<td data-label="Order #">#' + p.short_id + '</td>' +
              '<td data-label="Name">' + (p.full_name || '—') + '</td>' +
              '<td data-label="Status">' + p.status + '</td>' +
              '<td data-label="Total">' + (p.total_cost != null ? p.total_cost + ' EGP' : '—') + '</td>' +
              '<td data-label="Pending">' + p.hours_pending + 'h</td>' +
              '<td data-label="Actions">' + callLink(p.phone) + '</td>' +
              '</tr>';
          });
          stuckPaymentsHtml += '</table></div></div>';
        }

        var topProductsHtml = '<div class="section-card"><h2>Top Products</h2>';
        if (data.top_products.length === 0) {
          topProductsHtml += '<div class="empty">No product data yet.</div>';
        } else {
          topProductsHtml += '<div class="table-scroll"><table><tr><th>Product</th><th>Qty Sold</th></tr>';
          data.top_products.forEach(function (p) {
            topProductsHtml += '<tr><td data-label="Product">' + p.name + '</td><td data-label="Qty">' + p.qty + '</td></tr>';
          });
          topProductsHtml += '</table></div>';
        }
        topProductsHtml += '</div>';

        var govHtml = '<div class="section-card"><h2>Governorates</h2>';
        if (data.governorates.length === 0) {
          govHtml += '<div class="empty">No location data yet.</div>';
        } else {
          govHtml += '<div class="table-scroll"><table><tr><th>Governorate</th><th>Orders</th></tr>';
          data.governorates.forEach(function (g) {
            govHtml += '<tr><td data-label="Governorate">' + g.name + '</td><td data-label="Orders">' + g.count + '</td></tr>';
          });
          govHtml += '</table></div>';
        }
        govHtml += '</div>';

        var deliveryOrders = data.all.filter(function (r) {
          return withinDateRange(r.created_at) && (!state.attentionOnly || r.delivery.needs_attention);
        });

        var deliveryHtml = '<div class="section-card"><h2>Bosta Delivery Tracking</h2>' +
          '<div class="controls-row">' +
            '<label><input type="checkbox" id="attention-filter" ' + (state.attentionOnly ? 'checked' : '') + ' /> Needs attention only</label>' +
          '</div>';
        if (deliveryOrders.length === 0) {
          deliveryHtml += '<div class="empty">No matching orders.</div>';
        } else {
          var rows = deliveryOrders.slice().sort(function (a, b) {
            return (b.delivery.needs_attention ? 1 : 0) - (a.delivery.needs_attention ? 1 : 0);
          });
          deliveryHtml += '<div class="table-scroll"><table><tr><th>Order #</th><th>Status</th><th>Latest Bosta State</th><th>Tracking #</th><th>Hours Since Update</th><th>Flag</th></tr>';
          rows.forEach(function (r) {
            deliveryHtml += '<tr class="' + (r.delivery.needs_attention ? 'attention' : '') + '">' +
              '<td data-label="Order #">' + (r.short_id != null ? '#' + r.short_id : r.order_id.slice(0, 8)) + '</td>' +
              '<td data-label="Status">' + (r.status || '—') + '</td>' +
              '<td data-label="Latest State">' + (r.delivery.latest_state || '—') + '</td>' +
              '<td data-label="Tracking #">' + (r.delivery.tracking_number || '—') + '</td>' +
              '<td data-label="Updated">' + r.delivery.hours_since_update + 'h ago</td>' +
              '<td data-label="Flag"><span class="badge ' + (r.delivery.needs_attention ? 'attn' : 'ok') + '">' + (r.delivery.needs_attention ? 'Needs attention' : 'OK') + '</span></td>' +
              '</tr>';
          });
          deliveryHtml += '</table></div>';
        }
        deliveryHtml += '</div>';

        var filteredOrders = data.orders.filter(function (o) {
          return withinDateRange(o.created_at);
        });

        var sortKeyFns = {
          created_at: function (o) { return new Date(o.created_at || 0).getTime(); },
          short_id: function (o) { return o.short_id || 0; },
          total_cost: function (o) { return o.total_cost || 0; },
          status: function (o) { return o.status || ""; },
          full_name: function (o) { return o.full_name || ""; },
        };
        var sortFn = sortKeyFns[state.sortKey] || sortKeyFns.created_at;
        var sortedOrders = filteredOrders.slice().sort(function (a, b) {
          var av = sortFn(a), bv = sortFn(b);
          var cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return state.sortDir === "asc" ? cmp : -cmp;
        });

        function sortArrow(key) {
          if (state.sortKey !== key) return "";
          return '<span class="arrow">' + (state.sortDir === "asc" ? "▲" : "▼") + '</span>';
        }

        var ordersHtml = '<div class="section-card"><h2>All Orders (' + filteredOrders.length + ')</h2>' +
          '<div class="controls-row">' +
            '<select id="date-range-select">' +
              '<option value="all"' + (state.dateRange === "all" ? " selected" : "") + '>All time</option>' +
              '<option value="today"' + (state.dateRange === "today" ? " selected" : "") + '>Today</option>' +
              '<option value="7d"' + (state.dateRange === "7d" ? " selected" : "") + '>Last 7 days</option>' +
              '<option value="30d"' + (state.dateRange === "30d" ? " selected" : "") + '>Last 30 days</option>' +
            '</select>' +
            '<button id="export-btn">Export CSV</button>' +
          '</div>';
        if (filteredOrders.length === 0) {
          ordersHtml += '<div class="empty">No orders in this range.</div>';
        } else {
          ordersHtml += '<div class="table-scroll"><table><tr>' +
            '<th class="sortable" data-sort="short_id">Order #' + sortArrow("short_id") + '</th>' +
            '<th class="sortable" data-sort="full_name">Name' + sortArrow("full_name") + '</th>' +
            '<th class="sortable" data-sort="status">Status' + sortArrow("status") + '</th>' +
            '<th class="sortable" data-sort="total_cost">Total' + sortArrow("total_cost") + '</th>' +
            '<th class="sortable" data-sort="created_at">Created' + sortArrow("created_at") + '</th>' +
            '<th>Actions</th></tr>';
          sortedOrders.forEach(function (o) {
            var dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString() : '—';
            var isExpanded = state.expandedOrderId === o.order_id;
            ordersHtml += '<tr class="order-row" data-order-id="' + o.order_id + '">' +
              '<td data-label="Order #">' + (o.short_id != null ? '#' + o.short_id : o.order_id.slice(0, 8)) + '</td>' +
              '<td data-label="Name">' + (o.full_name || '—') + '</td>' +
              '<td data-label="Status">' + (o.status || '—') + '</td>' +
              '<td data-label="Total">' + (o.total_cost != null ? o.total_cost + ' EGP' : '—') + '</td>' +
              '<td data-label="Created">' + dateStr + '</td>' +
              '<td data-label="Actions">' + callLink(o.phone) + trackLink(o.order_id) + printLink(o.order_id) + customerLink(o.phone) + '</td>' +
              '</tr>';

            if (isExpanded) {
              var itemsHtml = (o.cart_items || []).map(function (item) {
                var name = item.product ? item.product.name : "Item";
                return name + ' × ' + item.quantity + ' (' + item.price + ' EGP)';
              }).join("<br>") || "—";

              var statusOptionsHtml = ${JSON.stringify(VALID_ORDER_STATUSES)}.map(function (s) {
                return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + s + '</option>';
              }).join("");

              ordersHtml += '<tr class="detail-row"><td colspan="6">' +
                '<div class="detail-grid">' +
                  '<div><span>Phone</span>' + (o.phone || '—') + '</div>' +
                  '<div><span>Governorate</span>' + (o.government || '—') + '</div>' +
                  '<div><span>Address</span>' + (o.address || '—') + '</div>' +
                  '<div><span>Payment</span>' + (o.payment_method || '—') + '</div>' +
                  '<div><span>Shipping</span>' + (o.shipping_cost != null ? o.shipping_cost + ' EGP' : '—') + '</div>' +
                '</div>' +
                '<div style="margin-bottom:10px;"><span style="display:block;color:#8b7d82;font-size:11px;">Items</span>' + itemsHtml + '</div>' +
                '<div>' +
                  '<select class="status-select" data-order-id="' + o.order_id + '">' + statusOptionsHtml + '</select>' +
                  '<button class="status-btn" data-order-id="' + o.order_id + '">Update Status</button>' +
                  '<span class="status-msg" data-order-id="' + o.order_id + '" style="margin-left:8px;font-size:12px;"></span>' +
                '</div>' +
              '</td></tr>';
            }
          });
          ordersHtml += '</table></div>';
        }
        ordersHtml += '</div>';

        root.innerHTML = statsHtml + statusHtml + revenueChartHtml + stuckPaymentsHtml +
          '<div class="two-col">' + topProductsHtml + govHtml + '</div>' +
          deliveryHtml + ordersHtml;

        document.getElementById("export-btn").addEventListener("click", exportCsv);

        document.getElementById("date-range-select").addEventListener("change", function (e) {
          state.dateRange = e.target.value;
          renderFromCache();
        });

        var attentionCheckbox = document.getElementById("attention-filter");
        if (attentionCheckbox) {
          attentionCheckbox.addEventListener("change", function (e) {
            state.attentionOnly = e.target.checked;
            renderFromCache();
          });
        }

        document.querySelectorAll("th.sortable").forEach(function (th) {
          th.addEventListener("click", function () {
            var key = th.getAttribute("data-sort");
            if (state.sortKey === key) {
              state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
            } else {
              state.sortKey = key;
              state.sortDir = "asc";
            }
            renderFromCache();
          });
        });

        document.querySelectorAll("tr.order-row").forEach(function (tr) {
          tr.addEventListener("click", function (e) {
            if (e.target.closest(".action-link")) return;
            var id = tr.getAttribute("data-order-id");
            state.expandedOrderId = state.expandedOrderId === id ? null : id;
            renderFromCache();
          });
        });

        document.querySelectorAll(".status-btn").forEach(function (btn) {
          btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var orderId = btn.getAttribute("data-order-id");
            var select = document.querySelector('.status-select[data-order-id="' + orderId + '"]');
            var msg = document.querySelector('.status-msg[data-order-id="' + orderId + '"]');
            var newStatus = select.value;

            btn.disabled = true;
            msg.textContent = "Updating…";
            msg.style.color = "#8b7d82";

            fetch("/api/admin/update-status?key=" + encodeURIComponent(DASHBOARD_KEY), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ order_id: orderId, status: newStatus }),
            })
              .then(function (res) { return res.json(); })
              .then(function (data) {
                btn.disabled = false;
                if (data.success) {
                  msg.textContent = "Updated!";
                  msg.style.color = "#2e7d32";
                  loadDashboard();
                } else {
                  msg.textContent = data.error || "Failed.";
                  msg.style.color = "#c0392b";
                }
              })
              .catch(function () {
                btn.disabled = false;
                msg.textContent = "Failed.";
                msg.style.color = "#c0392b";
              });
          });
        });
  }

  function loadDashboard() {
    fetch("/api/admin/delivery-dashboard?key=" + encodeURIComponent(DASHBOARD_KEY))
      .then(function (res) { return res.json(); })
      .then(renderDashboard)
      .catch(function () {
        document.getElementById("root").innerHTML = '<div class="error">Failed to load dashboard.</div>';
      });
  }

  loadDashboard();

  var refreshCount = 0;
  setInterval(function () {
    loadDashboard();
    refreshCount++;
    document.getElementById("refresh-note").textContent =
      "· Last refreshed " + new Date().toLocaleTimeString();
  }, 30000);
</script>
</div><!-- /.page -->
</body>
</html>`);
});

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  res.status(500).json({
    success: false,
    error: error.message,
  });
});

app.listen(PORT, () => {
  console.log(`Lana backend running on port ${PORT}`);
});


