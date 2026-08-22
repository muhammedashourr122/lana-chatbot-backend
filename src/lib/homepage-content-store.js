const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CONTENT_KEY = "homepage-content";

// Transcribed exactly from the live homepage's current copy, so the very
// first deploy of this feature causes zero visual change — nothing shifts
// until the merchant actually edits something in the dashboard.
const DEFAULT_HOMEPAGE_CONTENT = {
  hero: {
    kicker: "The Art Of Fragrance",
    titleLine1: "Wear",
    titleLine2Italic: "your",
    titleLine3: "feeling.",
    description: "Fragrance designed to become part of the way you express yourself.",
    buttonText: "Explore Scents",
    buttonLink: "/collections/all",
  },
  announcementBar: {
    item1: { text: "FREE SHIPPING ON ORDERS OVER EGP 999" },
    item2: { text: "BUY 2 OR MORE & SAVE 10% — USE CODE:", code: "SAVE10" },
    item3: { text: "BUY 3 GET 2 + FREE SHIPPING — USE CODE:", code: "EXPLORE5" },
  },
  bestSellers: {
    eyebrow: "Our Favorites",
    title: "Best Sellers",
    productSlugs: ["body-splash-pink-shadow", "body-splash-shadow-noir"],
  },
  collections: {
    kicker: "Discover Lana's Beauty",
    title: 'Find Your <em>Signature</em>',
    subtitle: "Three fragrance worlds. One made for you. Explore the collection that speaks your language.",
    her: { label: "Feminine Fragrances", productSlug: "body-splash-pink-shadow" },
    him: { label: "Masculine Fragrances", productSlug: "body-splash-shadow-noir" },
    unisex: { label: "Genderless Fragrances", productSlug: "" },
  },
  offers: {
    box1: {
      eyebrow: "A Little Something Extra",
      titleLine1: "More scents.",
      titleLine2Italic: "More to love.",
      note: "Buy 2 or more fragrances and enjoy 10% off your order.",
      code: "SAVE10",
      buttonText: "Shop The Collection",
      buttonLink: "https://www.lana-beauty.com/collections/all",
    },
    box2: {
      eyebrow: "Explore More. Save More.",
      titleLine1: "Buy 3",
      titleLine2Italic: "Get 2 + Free Shipping.",
      note: "Choose 3 fragrances and receive 2 more absolutely free — with free shipping.",
      code: "EXPLORE5",
      buttonText: "Explore The Collection",
      buttonLink: "https://www.lana-beauty.com/collections/all",
    },
  },
  paymentMethods: {
    items: [
      { id: "visa", kind: "logo", enabled: true, label: "Visa", imageUrl: "https://raw.githubusercontent.com/datatrans/payment-logos/master/assets/cards/visa.svg" },
      { id: "mastercard", kind: "logo", enabled: true, label: "Mastercard", imageUrl: "https://raw.githubusercontent.com/datatrans/payment-logos/master/assets/cards/mastercard.svg" },
      { id: "meeza", kind: "logo", enabled: true, label: "Meeza", imageUrl: "https://meezaprod-gmh3hjdscxfsekd6.northeurope-01.azurewebsites.net/wp-content/uploads/2019/07/cropped-fav.png" },
      { id: "instapay", kind: "logo", enabled: true, label: "InstaPay", imageUrl: "https://upload.wikimedia.org/wikipedia/ar/archive/f/fa/20231126094028%21%D8%A7%D9%86%D8%B3%D8%AA%D8%A7%D8%A8%D8%A7%D9%8A.png" },
      { id: "souhoola", kind: "logo", enabled: true, label: "Souhoola", imageUrl: "https://souhoola.com/assets/img/Souhoola/logo.svg" },
      { id: "tru", kind: "logo", enabled: true, label: "TRU", imageUrl: "https://alalamelyoum.co/wp-content/uploads/2025/01/39495e60ca14e5a01352ef73aa40e437.webp" },
      { id: "aman", kind: "logo", enabled: true, label: "Aman", imageUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR0kPIve_VqGU3fJ0Yv6iDquuyE4tofzZP768NqUmIaflmeemKiwsbYKU4&s=10" },
      { id: "installments", kind: "installments", enabled: true, label: "BANK INSTALLMENTS" },
      { id: "cod", kind: "cod", enabled: true, label: "CASH ON DELIVERY" },
    ],
  },
  brand: {
    kicker: "Why Lana's Beauty",
    small: "The art of fragrance",
    titleLine1: "A scent is more",
    titleLine2Em: "than a fragrance.",
    description: "It becomes a memory, a mood, a presence. Lana's Beauty creates fragrances designed to become part of your story.",
    value1Title: "Crafted",
    value1Text: "Carefully developed fragrances with character and attention to detail.",
    value2Title: "Lasting",
    value2Text: "Scents made to stay with you throughout the moments that matter.",
    value3Title: "Personal",
    value3Text: "Different moods. Different people. A fragrance that feels like yours.",
    bottomText: "Wear Your Story",
  },
};

async function getHomepageContent() {
  const raw = await redis.get(CONTENT_KEY);
  if (!raw) return { ...DEFAULT_HOMEPAGE_CONTENT };
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return deepMerge(DEFAULT_HOMEPAGE_CONTENT, parsed);
  } catch (e) {
    return { ...DEFAULT_HOMEPAGE_CONTENT };
  }
}

async function saveHomepageContent(content) {
  const merged = deepMerge(DEFAULT_HOMEPAGE_CONTENT, content);
  merged.updatedAt = Date.now();
  await redis.set(CONTENT_KEY, JSON.stringify(merged));
  return merged;
}

// Simple one-level-deep recursive merge — good enough for this fixed,
// known shape (no arrays of objects, just nested plain objects/strings).
function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const defaultValue = defaults[key];
    const overrideValue = overrides ? overrides[key] : undefined;
    if (overrideValue === undefined) continue;
    if (
      typeof defaultValue === "object" &&
      defaultValue !== null &&
      !Array.isArray(defaultValue) &&
      typeof overrideValue === "object" &&
      overrideValue !== null
    ) {
      result[key] = deepMerge(defaultValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }
  return result;
}

module.exports = {
  getHomepageContent,
  saveHomepageContent,
  DEFAULT_HOMEPAGE_CONTENT,
};
