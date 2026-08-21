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
          created_at: order ? order.created_at : null,
          delivery: deliveryRow,
        };
      })
    );

    const validRows = rows.filter((r) => r.short_id != null || r.delivery);
    const deliveryRows = validRows.filter((r) => r.delivery);

    const statusCounts = {};
    let revenue = 0;
    validRows.forEach((r) => {
      if (r.status) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      if (typeof r.total_cost === "number") revenue += r.total_cost;
    });

    res.json({
      success: true,
      stats: {
        total_orders: validRows.length,
        revenue,
        status_counts: statusCounts,
      },
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

app.get("/admin/dashboard", (req, res) => {
  const key = String(req.query.key || "");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lana Beauty — Dashboard</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #f6ece7; color: #3a2e2c; margin: 0; padding: 32px 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 32px 0 12px; }
  .sub { color: #8b7d82; font-size: 13px; margin-bottom: 24px; }
  .stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
  .stat-card { background: #fff; border-radius: 12px; padding: 14px 18px; min-width: 140px; flex: 1; }
  .stat-card .num { font-size: 22px; font-weight: 700; color: #6C4452; }
  .stat-card .label { font-size: 12px; color: #8b7d82; margin-top: 2px; }
  .status-pill { display: inline-block; background: #F1E4E8; color: #6C4452; border-radius: 999px; padding: 3px 10px; font-size: 11px; margin: 2px 4px 2px 0; }
  .search-row { display: flex; gap: 8px; max-width: 420px; }
  .search-row input { flex: 1; padding: 10px 14px; border: 1px solid #E5E5EF; border-radius: 10px; font-size: 14px; }
  .search-row button { background: #6C4452; color: #fff; border: none; border-radius: 10px; padding: 10px 20px; font-size: 14px; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; }
  th, td { padding: 10px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid #eee; }
  th { background: #F1E4E8; color: #6C4452; font-weight: 600; }
  tr.attention { background: #fdeaea; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge.ok { background: #e6f4ea; color: #2e7d32; }
  .badge.attn { background: #fbe4e4; color: #c0392b; }
  .empty { text-align: center; padding: 24px; color: #8b7d82; font-size: 13px; }
  .error { text-align: center; padding: 40px; color: #c0392b; }
</style>
</head>
<body>
<h1>Lana Beauty Dashboard</h1>
<p class="sub">All orders that have passed through our order-created, tracking, or Bosta pipelines.</p>

<div class="search-row">
  <input type="text" id="search-input" placeholder="Order number or phone number" />
  <button id="search-btn">Search</button>
</div>
<div id="search-results"></div>

<div id="root">Loading…</div>

<script>
  var DASHBOARD_KEY = ${JSON.stringify(key)};

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
        var html = '<table style="margin:12px 0;"><tr><th>Order #</th><th>Name</th><th>Phone</th><th>Status</th><th>Total</th></tr>';
        data.results.forEach(function (o) {
          html += '<tr><td>#' + o.short_id + '</td><td>' + (o.full_name || '—') + '</td><td>' + (o.phone || '—') +
            '</td><td>' + (o.status || '—') + '</td><td>' + (o.total_cost != null ? o.total_cost + ' EGP' : '—') + '</td></tr>';
        });
        html += '</table>';
        resultsEl.innerHTML = html;
      })
      .catch(function () {
        resultsEl.innerHTML = '<p class="empty">Search failed.</p>';
      });
  });

  fetch("/api/admin/delivery-dashboard?key=" + encodeURIComponent(DASHBOARD_KEY))
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var root = document.getElementById("root");
      if (!data.success) {
        root.innerHTML = '<div class="error">' + (data.error || "Unauthorized") + '</div>';
        return;
      }

      var statsHtml = '<div class="stats-row">' +
        '<div class="stat-card"><div class="num">' + data.stats.total_orders + '</div><div class="label">Total tracked orders</div></div>' +
        '<div class="stat-card"><div class="num">' + data.stats.revenue.toLocaleString() + ' EGP</div><div class="label">Total revenue (tracked)</div></div>' +
        '</div>';
      var statusHtml = '<div style="margin-bottom:24px;">';
      Object.keys(data.stats.status_counts).forEach(function (s) {
        statusHtml += '<span class="status-pill">' + s + ': ' + data.stats.status_counts[s] + '</span>';
      });
      statusHtml += '</div>';

      var deliveryHtml = '<h2>Bosta Delivery Tracking</h2>';
      if (data.all.length === 0) {
        deliveryHtml += '<div class="empty">No orders with Bosta tracking events yet.</div>';
      } else {
        var rows = data.all.slice().sort(function (a, b) {
          return (b.delivery.needs_attention ? 1 : 0) - (a.delivery.needs_attention ? 1 : 0);
        });
        deliveryHtml += '<table><tr><th>Order #</th><th>Status</th><th>Latest Bosta State</th><th>Tracking #</th><th>Hours Since Update</th><th>Flag</th></tr>';
        rows.forEach(function (r) {
          deliveryHtml += '<tr class="' + (r.delivery.needs_attention ? 'attention' : '') + '">' +
            '<td>' + (r.short_id != null ? '#' + r.short_id : r.order_id.slice(0, 8)) + '</td>' +
            '<td>' + (r.status || '—') + '</td>' +
            '<td>' + (r.delivery.latest_state || '—') + '</td>' +
            '<td>' + (r.delivery.tracking_number || '—') + '</td>' +
            '<td>' + r.delivery.hours_since_update + 'h</td>' +
            '<td><span class="badge ' + (r.delivery.needs_attention ? 'attn' : 'ok') + '">' + (r.delivery.needs_attention ? 'Needs attention' : 'OK') + '</span></td>' +
            '</tr>';
        });
        deliveryHtml += '</table>';
      }

      var ordersHtml = '<h2>All Orders</h2>';
      if (data.orders.length === 0) {
        ordersHtml += '<div class="empty">No orders tracked yet.</div>';
      } else {
        var sortedOrders = data.orders.slice().sort(function (a, b) {
          return new Date(b.created_at) - new Date(a.created_at);
        });
        ordersHtml += '<table><tr><th>Order #</th><th>Name</th><th>Status</th><th>Total</th><th>Created</th></tr>';
        sortedOrders.forEach(function (o) {
          var dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString() : '—';
          ordersHtml += '<tr>' +
            '<td>' + (o.short_id != null ? '#' + o.short_id : o.order_id.slice(0, 8)) + '</td>' +
            '<td>' + (o.full_name || '—') + '</td>' +
            '<td>' + (o.status || '—') + '</td>' +
            '<td>' + (o.total_cost != null ? o.total_cost + ' EGP' : '—') + '</td>' +
            '<td>' + dateStr + '</td>' +
            '</tr>';
        });
        ordersHtml += '</table>';
      }

      root.innerHTML = statsHtml + statusHtml + deliveryHtml + ordersHtml;
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


