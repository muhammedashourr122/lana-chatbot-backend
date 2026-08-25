const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PURCHASES_KEY = "purchases";
const PAYMENTS_KEY = "supplier-payments";
const MAX_ENTRIES = 500;

async function logPurchase(entry) {
  const purchase = { id: crypto.randomUUID(), createdAt: Date.now(), ...entry };
  await redis.lpush(PURCHASES_KEY, JSON.stringify(purchase));
  await redis.ltrim(PURCHASES_KEY, 0, MAX_ENTRIES - 1);
  return purchase;
}

async function getPurchases(limit = 50) {
  const raw = await redis.lrange(PURCHASES_KEY, 0, limit - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

async function logSupplierPayment(entry) {
  const payment = { id: crypto.randomUUID(), createdAt: Date.now(), ...entry };
  await redis.lpush(PAYMENTS_KEY, JSON.stringify(payment));
  await redis.ltrim(PAYMENTS_KEY, 0, MAX_ENTRIES - 1);
  return payment;
}

async function getSupplierPayments(limit = 50) {
  const raw = await redis.lrange(PAYMENTS_KEY, 0, limit - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

module.exports = { logPurchase, getPurchases, logSupplierPayment, getSupplierPayments };
