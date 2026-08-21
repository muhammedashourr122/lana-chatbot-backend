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

app.get("/api/admin/delivery-dashboard", async (req, res) => {
  try {
    const key = String(req.query.key || "");
    if (!process.env.ADMIN_DASHBOARD_KEY || key !== process.env.ADMIN_DASHBOARD_KEY) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const orderIds = await getKnownOrderIds();
    const now = Date.now();

    const rows = await Promise.all(
      orderIds.map(async (id) => {
        const events = await getTrackingEvents(id);
        if (events.length === 0) return null;

        const latest = events[events.length - 1];
        const hoursSinceUpdate = (now - latest.timestamp) / (1000 * 60 * 60);

        let order = null;
        try {
          order = await getOrder(id);
        } catch (e) {}

        const status = order ? order.status : null;
        const isTerminal = status && TERMINAL_STATUSES.includes(status);
        const needsAttention =
          ATTENTION_STATES.includes(latest.state) ||
          (!isTerminal && hoursSinceUpdate > STALE_HOURS);

        return {
          order_id: id,
          short_id: order ? order.short_id : null,
          status,
          latest_state: latest.stateName,
          tracking_number: latest.trackingNumber,
          hours_since_update: Math.round(hoursSinceUpdate),
          needs_attention: needsAttention,
        };
      })
    );

    const validRows = rows.filter(Boolean);

    res.json({
      success: true,
      total: validRows.length,
      needs_attention: validRows.filter((r) => r.needs_attention),
      all: validRows,
    });
  } catch (error) {
    console.error("Delivery dashboard error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load dashboard" });
  }
});

app.get("/admin/dashboard", (req, res) => {
  const key = String(req.query.key || "");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lana Beauty — Delivery Dashboard</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #f6ece7; color: #3a2e2c; margin: 0; padding: 32px 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #8b7d82; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; }
  th, td { padding: 10px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid #eee; }
  th { background: #F1E4E8; color: #6C4452; font-weight: 600; }
  tr.attention { background: #fdeaea; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge.ok { background: #e6f4ea; color: #2e7d32; }
  .badge.attn { background: #fbe4e4; color: #c0392b; }
  .empty { text-align: center; padding: 40px; color: #8b7d82; }
  .error { text-align: center; padding: 40px; color: #c0392b; }
</style>
</head>
<body>
<h1>Delivery Dashboard</h1>
<p class="sub">Orders tracked via Bosta — flags anything stuck 48h+ or in an exception state.</p>
<div id="root">Loading…</div>
<script>
  fetch("/api/admin/delivery-dashboard?key=${encodeURIComponent(key)}")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var root = document.getElementById("root");
      if (!data.success) {
        root.innerHTML = '<div class="error">' + (data.error || "Unauthorized") + '</div>';
        return;
      }
      if (data.all.length === 0) {
        root.innerHTML = '<div class="empty">No tracked orders yet.</div>';
        return;
      }
      var rows = data.all.slice().sort(function (a, b) {
        return (b.needs_attention ? 1 : 0) - (a.needs_attention ? 1 : 0);
      });
      var html = '<table><tr><th>Order #</th><th>Status</th><th>Latest Bosta State</th><th>Tracking #</th><th>Hours Since Update</th><th>Flag</th></tr>';
      rows.forEach(function (r) {
        html += '<tr class="' + (r.needs_attention ? 'attention' : '') + '">' +
          '<td>' + (r.short_id != null ? '#' + r.short_id : r.order_id.slice(0, 8)) + '</td>' +
          '<td>' + (r.status || '—') + '</td>' +
          '<td>' + (r.latest_state || '—') + '</td>' +
          '<td>' + (r.tracking_number || '—') + '</td>' +
          '<td>' + r.hours_since_update + 'h</td>' +
          '<td><span class="badge ' + (r.needs_attention ? 'attn' : 'ok') + '">' + (r.needs_attention ? 'Needs attention' : 'OK') + '</span></td>' +
          '</tr>';
      });
      html += '</table>';
      root.innerHTML = html;
    })
    .catch(function () {
      document.getElementById("root").innerHTML = '<div class="error">Failed to load dashboard.</div>';
    });
</script>
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


