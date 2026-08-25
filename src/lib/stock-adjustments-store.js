const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "stock-adjustments";
const MAX_ENTRIES = 500;

async function logStockAdjustment(entry) {
  const record = { id: crypto.randomUUID(), createdAt: Date.now(), ...entry };
  await redis.lpush(KEY, JSON.stringify(record));
  await redis.ltrim(KEY, 0, MAX_ENTRIES - 1);
  return record;
}

async function getStockAdjustments(limit = 50) {
  const raw = await redis.lrange(KEY, 0, limit - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

module.exports = { logStockAdjustment, getStockAdjustments };
