const express = require("express");
const path = require("path");
const { chat } = require("../chat");

const router = express.Router();

console.log("====================================");
console.log("CHAT ROUTE LOADED");
console.log("ROUTE FILE:", __filename);
console.log("CHAT FILE:", require.resolve("../chat"));
console.log("CHAT EXPORTS:", Object.keys(require("../chat")));
console.log("====================================");

router.post("/", async (req, res) => {
  console.log("====================================");
  console.log("CHAT HTTP REQUEST");
  console.log("BODY:", req.body);
  console.log("MESSAGE:", req.body?.message);
  console.log("====================================");

  try {
    const message = req.body?.message;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "message is required",
      });
    }

    const result = await chat(message);

    console.log("CHAT HTTP RESULT:", {
      intent: result.intent,
      category: result.category,
      count: result.count,
    });

    res.json(result);
  } catch (error) {
    console.error(
      "Chat error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      error: "Unable to process chat message",
    });
  }
});

module.exports = router;
