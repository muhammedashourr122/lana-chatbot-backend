const express = require("express");
const router = express.Router();

const { getProducts } = require("../easyorders");

router.get("/", async (req, res) => {
  try {
    const data = await getProducts(req.query);

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error(
      "EasyOrders products error:",
      error.response?.status,
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      error: "Unable to load products",
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
