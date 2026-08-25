const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "suppliers";

async function getSuppliers() {
  const raw = await redis.get(KEY);
  if (!raw) return [];
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return [];
  }
}

async function saveSuppliers(suppliers) {
  await redis.set(KEY, JSON.stringify(suppliers));
  return suppliers;
}

async function createSupplier({ name, phone, notes }) {
  const suppliers = await getSuppliers();
  const supplier = {
    id: crypto.randomUUID(),
    name,
    phone: phone || "",
    notes: notes || "",
    balance: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  suppliers.push(supplier);
  await saveSuppliers(suppliers);
  return supplier;
}

async function updateSupplier(id, fields) {
  const suppliers = await getSuppliers();
  const supplier = suppliers.find((s) => s.id === id);
  if (!supplier) throw new Error("Supplier not found");
  Object.assign(supplier, fields, { updatedAt: Date.now() });
  await saveSuppliers(suppliers);
  return supplier;
}

async function deleteSupplier(id) {
  const suppliers = await getSuppliers();
  const next = suppliers.filter((s) => s.id !== id);
  await saveSuppliers(next);
}

async function adjustSupplierBalance(id, delta) {
  const suppliers = await getSuppliers();
  const supplier = suppliers.find((s) => s.id === id);
  if (!supplier) throw new Error("Supplier not found");
  supplier.balance = Math.round((supplier.balance + delta) * 100) / 100;
  supplier.updatedAt = Date.now();
  await saveSuppliers(suppliers);
  return supplier;
}

module.exports = {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  adjustSupplierBalance,
};
