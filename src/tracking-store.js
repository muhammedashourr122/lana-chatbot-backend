const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MAX_EVENTS_PER_ORDER = 20;
const KNOWN_ORDERS_KEY = "known-orders";

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.slice(-9);
}

function key(orderId) {
  return `tracking:${orderId}`;
}

function phoneKey(phone) {
  return `phone-orders:${normalizePhone(phone)}`;
}

async function addTrackingEvent(orderId, event) {
  if (!orderId) throw new Error("orderId is required");

  const entry = {
    ...event,
    timestamp: Date.now(),
  };

  await redis.lpush(key(orderId), JSON.stringify(entry));
  await redis.ltrim(key(orderId), 0, MAX_EVENTS_PER_ORDER - 1);
  await redis.sadd(KNOWN_ORDERS_KEY, orderId);
}

async function getTrackingEvents(orderId) {
  if (!orderId) throw new Error("orderId is required");

  const raw = await redis.lrange(key(orderId), 0, MAX_EVENTS_PER_ORDER - 1);
  return raw
    .map((item) => {
      try {
        return typeof item === "string" ? JSON.parse(item) : item;
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean)
    .reverse(); // oldest first, matches a natural timeline reading order
}

async function getKnownOrderIds() {
  const ids = await redis.smembers(KNOWN_ORDERS_KEY);
  return ids || [];
}

async function indexPhoneToOrder(phone, orderId) {
  if (!phone || !orderId) return;
  await redis.sadd(phoneKey(phone), orderId);
  await redis.sadd(KNOWN_ORDERS_KEY, orderId);
}

async function getOrderIdsForPhone(phone) {
  if (!phone) return [];
  const ids = await redis.smembers(phoneKey(phone));
  return ids || [];
}

module.exports = {
  addTrackingEvent,
  getTrackingEvents,
  getKnownOrderIds,
  indexPhoneToOrder,
  getOrderIdsForPhone,
};
