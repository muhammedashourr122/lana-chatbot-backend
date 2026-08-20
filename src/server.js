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
const { getTrackingEvents } = require("./tracking-store");

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


