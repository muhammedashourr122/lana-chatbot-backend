const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MAX_EVENTS_PER_ORDER = 20;

function key(orderId) {
  return `tracking:${orderId}`;
}

async function addTrackingEvent(orderId, event) {
  if (!orderId) throw new Error("orderId is required");

  const entry = {
    ...event,
    timestamp: Date.now(),
  };

  await redis.lpush(key(orderId), JSON.stringify(entry));
  await redis.ltrim(key(orderId), 0, MAX_EVENTS_PER_ORDER - 1);
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

module.exports = { addTrackingEvent, getTrackingEvents };
