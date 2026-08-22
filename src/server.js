require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const webhooksRouter = require("./routes/webhooks");
const catalogRouter = require("./routes/catalog");
const chatRouter = require("./routes/chat");
const adminRouter = require("./routes/admin");
const authRouter = require("./routes/auth");
const { requireSession, meHandler } = authRouter;
const { bootstrapOwnerFromEnv } = require("./lib/users-store");
const { getHomepageContent } = require("./lib/homepage-content-store");

const {
  getProducts,
  getCategories,
  getOrder,
  getOrderByShortId,
} = require("./easyorders");
const {
  getTrackingEvents,
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

// Render terminates TLS at its edge and forwards over plain HTTP
// internally — trusting the proxy makes req.secure reflect the original
// scheme via X-Forwarded-Proto, so the session cookie's Secure flag is
// set correctly in production while still working over plain localhost.
app.set("trust proxy", 1);

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

// Public auth endpoints — must be reachable with no session yet.
app.use("/api/auth", authRouter);
app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin/login.html"));
});

// Everything else under /admin and /api/admin requires a valid session
// cookie (see routes/auth.js — real login page + Redis-backed sessions,
// replacing the old shared HTTP Basic Auth credential).
app.use(["/admin", "/api/admin"], requireSession);

app.use("/api/webhooks", webhooksRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/chat", chatRouter);
app.get("/api/admin/me", meHandler);
app.use("/api/admin", adminRouter);

app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin/dashboard.html"));
});
app.get("/admin/homepage-builder", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin/homepage-builder.html"));
});
app.use("/admin", express.static(path.join(__dirname, "../public/admin")));

// Storefront CSS/JS overrides at a permanent URL — paste these into Easy
// Orders' head-code box ONCE; from then on, editing the files here and
// deploying updates them automatically, no re-upload/re-paste needed.
app.use("/storefront", express.static(path.join(__dirname, "../public/storefront")));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "lana-chatbot-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/homepage-content", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const content = await getHomepageContent();
    res.json({ success: true, content });
  } catch (error) {
    console.error("Homepage content error:", error.message);
    res.status(500).json({ success: false, error: "Unable to load homepage content" });
  }
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

app.get("/admin/packing-slip/:orderId", async (req, res) => {
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

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  res.status(500).json({
    success: false,
    error: error.message,
  });
});

bootstrapOwnerFromEnv().catch((err) => {
  console.error("[BOOTSTRAP] Failed to create owner account:", err.message);
});

app.listen(PORT, () => {
  console.log(`Lana backend running on port ${PORT}`);
});
