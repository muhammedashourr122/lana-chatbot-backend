const {
  getCatalog,
  searchProducts,
  getProductsByCategory,
} = require("./catalog");
const { getOrder } = require("./easyorders");
const { getOrderIdsForPhone, getTrackingEvents } = require("./tracking-store");

// city:cost (EGP), from the merchant's real Easy Orders shipping table.
const SHIPPING_COSTS = {
  "المنيا": 135, "الاسكندرية": 115, "البحيرة": 115, "الجيزة": 105,
  "اسوان": 155, "دمياط": 120, "القليوبية": 120, "بورسعيد": 120,
  "القاهرة": 105, "الفيوم": 135, "البحر الاحمر": 155, "الغربية": 120,
  "كفر الشيخ": 120, "المنوفية": 120, "جنوب سيناء": 180, "اسيوط": 135,
  "شمال سيناء": 180, "الاسمعيلية": 120, "مطروح": 155, "الاقصر": 155,
  "بني سويف": 135, "الوادي الجديد": 180, "الدقهلية": 120, "الشرقية": 120,
  "السويس": 120, "سوهاج": 135, "قنا": 155, "الساحل الشمالي": 160,
};

const SHIPPING_INFO_REPLY =
  "بنجهز الطلبات ونشحنها في أول يوم عمل بعد تأكيد الطلب (أيام العمل من الأحد للخميس).\n" +
  "مدة التوصيل: من 2 لـ 4 أيام عمل للقاهرة والجيزة والاسكندرية، ومن 3 لـ 5 أيام عمل لباقي المحافظات.\n" +
  "مصاريف الشحن بتختلف حسب المحافظة — قوليلي اسم محافظتك وأقولك المصاريف بالظبط.\n" +
  "ملحوظة: في فترات الأوفرز ممكن يتأخر التوصيل شوية بسبب زيادة الطلبات، وميفيش تعديل على الطلب بعد تأكيده.";

const RETURN_POLICY_REPLY =
  "لو وصلك منتج تالف أو غلط، ابلغينا خلال 24 ساعة من استلام الطلب وهنتحمل مصاريف الاسترجاع أو الاستبدال بالكامل.\n" +
  "لأي استرجاع تاني: المنتج لازم يكون في حالته الأصلية، مقفول، ومتفتحش، وخلال 14 يوم من الاستلام. المنتجات المفتوحة مينفعش ترجع خالص (حسب قانون حماية المستهلك).\n" +
  "مهم جدا: الـ Body Splash والـ Body Lotion والشامبو والكونديشنر ومنتجات النظافة الشخصية عموما مينفعش ترجع أو تتستبدل لأسباب صحية، إلا لو كان فيه عيب أو غلط في الطلب.\n" +
  "لو دفعتي فوري وحبيتي تلغي الطلب وقت الاستلام هيتخصم مصاريف الشحن، أما لو لغيتي فور الدفع مفيش خصم، والفلوس بترجع خلال 10-14 يوم على محفظة MEEZA أو Instapay.";

function normalizeText(text = "") {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)) // Arabic-Indic digits -> ASCII
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "");
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
    normalized.includes("للجنسين")
  ) {
    return "unisex";
  }

  return null;
}

function detectPhone(text) {
  // Egyptian mobile numbers: 01[0125] + 8 digits, optionally with a
  // +20/0020/20 country-code prefix. Grabbed from raw digits so spacing
  // or dashes in what the customer typed doesn't matter.
  const digitsOnly = String(text).replace(/\D/g, "");
  const match = digitsOnly.match(/(?:0020|20)?(01[0125]\d{8})/);
  return match ? match[1] : null;
}

function detectCity(text) {
  const normalized = normalizeText(text);
  for (const city of Object.keys(SHIPPING_COSTS)) {
    // Strip a leading "ال" (the) from the city name before comparing:
    // Arabic prepositions ending in ل contract with a following "ال"
    // into "لل" (e.g. لـ + القاهرة -> للقاهرة), which drops the "ا" and
    // breaks a plain substring match against the article-form name.
    const cityNorm = normalizeText(city);
    const core = cityNorm.startsWith("ال") ? cityNorm.slice(2) : cityNorm;
    if (normalized.includes(core)) return city;
  }
  return null;
}

function detectGreeting(text) {
  const normalized = normalizeText(text);
  return ["مرحبا", "اهلا", "هاي", "ازيك", "ازيكم", "صباح الخير", "مساء الخير", "hello", "hi ", "hey"].some(
    (w) => normalized === w.trim() || normalized.startsWith(w.trim())
  );
}

function detectThanks(text) {
  const normalized = normalizeText(text);
  return ["شكرا", "متشكر", "تسلم", "thanks", "thank you", "thx"].some((w) => normalized.includes(w));
}

function detectShippingQuestion(text) {
  const normalized = normalizeText(text);
  return ["شحن", "توصيل", "تشحن", "تشحنوا", "مصاريف الشحن", "كام يوم", "بتوصل امتي", "delivery", "shipping"].some(
    (w) => normalized.includes(w)
  );
}

function detectReturnQuestion(text) {
  const normalized = normalizeText(text);
  return [
    "استرجاع", "استرجع", "استبدال", "ابدال", "ارجاع", "ارجع", "مرتجع",
    "استرد فلوسي", "return", "exchange", "refund",
  ].some((w) => normalized.includes(w));
}

function detectSortPreference(text) {
  const normalized = normalizeText(text);
  if (["ارخص", "الارخص", "اقل سعر", "cheapest"].some((w) => normalized.includes(w))) return "asc";
  if (["اغلى", "الاغلى", "احلى سعر عالي", "most expensive"].some((w) => normalized.includes(w))) return "desc";
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

async function getOrderStatusReply(phone) {
  let orderIds;
  try {
    orderIds = await getOrderIdsForPhone(phone);
  } catch (e) {
    return "مش قادر أتأكد من حالة الطلب دلوقتي، حاولي تاني بعد شوية.";
  }

  if (orderIds.length === 0) {
    return "مش لاقي أي طلب مسجل بالرقم ده. اتأكدي إن الرقم صحيح، أو لو الطلب لسه جديد ممكن ياخد شوية لغاية ما يظهر.";
  }

  const orders = (
    await Promise.all(
      orderIds.map(async (id) => {
        try {
          return { order: await getOrder(id), events: await getTrackingEvents(id) };
        } catch (e) {
          return null;
        }
      })
    )
  ).filter(Boolean);

  if (orders.length === 0) {
    return "مش قادر أجيب تفاصيل الطلب دلوقتي، حاولي تاني بعد شوية.";
  }

  orders.sort((a, b) => new Date(b.order.created_at) - new Date(a.order.created_at));
  const latest = orders[0];
  const latestEvent = latest.events[latest.events.length - 1];

  let reply = `طلبك رقم #${latest.order.short_id} حالته دلوقتي: ${latest.order.status}.`;
  if (latestEvent) {
    reply += ` آخر تحديث من شركة الشحن: ${latestEvent.stateName}.`;
  }
  if (orders.length > 1) {
    reply += ` (عندك ${orders.length} طلبات مسجلة بالرقم ده — ده أحدثهم.)`;
  }
  return reply;
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

  // A phone number is an unambiguous signal — answer order status
  // directly regardless of any other wording in the message. Use the
  // already-normalized text so Arabic-Indic digits are recognized too.
  const phone = detectPhone(text);
  if (phone) {
    const reply = await getOrderStatusReply(phone);
    return {
      success: true,
      message: reply,
      intent: "order_status",
      category: null,
      budget: null,
      count: 0,
      products: [],
    };
  }

  if (detectGreeting(text)) {
    return {
      success: true,
      message: "أهلا بيكي في Lana's Beauty 🤍 قوليلي عايزة تعرفي ايه، أو دوري على منتج معين.",
      intent: "greeting",
      category: null,
      budget: null,
      count: 0,
      products: [],
    };
  }

  if (detectThanks(text)) {
    return {
      success: true,
      message: "العفو 🤍 لو احتجتي أي حاجة تانية أنا هنا.",
      intent: "thanks",
      category: null,
      budget: null,
      count: 0,
      products: [],
    };
  }

  if (detectShippingQuestion(text)) {
    const city = detectCity(text);
    let reply = SHIPPING_INFO_REPLY;
    if (city && SHIPPING_COSTS[city]) {
      reply = `مصاريف الشحن لـ ${city}: ${SHIPPING_COSTS[city]} جنيه.\n\n` + reply;
    }
    return {
      success: true,
      message: reply,
      intent: "shipping",
      category: null,
      budget: null,
      count: 0,
      products: [],
    };
  }

  // A short message that's just a governorate name (no other keywords)
  // is almost always a follow-up to a shipping question, since there's
  // no other reason to type a bare city name — the widget doesn't send
  // conversation history, so this is a lightweight way to keep that
  // exchange feeling continuous instead of falling through to "no
  // matching products." Kept short (just the cost), not the full policy
  // text again, since repeating it every time would get repetitive.
  const bareCity = detectCity(text);
  if (bareCity && text.split(/\s+/).filter(Boolean).length <= 4) {
    return {
      success: true,
      message: `مصاريف الشحن لـ ${bareCity}: ${SHIPPING_COSTS[bareCity]} جنيه. التوصيل بياخد من 2 لـ 5 أيام عمل حسب المحافظة.`,
      intent: "shipping",
      category: null,
      budget: null,
      count: 0,
      products: [],
    };
  }

  if (detectReturnQuestion(text)) {
    return {
      success: true,
      message: RETURN_POLICY_REPLY,
      intent: "return_policy",
      category: null,
      budget: null,
      count: 0,
      products: [],
    };
  }

  const category = detectCategory(text);
  const intent = detectIntent(text, category);
  const budget = detectBudget(text);
  const sortPreference = detectSortPreference(text);

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

  if (sortPreference === "asc") {
    products = products.slice().sort((a, b) => a.finalPrice - b.finalPrice);
  } else if (sortPreference === "desc") {
    products = products.slice().sort((a, b) => b.finalPrice - a.finalPrice);
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
