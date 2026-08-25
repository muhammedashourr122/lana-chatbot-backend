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
  return getAwbPdfByTrackingNumbers([trackingNumber]);
}

// Same, but for several deliveries at once — Bosta's own AWB endpoint
// accepts a comma-separated `ids` list and returns one combined PDF.
async function getAwbPdfByTrackingNumbers(trackingNumbers) {
  const deliveries = await Promise.all(trackingNumbers.map((tn) => getDeliveryByTrackingNumber(tn)));
  const ids = deliveries.filter(Boolean).map((d) => d._id);
  if (ids.length === 0) {
    throw new Error("None of these deliveries were found on Bosta");
  }

  const http = await client();
  const res = await http.get("/deliveries/business/awb", {
    params: { lang: "ar", blockUnAutoAssigned: true, ids: ids.join(",") },
  });

  const base64Pdf = res.data?.data;
  if (!base64Pdf) {
    throw new Error("Bosta did not return an AWB PDF");
  }
  return Buffer.from(base64Pdf, "base64");
}

// Account-wide — this Bosta account has more than one brand under it
// (see getPickupsForTrackingNumbers below for why callers must never
// return this raw).
async function getPickupsPage(page) {
  const http = await client();
  const res = await http.get("/pickups", { params: { page } });
  return res.data?.data;
}

// Bosta's /pickups has no per-brand filter and mixes every brand under
// this account into one list — including other brands' customer names
// and phone numbers inside each pickup's deliveries array. This filters
// every pickup's deliveries down to only the given (our own, already
// known) tracking numbers, and drops any pickup left with zero matches,
// so nothing belonging to another brand is ever returned by this
// function. Scans up to maxPages of Bosta's list looking for matches.
async function getPickupsForTrackingNumbers(trackingNumbers, maxPages = 3) {
  const wanted = new Set(trackingNumbers);
  const matchedPickups = [];

  for (let page = 1; page <= maxPages; page++) {
    const data = await getPickupsPage(page);
    const list = data?.list || [];
    if (list.length === 0) break;

    list.forEach((pickup) => {
      const ourDeliveries = (pickup.deliveries || []).filter((d) => wanted.has(d.trackingNumber));
      if (ourDeliveries.length === 0) return;
      matchedPickups.push({
        id: pickup._id,
        type: pickup.type,
        state: pickup.state,
        scheduledDate: pickup.scheduledDate,
        scheduledTimeSlot: pickup.scheduledTimeSlot,
        numberOfParcels: pickup.numberOfParcels,
        deliveries: ourDeliveries.map((d) => ({
          trackingNumber: d.trackingNumber,
          businessReference: d.businessReference,
          receiverName: d.receiver?.fullName || null,
        })),
      });
    });

    // Bosta's own "total" count tells us when we've walked past the
    // last page — no point scanning further once we have.
    if (data.total != null && page * list.length >= data.total) break;
  }

  return matchedPickups;
}

// Same account-wide pickups list, but this time collecting the *other*
// side: deliveries that do NOT match our own known tracking numbers —
// i.e. Circle V's (or any other brand sharing this Bosta account).
// Deliberately narrow in what it returns: only enough to flag a
// package-size mismatch (tracking number + package type), never the
// receiver's name/phone — those stay filtered out even here, since this
// is a size-check, not a reason to expose that brand's customer data.
async function checkOtherBrandPackageSizes(ourTrackingNumbers, maxPages = 3, maxChecks = 25) {
  const ours = new Set(ourTrackingNumbers);
  const otherTrackingNumbers = [];

  for (let page = 1; page <= maxPages; page++) {
    const data = await getPickupsPage(page);
    const list = data?.list || [];
    if (list.length === 0) break;

    list.forEach((pickup) => {
      (pickup.deliveries || []).forEach((d) => {
        if (!ours.has(d.trackingNumber) && !otherTrackingNumbers.includes(d.trackingNumber)) {
          otherTrackingNumbers.push(d.trackingNumber);
        }
      });
    });

    if (data.total != null && page * list.length >= data.total) break;
    if (otherTrackingNumbers.length >= maxChecks) break;
  }

  const toCheck = otherTrackingNumbers.slice(0, maxChecks);
  const details = await Promise.all(
    toCheck.map((tn) => getDeliveryByTrackingNumber(tn).catch(() => null))
  );

  return details
    .map((delivery, i) => (delivery ? { trackingNumber: toCheck[i], packageType: delivery.specs?.packageType || null, weight: delivery.specs?.weight || null } : null))
    .filter((d) => d && d.packageType && d.packageType.toLowerCase() !== "small");
}

module.exports = {
  getDeliveryByTrackingNumber,
  getAwbPdfByTrackingNumber,
  getAwbPdfByTrackingNumbers,
  getPickupsForTrackingNumbers,
  checkOtherBrandPackageSizes,
};
