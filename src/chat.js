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

// English display names for the same governorates, used only when
// replying in English (the SHIPPING_COSTS keys stay Arabic since that's
// what detectCity() matches against in the customer's message).
const CITY_NAMES_EN = {
  "المنيا": "Minya", "الاسكندرية": "Alexandria", "البحيرة": "Beheira", "الجيزة": "Giza",
  "اسوان": "Aswan", "دمياط": "Damietta", "القليوبية": "Qalyubia", "بورسعيد": "Port Said",
  "القاهرة": "Cairo", "الفيوم": "Fayoum", "البحر الاحمر": "Red Sea", "الغربية": "Gharbia",
  "كفر الشيخ": "Kafr El Sheikh", "المنوفية": "Monufia", "جنوب سيناء": "South Sinai", "اسيوط": "Assiut",
  "شمال سيناء": "North Sinai", "الاسمعيلية": "Ismailia", "مطروح": "Marsa Matruh", "الاقصر": "Luxor",
  "بني سويف": "Beni Suef", "الوادي الجديد": "New Valley", "الدقهلية": "Dakahlia", "الشرقية": "Sharqia",
  "السويس": "Suez", "سوهاج": "Sohag", "قنا": "Qena", "الساحل الشمالي": "North Coast",
};

const FAR_GOVERNORATES = [
  "اسوان", "الاقصر", "قنا", "البحر الاحمر", "مطروح", "شمال سيناء", "جنوب سيناء", "الوادي الجديد",
];

const MESSAGES = {
  emptyInput: {
    ar: "قوللي محتاج تعرف ايه عن منتجات Lana's Beauty.",
    en: "Tell me what you'd like to know about Lana's Beauty products.",
  },
  greeting: {
    ar: "أهلاً بحضرتك في Lana's Beauty 🤍 قوللي محتاج تعرف ايه، أو دور على منتج معين.",
    en: "Welcome to Lana's Beauty 🤍 Tell me what you're looking for, or ask about a specific product.",
  },
  thanks: {
    ar: "العفو 🤍 لو محتاج أي حاجة تانية أنا هنا.",
    en: "You're welcome 🤍 I'm here if you need anything else.",
  },
  askPhone: {
    ar: "قوللي رقم الموبايل اللي اتعمل بيه الطلب وهجيبلك حالته.",
    en: "Please share the mobile number the order was placed with, and I'll check its status.",
  },
  cantCheckNow: {
    ar: "مش قادر أتأكد من حالة الطلب دلوقتي، حاول تاني بعد شوية.",
    en: "I can't check the order status right now — please try again shortly.",
  },
  noOrdersFound: {
    ar: "مش لاقي أي طلب مسجل بالرقم ده. اتأكد إن الرقم صحيح، أو لو الطلب لسه جديد ممكن ياخد شوية لغاية ما يظهر.",
    en: "I couldn't find any order under this number. Please double check the number, or if the order was just placed it may take a little while to show up.",
  },
  cantFetchOrderNow: {
    ar: "مش قادر أجيب تفاصيل الطلب دلوقتي، حاول تاني بعد شوية.",
    en: "I can't fetch the order details right now — please try again shortly.",
  },
  offers: {
    ar: "دلوقتي عندنا:\n" +
      "• Buy 3 Get 2 + شحن مجاني — كود: EXPLORE5\n" +
      "• شحن مجاني على الطلبات فوق 999 جنيه\n" +
      "• اشتري 2 أو أكتر ووفر 10% — كود: SAVE10",
    en: "Here's what's currently active:\n" +
      "• Buy 3 Get 2 + Free Shipping — code: EXPLORE5\n" +
      "• Free shipping on orders over 999 EGP\n" +
      "• Buy 2 or more and save 10% — code: SAVE10",
  },
  shippingInfo: {
    ar: "بنجهز الطلب في نفس يوم تأكيده، وشركة الشحن بتستلمه من تاني يوم.\n" +
      "التوصيل بياخد حوالي يومين لمعظم المحافظات، أما المحافظات البعيدة (اسوان، الأقصر، قنا، البحر الأحمر، مطروح، شمال وجنوب سيناء، الوادي الجديد) فبتاخد من 3 لـ 5 أيام.\n" +
      "مصاريف الشحن بتختلف حسب المحافظة — قوللي اسم محافظتك وأقولك المصاريف بالظبط.\n" +
      "ملحوظة: في فترات الأوفرز ممكن يتأخر التوصيل شوية بسبب زيادة الطلبات، وميفيش تعديل على الطلب بعد تأكيده.",
    en: "Orders are prepared the same day they're confirmed, and the courier picks them up the next day.\n" +
      "Delivery takes about 2 days for most governorates, while farther ones (Aswan, Luxor, Qena, Red Sea, Marsa Matruh, North/South Sinai, New Valley) take 3 to 5 days.\n" +
      "Shipping cost varies by governorate — tell me yours and I'll give you the exact fee.\n" +
      "Note: during sale periods, delivery may be slightly delayed due to higher order volume, and orders can't be modified after confirmation.",
  },
  returnPolicy: {
    ar: "لو وصل منتج تالف أو غلط، بلغنا خلال 24 ساعة من استلام الطلب وهنتحمل مصاريف الاسترجاع أو الاستبدال بالكامل.\n" +
      "لأي استرجاع عادي: المنتج لازم يكون في حالته الأصلية، مقفول، ومتفتحش، وخلال 14 يوم من الاستلام. المنتجات المفتوحة مينفعش ترجع خالص.\n" +
      "مهم جدا: معطر الجسم، ومرطب/لوشن الجسم، والشامبو، والبلسم، ومنتجات النظافة الشخصية عموما مينفعش ترجع أو تتستبدل لأسباب صحية، إلا لو كان فيه عيب أو غلط في الطلب.\n" +
      "بخصوص الدفع: بنقبل كاش، إنستاباي، وكاشير (تقسيط/محفظة/كارت). الفلوس بترجع بنفس طريقة الدفع اللي اتم بيها الشراء، ولو الدفع كان كاش بترجع على محفظة إلكترونية أو إنستاباي أو حساب بنكي. استرداد مدفوعات كاشير بياخد حوالي 7 أيام.",
    en: "If you receive a damaged or incorrect item, let us know within 24 hours of receiving it and we'll cover the full return/exchange shipping cost.\n" +
      "For a regular return: the product must be in its original condition, sealed, and unused, within 14 days of receipt. Opened products can't be returned under any circumstances.\n" +
      "Important: body mist, body lotion, shampoo, and conditioner — hygiene products in general — can't be returned or exchanged for health reasons, unless the item is defective or incorrect.\n" +
      "On payment: we accept cash on delivery, Instapay, and Kashier (installments/wallet/card). Refunds go back via the original payment method; cash payments are refunded via e-wallet, Instapay, or bank account. Kashier refunds take about 7 days to process.",
  },
  noMatchForHer: {
    ar: "للأسف مفيش منتجات For Her متاحة حاليا. تحب أشوفلك Unisex؟",
    en: "Sorry, no For Her products are available right now. Want me to check Unisex instead?",
  },
  noMatchForHim: {
    ar: "للأسف مفيش منتجات For Him متاحة حاليا. تحب أشوفلك Unisex؟",
    en: "Sorry, no For Him products are available right now. Want me to check Unisex instead?",
  },
  noMatchUnisex: {
    ar: "للأسف مفيش منتجات Unisex متاحة حاليا.",
    en: "Sorry, no Unisex products are available right now.",
  },
  noMatchGeneric: {
    ar: "مش لاقي حاجة مطابقة للطلب حاليا. جرب تقول مثلا: منتج للبنات، للرجالة، أو Unisex.",
    en: "I couldn't find anything matching that. Try something like: products for her, for him, or Unisex.",
  },
  foundForHer: {
    ar: "أكيد ❤️ دي المنتجات المتاحة من Lana's Beauty للـ For Her:",
    en: "Sure ❤️ Here are the available For Her products from Lana's Beauty:",
  },
  foundForHim: {
    ar: "أكيد 👌 دي المنتجات المتاحة من Lana's Beauty للـ For Him:",
    en: "Sure 👌 Here are the available For Him products from Lana's Beauty:",
  },
  foundUnisex: {
    ar: "أكيد ✨ دي المنتجات الـ Unisex المتاحة حاليا:",
    en: "Sure ✨ Here are the available Unisex products:",
  },
  foundAvailable: {
    ar: "دي المنتجات المتاحة حاليا من Lana's Beauty:",
    en: "Here are the products currently available from Lana's Beauty:",
  },
  foundRecommend: {
    ar: "أكيد ❤️ دي شوية اختيارات ممكن تناسب:",
    en: "Sure ❤️ Here are a few picks that might work well:",
  },
  foundGeneric: {
    ar: "لقيت المنتجات دي من Lana's Beauty:",
    en: "Here's what I found from Lana's Beauty:",
  },
};

function detectLanguage(rawMessage) {
  // Arabic script present anywhere -> Arabic; otherwise, if it has Latin
  // letters -> English. A message with neither (e.g. just a phone
  // number) carries no language signal at all — since there's no
  // conversation history to fall back on, "both" answers in both
  // languages rather than silently guessing (and possibly answering in
  // the wrong language mid-conversation, e.g. right after an English
  // exchange).
  if (/[؀-ۿ]/.test(rawMessage)) return "ar";
  if (/[a-zA-Z]/.test(rawMessage)) return "en";
  return "both";
}

function pick(entry, lang) {
  if (lang === "both") return entry.en + "\n\n" + entry.ar;
  return entry[lang];
}

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

    const englishName = CITY_NAMES_EN[city];
    if (englishName && normalized.includes(englishName.toLowerCase())) return city;
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

function detectOrderStatusQuestion(text) {
  const normalized = normalizeText(text);
  return normalized.includes("طلب") || ["order", "track"].some((w) => normalized.includes(w));
}

function detectOffersQuestion(text) {
  const normalized = normalizeText(text);
  return ["عروض", "عرض", "خصم", "كوبون", "كود خصم", "offer", "discount", "coupon", "promo"].some(
    (w) => normalized.includes(w)
  );
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
    normalized.includes("available") ||
    normalized.includes("products") ||
    normalized.includes("catalog") ||
    normalized.includes("what do you have")
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

async function getOrderStatusReply(phone, lang) {
  let orderIds;
  try {
    orderIds = await getOrderIdsForPhone(phone);
  } catch (e) {
    return pick(MESSAGES.cantCheckNow, lang);
  }

  if (orderIds.length === 0) {
    return pick(MESSAGES.noOrdersFound, lang);
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
    return pick(MESSAGES.cantFetchOrderNow, lang);
  }

  orders.sort((a, b) => new Date(b.order.created_at) - new Date(a.order.created_at));
  const latest = orders[0];
  const latestEvent = latest.events[latest.events.length - 1];

  let en = `Order #${latest.order.short_id} is currently: ${latest.order.status}.`;
  let ar = `طلب رقم #${latest.order.short_id} حالته دلوقتي: ${latest.order.status}.`;

  if (latestEvent) {
    en += ` Latest courier update: ${latestEvent.stateName}.`;
    ar += ` آخر تحديث من شركة الشحن: ${latestEvent.stateName}.`;
  }
  if (orders.length > 1) {
    en += ` (There are ${orders.length} orders under this number — this is the most recent.)`;
    ar += ` (في ${orders.length} طلبات مسجلة بالرقم ده — ده أحدثهم.)`;
  }
  return pick({ en, ar }, lang);
}

async function chat(message) {
  const lang = detectLanguage(message);
  const text = normalizeText(message);

  if (!text) {
    return {
      success: false,
      message: pick(MESSAGES.emptyInput, lang),
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
    const reply = await getOrderStatusReply(phone, lang);
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

  // Asked about order status but no phone number yet — ask for it,
  // instead of falling through to "no matching products."
  if (detectOrderStatusQuestion(text)) {
    return {
      success: true,
      message: pick(MESSAGES.askPhone, lang),
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
      message: pick(MESSAGES.greeting, lang),
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
      message: pick(MESSAGES.thanks, lang),
      intent: "thanks",
      category: null,
      budget: null,
      count: 0,
      products: [],
    };
  }

  if (detectOffersQuestion(text)) {
    return {
      success: true,
      message: pick(MESSAGES.offers, lang),
      intent: "offers",
      category: null,
      budget: null,
      count: 0,
      products: [],
    };
  }

  if (detectShippingQuestion(text)) {
    const city = detectCity(text);
    let reply = pick(MESSAGES.shippingInfo, lang);
    if (city && SHIPPING_COSTS[city]) {
      const cityLabel = lang === "en" ? CITY_NAMES_EN[city] : city;
      const costLine = lang === "en"
        ? `Shipping cost to ${cityLabel}: ${SHIPPING_COSTS[city]} EGP.\n\n`
        : `مصاريف الشحن لـ ${city}: ${SHIPPING_COSTS[city]} جنيه.\n\n`;
      reply = costLine + reply;
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
    const cityLabel = lang === "en" ? CITY_NAMES_EN[bareCity] : bareCity;
    const isFar = FAR_GOVERNORATES.includes(bareCity);
    const message = lang === "en"
      ? `Shipping cost to ${cityLabel}: ${SHIPPING_COSTS[bareCity]} EGP. ` +
        (isFar ? "Delivery takes 3 to 5 days." : "Delivery takes about 2 days.")
      : `مصاريف الشحن لـ ${bareCity}: ${SHIPPING_COSTS[bareCity]} جنيه. ` +
        (isFar ? "التوصيل بياخد من 3 لـ 5 أيام." : "التوصيل بياخد حوالي يومين.");

    return {
      success: true,
      message,
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
      message: pick(MESSAGES.returnPolicy, lang),
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
   *
   * Also only run this for a real search intent, not a bare
   * "recommend something" with no category — searching using the
   * request's own wording (e.g. "رشحيلي"/"حاجة") as literal product
   * search terms finds nothing and wrongly reports "no products",
   * when it should just show general in-stock picks from the full
   * catalog (already loaded above) instead.
   */
if (!category && intent === "search") {
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
      reply = pick(MESSAGES.noMatchForHer, lang);
    } else if (category === "for-him") {
      reply = pick(MESSAGES.noMatchForHim, lang);
    } else if (category === "unisex") {
      reply = pick(MESSAGES.noMatchUnisex, lang);
    } else {
      reply = pick(MESSAGES.noMatchGeneric, lang);
    }
  } else if (category === "for-her") {
    reply = pick(MESSAGES.foundForHer, lang);
  } else if (category === "for-him") {
    reply = pick(MESSAGES.foundForHim, lang);
  } else if (category === "unisex") {
    reply = pick(MESSAGES.foundUnisex, lang);
  } else if (intent === "availability") {
    reply = pick(MESSAGES.foundAvailable, lang);
  } else if (intent === "recommend") {
    reply = pick(MESSAGES.foundRecommend, lang);
  } else {
    reply = pick(MESSAGES.foundGeneric, lang);
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
