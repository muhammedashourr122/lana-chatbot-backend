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

async function easyOrdersRawPatch(path, body = {}) {
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

// cities: array of { location, cost } — sent to Easy Orders as a single
// comma-separated "location:cost" string, which overwrites the store's
// entire shipping list (there's no documented endpoint to add/patch a
// single city, only to replace the whole set).
async function updateShipping(cities) {
  if (!Array.isArray(cities) || cities.length === 0) {
    throw new Error("cities must be a non-empty array of { location, cost }");
  }

  const citiesString = cities
    .map(({ location, cost }) => `${location}:${cost}`)
    .join(",");

  return easyOrdersRawPatch("/shipping", {
    is_active: true,
    cities: citiesString,
  });
}

async function getProducts(params = {}) {
  return easyOrdersGet("/products/", params);
}

async function getCategories() {
  return easyOrdersGet("/categories/");
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
  getCategories,
  getOrder,
  getOrderByShortId,
  updateOrderStatus,
  addOrderNote,
  updateShipping,
};
