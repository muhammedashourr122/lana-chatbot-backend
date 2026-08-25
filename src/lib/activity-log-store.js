const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ACTIVITY_KEY = "activity-log";
const MAX_ENTRIES = 200;

async function logActivity(username, action, details) {
  const entry = { username, action, details: details || null, at: Date.now() };
  try {
    await redis.lpush(ACTIVITY_KEY, JSON.stringify(entry));
    await redis.ltrim(ACTIVITY_KEY, 0, MAX_ENTRIES - 1);
  } catch (e) {
    // Never let logging break the actual action it's attached to.
    console.error("Activity log write failed:", e.message);
  }
}

async function getRecentActivity(limit = 50) {
  const raw = await redis.lrange(ACTIVITY_KEY, 0, limit - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

module.exports = { logActivity, getRecentActivity };
