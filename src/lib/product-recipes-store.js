const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "product-recipes";

// { [productId]: [{ materialId, quantityPerUnit }, ...] }
async function getAllRecipes() {
  const raw = await redis.get(KEY);
  if (!raw) return {};
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return {};
  }
}

async function getRecipe(productId) {
  const all = await getAllRecipes();
  return all[productId] || [];
}

async function setRecipe(productId, ingredients) {
  const all = await getAllRecipes();
  all[productId] = ingredients;
  await redis.set(KEY, JSON.stringify(all));
  return all[productId];
}

module.exports = { getAllRecipes, getRecipe, setRecipe };
