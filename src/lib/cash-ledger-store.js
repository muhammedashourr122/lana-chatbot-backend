const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "cash-ledger";
const MAX_ENTRIES = 1000;

// type: "receipt" (cash in) or "disbursement" (cash out)
async function logCashEntry(entry) {
  const record = { id: crypto.randomUUID(), createdAt: Date.now(), ...entry };
  await redis.lpush(KEY, JSON.stringify(record));
  await redis.ltrim(KEY, 0, MAX_ENTRIES - 1);
  return record;
}

async function getCashEntries(limit = 100) {
  const raw = await redis.lrange(KEY, 0, limit - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

module.exports = { logCashEntry, getCashEntries };
