const express = require("express");

const {
  getCatalog,
  getProductById,
  searchProducts,
  getProductsByCategory,
  getAvailableProducts,
} = require("../catalog");

const router = express.Router();

/**
 * GET /api/catalog
 * Get full product catalog
 */
router.get("/", async (req, res) => {
  try {
    const products = await getCatalog();

    res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error("Catalog error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load catalog",
    });
  }
});

/**
 * GET /api/catalog/search?q=amber
 * Search products
 */
router.get("/search", async (req, res) => {
  try {
    const query = req.query.q || "";

    const products = await searchProducts(query);

    res.json({
      success: true,
      query,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error("Catalog search error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to search products",
    });
  }
});

/**
 * GET /api/catalog/category/:slug
 * Get products by category
 *
 * Examples:
 * /api/catalog/category/for-her
 * /api/catalog/category/for-him
 * /api/catalog/category/unisex
 */
router.get("/category/:slug", async (req, res) => {
  try {
    const products = await getProductsByCategory(req.params.slug);

    res.json({
      success: true,
      category: req.params.slug,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error("Catalog category error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load category products",
    });
  }
});

/**
 * GET /api/catalog/available
 * Get products currently in stock
 */
router.get("/available", async (req, res) => {
  try {
    const products = await getAvailableProducts();

    res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error("Available products error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load available products",
    });
  }
});

/**
 * GET /api/catalog/:id
 * Get one product by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const product = await getProductById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Product details error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load product",
    });
  }
});

module.exports = router;