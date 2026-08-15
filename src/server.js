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
} = require("./easyorders");

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


