const axios = require("axios");
const { getSettings } = require("./users-store");

const BASE_URL = "https://app.bosta.co/api/v2";

// The key can be rotated from the dashboard's Settings tab (stored in
// Redis) without a redeploy; the env var is only the initial/fallback
// value for when no override has been saved yet.
async function client() {
  const settings = await getSettings();
  const apiKey = settings.bostaApiKey || process.env.BOSTA_API_KEY;
  if (!apiKey) {
    throw new Error("Bosta API key is not configured");
  }
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: apiKey },
    timeout: 15000,
  });
}

// Bosta's AWB endpoint takes its own internal delivery _id, not the
// human-readable tracking number — this looks that id up first.
async function getDeliveryByTrackingNumber(trackingNumber) {
  const http = await client();
  const res = await http.get(`/deliveries/business/${encodeURIComponent(trackingNumber)}`);
  return res.data?.data;
}

// Returns a Buffer of the AWB PDF for one delivery, given its Bosta
// tracking number (as shown in our own order data / Bosta's dashboard).
async function getAwbPdfByTrackingNumber(trackingNumber) {
  const delivery = await getDeliveryByTrackingNumber(trackingNumber);
  if (!delivery?._id) {
    throw new Error("Delivery not found on Bosta");
  }

  const http2 = await client();
  const res = await http2.get("/deliveries/business/awb", {
    params: { lang: "ar", blockUnAutoAssigned: true, ids: delivery._id },
  });

  const base64Pdf = res.data?.data;
  if (!base64Pdf) {
    throw new Error("Bosta did not return an AWB PDF");
  }
  return Buffer.from(base64Pdf, "base64");
}

module.exports = { getDeliveryByTrackingNumber, getAwbPdfByTrackingNumber };
