(function () {
  "use strict";

  if (window.__lanaHomepageInit) return;
  window.__lanaHomepageInit = true;

  var CONTENT_API = "https://lana-chatbot-backend.onrender.com/api/homepage-content";
  var PRODUCTS_API = "https://lana-chatbot-backend.onrender.com/api/products?limit=200";

  function setText(field, value) {
    document.querySelectorAll('[data-field="' + field + '"]').forEach(function (el) {
      el.textContent = value || "";
    });
  }

  function setHtml(field, value) {
    document.querySelectorAll('[data-field="' + field + '"]').forEach(function (el) {
      el.innerHTML = value || "";
    });
  }

  function setAttr(field, attr, value) {
    document.querySelectorAll('[data-field="' + field + '"]').forEach(function (el) {
      el.setAttribute(attr, value || "");
    });
  }

  function findProduct(products, slug) {
    if (!slug) return null;
    return products.find(function (p) { return p.slug === slug; }) || null;
  }

  function productUrl(slug) {
    return "https://www.lana-beauty.com/products/" + slug;
  }

  function populate(content, products) {
    if (content.hero) {
      setText("hero-kicker", content.hero.kicker);
      setText("hero-title-1", content.hero.titleLine1);
      setText("hero-title-2", content.hero.titleLine2Italic);
      setText("hero-title-3", content.hero.titleLine3);
      setText("hero-description", content.hero.description);
      setText("hero-button-text", content.hero.buttonText);
      setAttr("hero-button-link", "href", content.hero.buttonLink);
    }

    if (content.offerBar) {
      setText("offerbar-text", content.offerBar.text);
    }

    if (content.bestSellers) {
      setText("best-eyebrow", content.bestSellers.eyebrow);
      setText("best-title", content.bestSellers.title);
      (content.bestSellers.productSlugs || []).forEach(function (slug, i) {
        var n = i + 1;
        var product = findProduct(products, slug);
        if (!product) return;
        setAttr("best-image-" + n, "src", product.image);
        setAttr("best-image-" + n, "alt", product.name);
        setText("best-name-" + n, product.name);
        setAttr("best-link-" + n, "href", productUrl(product.slug));
      });
    }

    if (content.collections) {
      setText("coll-kicker", content.collections.kicker);
      setHtml("coll-title", content.collections.title);
      setText("coll-subtitle", content.collections.subtitle);

      ["her", "him", "unisex"].forEach(function (key) {
        var conf = content.collections[key];
        if (!conf) return;
        setText("coll-" + key + "-label", conf.label);
        var product = findProduct(products, conf.productSlug);
        if (product) {
          setAttr("coll-" + key + "-image", "src", product.image);
          setAttr("coll-" + key + "-image", "alt", conf.label);
          setAttr("coll-" + key + "-link", "href", productUrl(product.slug));
        }
      });
    }

    if (content.offers) {
      ["box1", "box2"].forEach(function (key) {
        var box = content.offers[key];
        if (!box) return;
        setText(key + "-eyebrow", box.eyebrow);
        setText(key + "-title1", box.titleLine1);
        setText(key + "-title2", box.titleLine2Italic);
        setText(key + "-note", box.note);
        setText(key + "-code", box.code);
        setText(key + "-btn-text", box.buttonText);
        setAttr(key + "-btn-link", "href", box.buttonLink);
      });
    }
  }

  function init() {
    Promise.all([
      fetch(CONTENT_API).then(function (r) { return r.json(); }),
      fetch(PRODUCTS_API).then(function (r) { return r.json(); }),
    ])
      .then(function (results) {
        var contentRes = results[0];
        var productsRes = results[1];
        if (!contentRes.success) return;
        var products = productsRes.data || productsRes || [];
        populate(contentRes.content, products);
      })
      .catch(function (e) {
        console.error("Lana homepage content error:", e);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
