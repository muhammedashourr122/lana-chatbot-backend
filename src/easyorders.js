const axios = require("axios");

const BASE_URL =
  "https://api.easy-orders.net/api/v1/external-apps";

function getApiKey() {
  const key = process.env.EASYORDERS_API_KEY;

  if (!key) {
    throw new Error("EASYORDERS_API_KEY is missing from .env");
  }

  return key;
}

async function easyOrdersGet(path, params = {}) {
  const response = await axios.get(`${BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      "Api-Key": getApiKey(),
    },
    params,
    timeout: 15000,
  });

  return response.data;
}

async function easyOrdersPatch(path, body = {}) {
  const response = await axios.patch(`${BASE_URL}${path}`, body, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Api-Key": getApiKey(),
    },
    timeout: 15000,
  });

  return response.data;
}

async function easyOrdersPost(path, body = {}) {
  const response = await axios.post(`${BASE_URL}${path}`, body, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Api-Key": getApiKey(),
    },
    timeout: 15000,
  });

  return response.data;
}

// The dashboard fires several admin API calls in parallel on load (Products
// tab, Production Runs, Recipes, Capacity), each of which needs the product
// list. Without coalescing, that's multiple concurrent hits to the same
// Easy Orders endpoint, which risked tripping their rate limit and made
// some of those cards fail with no useful error. Cache by params for a few
// seconds and share in-flight requests so they collapse into one call.
const productsCache = new Map();
const PRODUCTS_CACHE_TTL_MS = 5000;

async function getProducts(params = {}) {
  const cacheKey = JSON.stringify(params);
  const cached = productsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < PRODUCTS_CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = easyOrdersGet("/products/", params).catch((error) => {
    productsCache.delete(cacheKey);
    throw error;
  });
  productsCache.set(cacheKey, { promise, time: Date.now() });
  return promise;
}

// The list endpoint above returns a stripped-down shape — no sale_price,
// description, or categories. Those only show up on this single-product
// endpoint, hence this separate function.
async function getProduct(productId) {
  return easyOrdersGet(`/products/${productId}`);
}

async function getCategories() {
  return easyOrdersGet("/categories/");
}

async function updateProduct(productId, fields) {
  if (!productId) {
    throw new Error("productId is required");
  }
  return easyOrdersPatch(`/products/${productId}`, fields);
}

async function createProduct(fields) {
  return easyOrdersPost("/products", fields);
}

async function createCategory(fields) {
  return easyOrdersPost("/categories", fields);
}

async function getOrder(orderId) {
  if (!orderId) {
    throw new Error("orderId is required");
  }

  return easyOrdersGet(`/orders/${orderId}`);
}

async function getOrderByShortId(shortId) {
  if (!shortId) {
    throw new Error("shortId is required");
  }

  return easyOrdersGet(`/orders/short/${shortId}`);
}

async function updateOrderStatus(orderId, status) {
  if (!orderId) {
    throw new Error("orderId is required");
  }
  if (!status) {
    throw new Error("status is required");
  }

  return easyOrdersPatch(`/orders/${orderId}/status`, { status });
}

async function addOrderNote(orderId, note, type = "public") {
  if (!orderId) {
    throw new Error("orderId is required");
  }
  if (!note) {
    throw new Error("note is required");
  }

  const storeId = process.env.EASYORDERS_STORE_ID;
  if (!storeId) {
    throw new Error("EASYORDERS_STORE_ID is missing from .env");
  }

  return easyOrdersPost("/order-notes", {
    order_id: orderId,
    store_id: storeId,
    note,
    type,
  });
}

module.exports = {
  easyOrdersGet,
  easyOrdersPatch,
  easyOrdersPost,
  getProducts,
  getProduct,
  updateProduct,
  createProduct,
  getCategories,
  createCategory,
  getOrder,
  getOrderByShortId,
  updateOrderStatus,
  addOrderNote,
};
