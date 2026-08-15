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

module.exports = {
  easyOrdersGet,
  getProducts,
  getCategories,
  getOrder,
};
