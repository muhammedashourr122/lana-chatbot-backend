const {
  getCatalog,
  searchProducts,
  getProductsByCategory,
} = require("./catalog");

function normalizeText(text = "") {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "");
}

function formatProduct(product) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    salePrice: product.salePrice,
    finalPrice: product.finalPrice,
    inStock: product.inStock,
    quantity: product.quantity,
    image: product.image,
url: product.url,
    description: product.shortDescription,
    categories: product.categories.map(
      (category) => category.name
    ),
  };
}

function detectCategory(text) {
  const normalized = normalizeText(text);

  if (
    normalized.includes("for her") ||
    normalized.includes("للبنات") ||
    normalized.includes("بنات") ||
    normalized.includes("حريمي") ||
    normalized.includes("حريمه") ||
    normalized.includes("نساء") ||
    normalized.includes("ستات") ||
    normalized.includes("للسيدات") ||
    normalized.includes("سيدات") ||
    normalized.includes("للمراه") ||
    normalized.includes("مراه")
  ) {
    return "for-her";
  }

  if (
    normalized.includes("for him") ||
    normalized.includes("للرجال") ||
    normalized.includes("للرجاله") ||
    normalized.includes("رجالي") ||
    normalized.includes("رجال") ||
    normalized.includes("للشباب") ||
    normalized.includes("شباب") ||
    normalized.includes("للراجل") ||
    normalized.includes("راجل")
  ) {
    return "for-him";
  }

  if (
    normalized.includes("unisex") ||
    normalized.includes("يونيسكس") ||
    normalized.includes("يونيسكس") ||
    normalized.includes("للجنسين") ||
    normalized.includes("للجنسين")
  ) {
    return "unisex";
  }

  return null;
}

function detectIntent(text, category) {
  const normalized = normalizeText(text);

  if (category) {
    if (
      normalized.includes("عايز") ||
      normalized.includes("عاوزه") ||
      normalized.includes("اريد") ||
      normalized.includes("ممكن") ||
      normalized.includes("رشح") ||
      normalized.includes("اختار")
    ) {
      return "recommend";
    }

    return "products";
  }

  if (
    normalized.includes("سعر") ||
    normalized.includes("بكام") ||
    normalized.includes("كام") ||
    normalized.includes("price")
  ) {
    return "price";
  }

  if (
    normalized.includes("متاح") ||
    normalized.includes("موجود") ||
    normalized.includes("stock")
  ) {
    return "availability";
  }

  if (
    normalized.includes("رشح") ||
    normalized.includes("اختار") ||
    normalized.includes("عايز حاجه") ||
    normalized.includes("عايز حاجة") ||
    normalized.includes("عايز منتج") ||
    normalized.includes("recommend")
  ) {
    return "recommend";
  }

  if (
    normalized.includes("منتجات") ||
    normalized.includes("عندكم ايه") ||
    normalized.includes("عندكم اي") ||
    normalized.includes("المتاح") ||
    normalized.includes("available")
  ) {
    return "products";
  }

  return "search";
}

function detectBudget(text) {
  const matches = String(text).match(/\d+/g);

  if (!matches) {
    return null;
  }

  const numbers = matches
    .map(Number)
    .filter((number) => number > 0);

  return numbers.length
    ? Math.max(...numbers)
    : null;
}

async function chat(message) {
  const text = normalizeText(message);

  if (!text) {
    return {
      success: false,
      message:
        "اكتبلي عايز تعرف ايه عن منتجات Lana's Beauty.",
      intent: null,
      category: null,
      budget: null,
      count: 0,
      products: [],
    };
  }

  const category = detectCategory(text);
  const intent = detectIntent(text, category);
  const budget = detectBudget(text);

  console.log("CHAT DEBUG:", {
    original: message,
    normalized: text,
    category,
    intent,
    budget,
  });

  let products;

  if (category) {
    products = await getProductsByCategory(category);
  } else {
    products = await getCatalog();
  }

  products = products.filter(
    (product) => !product.hidden
  );

  /*
   * IMPORTANT:
   * If the user specified a category such as For Her,
   * do NOT run the generic word-by-word search.
   *
   * Otherwise words like "عايز" / "حاجة" can accidentally
   * return unrelated catalog products.
   */
if (!category && (intent === "search" || intent === "recommend")) {
  const searchableText = text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);

  if (searchableText.length > 0) {
    const searched = [];

    for (const word of searchableText) {
      const results = await searchProducts(word);

      for (const product of results) {
        if (
          !searched.some(
            (item) => item.id === product.id
          )
        ) {
          searched.push(product);
        }
      }
    }

    /*
     * IMPORTANT:
     * If the user entered a search term and
     * nothing matched, return ZERO products.
     *
     * Do NOT fall back to the entire catalog.
     */
    products = searched;
  } else {
    products = [];
  }
}

  if (budget) {
    const budgetProducts = products.filter(
      (product) => product.finalPrice <= budget
    );

    if (budgetProducts.length > 0) {
      products = budgetProducts;
    }
  }

  /*
   * Recommendations and availability should only
   * show products that can actually be ordered.
   */
  if (
    intent === "availability" ||
    intent === "recommend" ||
    category
  ) {
    const available = products.filter(
      (product) => product.inStock
    );

    if (available.length > 0) {
      products = available;
    } else {
      products = [];
    }
  }

  products = products.slice(0, 6);

  let reply;

  if (products.length === 0) {
    if (category === "for-her") {
      reply =
        "للأسف مفيش منتجات For Her متاحة حاليا. تحب أشوفلك Unisex؟";
    } else if (category === "for-him") {
      reply =
        "للأسف مفيش منتجات For Him متاحة حاليا. تحب أشوفلك Unisex؟";
    } else if (category === "unisex") {
      reply =
        "للأسف مفيش منتجات Unisex متاحة حاليا.";
    } else {
      reply =
        "مش لاقي حاجة مطابقة لطلبك حاليا. جرب تقولي مثلا: عايز حاجة للبنات، للرجالة، أو Unisex.";
    }
  } else if (category === "for-her") {
    reply =
      "أكيد ❤️ دي المنتجات المتاحة من Lana's Beauty للـ For Her:";
  } else if (category === "for-him") {
    reply =
      "أكيد 👌 دي المنتجات المتاحة من Lana's Beauty للـ For Him:";
  } else if (category === "unisex") {
    reply =
      "أكيد ✨ دي المنتجات الـ Unisex المتاحة حاليا:";
  } else if (intent === "availability") {
    reply =
      "دي المنتجات المتاحة حاليا من Lana's Beauty:";
  } else if (intent === "recommend") {
    reply =
      "أكيد ❤️ دي شوية اختيارات ممكن تناسبك:";
  } else {
    reply =
      "لقيتلك المنتجات دي من Lana's Beauty:";
  }

  return {
    success: true,
    message: reply,
    intent,
    category,
    budget,
    count: products.length,
    products: products.map(formatProduct),
  };
}

module.exports = {
  chat,
};
