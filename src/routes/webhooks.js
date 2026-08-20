const express = require("express");
const { updateOrderStatus, addOrderNote } = require("../easyorders");

const router = express.Router();

// Bosta delivery state code -> Easy Orders order status.
// Best-effort mapping from Bosta's published state names; some
// codes (esp. the 21-25 and 40-41 clusters) have overlapping/unclear
// semantics from the docs alone and may need adjustment once real
// webhook traffic confirms behavior.
const BOSTA_STATE_TO_EASYORDERS_STATUS = {
  10: "waiting_for_pickup", // Pickup requested
  11: "waiting_for_pickup", // Waiting for route
  20: "waiting_for_pickup", // Route Assigned
  21: "in_delivery",        // Picked up from business
  22: "returning_from_delivery", // Picking up from consignee (return)
  23: "returning_from_delivery", // Picked up from consignee (return)
  24: "in_delivery",        // Received at warehouse
  25: "in_delivery",        // Fulfilled
  30: "in_delivery",        // In transit between Hubs
  40: "in_delivery",        // Picking up
  41: "in_delivery",        // Picked up
  45: "delivered",          // Delivered
  46: "returning_from_delivery", // Returned to business
  47: "in_delivery",        // Exception (still in progress, flagged)
  48: "canceled",           // Terminated
  49: "canceled",           // Canceled
  60: "returning_from_delivery", // Returned to stock
  100: "canceled",          // Lost
  101: "canceled",          // Damaged
  // 102 Investigation, 103 Awaiting your action, 104 Archived,
  // 105 On hold: intentionally no-op, these need human review.
};

const BOSTA_STATE_NAMES = {
  10: "Pickup requested",
  11: "Waiting for route",
  20: "Route Assigned",
  21: "Picked up from business",
  22: "Picking up from consignee",
  23: "Picked up from consignee",
  24: "Received at warehouse",
  25: "Fulfilled",
  30: "In transit between Hubs",
  40: "Picking up",
  41: "Picked up",
  45: "Delivered",
  46: "Returned to business",
  47: "Exception",
  48: "Terminated",
  49: "Canceled",
  60: "Returned to stock",
  100: "Lost",
  101: "Damaged",
  102: "Investigation",
  103: "Awaiting your action",
  104: "Archived",
  105: "On hold",
};

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

router.post("/bosta", async (req, res) => {
  const secret = process.env.BOSTA_WEBHOOK_SECRET;

  if (secret) {
    const receivedSecret = req.headers["authorization"] || req.headers["bosta-secret"];
    if (receivedSecret !== secret) {
      return res.status(401).json({ success: false, error: "Invalid webhook secret" });
    }
  }

  const { businessReference, state, trackingNumber } = req.body || {};

  console.log("=================================");
  console.log("Bosta Webhook Received");
  console.log("trackingNumber:", trackingNumber, "state:", state, "businessReference:", businessReference);
  console.log("=================================");

  if (!businessReference) {
    console.warn("Bosta webhook missing businessReference — cannot map to an order, ignoring.");
    return res.json({ success: true, received: true, mapped: false });
  }

  const newStatus = BOSTA_STATE_TO_EASYORDERS_STATUS[Number(state)];
  const stateName = BOSTA_STATE_NAMES[Number(state)] || `state ${state}`;

  if (trackingNumber) {
    try {
      const noteText = `Bosta update: ${stateName}. Tracking #${trackingNumber}.`;
      await addOrderNote(businessReference, noteText, "public");
    } catch (error) {
      console.error(
        "Failed to add Bosta tracking note:",
        error.response?.data || error.message
      );
      // Non-fatal — still proceed to try the status update below.
    }
  }

  if (!newStatus) {
    console.log(`Bosta state ${state} has no mapped Easy Orders status — no-op.`);
    return res.json({ success: true, received: true, mapped: false });
  }

  try {
    await updateOrderStatus(businessReference, newStatus);
    console.log(`Order ${businessReference} status updated to "${newStatus}" (Bosta state ${state}).`);
    res.json({ success: true, received: true, mapped: true, status: newStatus });
  } catch (error) {
    console.error(
      "Failed to update Easy Orders status from Bosta webhook:",
      error.response?.data || error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      error: "Failed to update order status",
    });
  }
});

module.exports = router;
