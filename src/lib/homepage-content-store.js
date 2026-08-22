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
  offerBar: {
    text: "BUY 3 GET 2 + FREE SHIPPING — USE CODE: EXPLORE5",
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
