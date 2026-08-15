const express = require("express");
const router = express.Router();

const { getCategories } = require("../easyorders");

router.get("/", async (req, res) => {
  try {
    const data = await getCategories(req.query);

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error(
      "EasyOrders categories error:",
      error.response?.status,
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      error: "Unable to load categories",
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
