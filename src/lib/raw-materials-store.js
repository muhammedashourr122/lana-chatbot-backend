const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "raw-materials";

async function getRawMaterials() {
  const raw = await redis.get(KEY);
  if (!raw) return [];
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return [];
  }
}

async function saveRawMaterials(materials) {
  await redis.set(KEY, JSON.stringify(materials));
  return materials;
}

async function createRawMaterial({ name, unit, stock, costPerUnit, lowStockThreshold, supplierId }) {
  const materials = await getRawMaterials();
  const material = {
    id: crypto.randomUUID(),
    name,
    unit: unit || "piece",
    stock: Number(stock) || 0,
    costPerUnit: Number(costPerUnit) || 0,
    lowStockThreshold: Number(lowStockThreshold) || 0,
    supplierId: supplierId || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  materials.push(material);
  await saveRawMaterials(materials);
  return material;
}

async function updateRawMaterial(id, fields) {
  const materials = await getRawMaterials();
  const material = materials.find((m) => m.id === id);
  if (!material) throw new Error("Material not found");
  Object.assign(material, fields, { updatedAt: Date.now() });
  await saveRawMaterials(materials);
  return material;
}

async function deleteRawMaterial(id) {
  const materials = await getRawMaterials();
  const next = materials.filter((m) => m.id !== id);
  await saveRawMaterials(next);
}

// Deducts (or adds, with a negative delta) stock for several materials at
// once — used by production runs so a batch's consumption is atomic from
// the caller's point of view (single read-modify-write of the whole list).
async function adjustRawMaterialStocks(deltasByMaterialId) {
  const materials = await getRawMaterials();
  materials.forEach((m) => {
    if (Object.prototype.hasOwnProperty.call(deltasByMaterialId, m.id)) {
      m.stock += deltasByMaterialId[m.id];
      m.updatedAt = Date.now();
    }
  });
  await saveRawMaterials(materials);
  return materials;
}

module.exports = {
  getRawMaterials,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  adjustRawMaterialStocks,
};
