const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "production-runs";
const MAX_ENTRIES = 500;

async function logProductionRun(entry) {
  const run = { id: crypto.randomUUID(), createdAt: Date.now(), ...entry };
  await redis.lpush(KEY, JSON.stringify(run));
  await redis.ltrim(KEY, 0, MAX_ENTRIES - 1);
  return run;
}

async function getProductionRuns(limit = 50) {
  const raw = await redis.lrange(KEY, 0, limit - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

module.exports = { logProductionRun, getProductionRuns };
