const { getProducts, easyOrdersGet } = require("./easyorders");

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cache = {
  products: null,
  loadedAt: 0,
};

function cleanHtml(html = "") {
  return html
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/â€‘/g, "-")
    .replace(/â€“/g, "-")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeProduct(product) {
  const categories = (product.categories || [])
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
    }))
    .filter((category) => category.slug !== "all");

  const categorySlugs = categories.map((category) => category.slug);

  const hasStockTracking = product.track_stock === true;
  const quantity = Number(product.quantity || 0);

  const inStock = hasStockTracking ? quantity > 0 : true;

  const price = Number(product.price || 0);

  const salePrice =
    product.sale_price !== null &&
    product.sale_price !== undefined &&
    product.sale_price !== ""
      ? Number(product.sale_price)
      : null;

  const finalPrice =
    salePrice !== null && salePrice > 0 && salePrice < price
      ? salePrice
      : price;

return {
  id: product.id,
  name: product.name,
  slug: product.slug,
  url: product.slug
  ? `https://www.lana-beauty.com/products/${product.slug}`
  : null,
  sku: product.sku || null,

    price,
    salePrice,
    finalPrice,

    quantity,
    trackStock: hasStockTracking,
    inStock,

    image: product.thumb || null,

    description: cleanHtml(product.description || ""),
    shortDescription: product.meta_description || "",

    categories,
    categorySlugs,

    hidden: product.hidden === true,

    buyNowText: product.buy_now_text || null,

    updatedAt: product.updated_at || null,
    createdAt: product.created_at || null,
  };
}

async function loadCatalog({ forceRefresh = false } = {}) {
  const now = Date.now();

  if (
    !forceRefresh &&
    cache.products &&
    now - cache.loadedAt < CACHE_TTL
  ) {
    return cache.products;
  }

  console.log("Loading Lana's Beauty product catalog...");

  const response = await getProducts({
    limit: 100,
    page: 1,
  });

  const products = Array.isArray(response)
    ? response
    : response?.data || [];

  const detailedProducts = [];

  for (const product of products) {
    try {
      const details = await easyOrdersGet(`/products/${product.id}`);

      if (details.hidden === true) {
        continue;
      }

      detailedProducts.push(normalizeProduct(details));
    } catch (error) {
      console.error(
        `Failed to load product ${product.id}:`,
        error.response?.data || error.message
      );
    }
  }

  cache.products = detailedProducts;
  cache.loadedAt = now;

  console.log(
    `Catalog loaded: ${detailedProducts.length} products`
  );

  return detailedProducts;
}

async function getCatalog(options = {}) {
  return loadCatalog(options);
}

async function getProductById(productId) {
  const products = await getCatalog();

  return (
    products.find((product) => product.id === productId) ||
    null
  );
}

async function searchProducts(query) {
  const products = await getCatalog();

  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase();

  if (!normalizedQuery) {
    return products;
  }

  return products.filter((product) => {
    const searchableText = [
      product.name,
      product.slug,
      product.sku,
      product.description,
      product.shortDescription,
      ...product.categories.map((category) => category.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

async function getProductsByCategory(categorySlug) {
  const products = await getCatalog();

  const normalizedSlug = String(categorySlug || "")
    .trim()
    .toLowerCase();

  if (!normalizedSlug || normalizedSlug === "all") {
    return products;
  }

  return products.filter((product) =>
    product.categorySlugs.includes(normalizedSlug)
  );
}

async function getAvailableProducts() {
  const products = await getCatalog();

  return products.filter((product) => product.inStock);
}

function clearCatalogCache() {
  cache.products = null;
  cache.loadedAt = 0;
}

module.exports = {
  getCatalog,
  getProductById,
  searchProducts,
  getProductsByCategory,
  getAvailableProducts,
  clearCatalogCache,
};