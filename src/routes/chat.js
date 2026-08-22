const express = require("express");
const { chat } = require("../chat");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const message = req.body?.message;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "message is required",
      });
    }

    const result = await chat(message);
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
