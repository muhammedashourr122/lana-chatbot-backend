const express = require("express");

const router = express.Router();

router.post("/easyorders", (req, res) => {
  const secret = process.env.EASYORDERS_WEBHOOK_SECRET;

  if (!secret) {
    return res.status(500).json({
      success: false,
      error: "Webhook secret is not configured"
    });
  }

  const receivedSecret = req.headers.secret;

  if (receivedSecret !== secret) {
    return res.status(401).json({
      success: false,
      error: "Invalid webhook secret"
    });
  }

  console.log("=================================");
  console.log("EasyOrders Webhook Received");
  console.log("=================================");
  console.log(JSON.stringify(req.body, null, 2));

  res.json({
    success: true,
    received: true
  });
});

module.exports = router;
