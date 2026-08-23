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

  var PAYMENT_LOGO_CLASS = {
    visa: "visa", mastercard: "mastercard", meeza: "meeza", instapay: "instapay",
    souhoola: "souhoola", tru: "tru", aman: "aman",
  };

  function buildPaymentItem(item, prefix) {
    if (item.kind === "installments") {
      var el = document.createElement("div");
      el.className = "lana-" + prefix + "payment-item installments";
      var icon = document.createElement("span");
      icon.className = "lana-" + prefix + "installment-icon";
      el.appendChild(icon);

      if (prefix) {
        var textSpan = document.createElement("span");
        textSpan.innerHTML = "BANK<br>INSTALLMENTS";
        el.appendChild(textSpan);
      } else {
        var textWrap = document.createElement("span");
        textWrap.className = "lana-installment-text";
        var main = document.createElement("span");
        main.className = "lana-installment-main";
        main.innerHTML = "BANK<br>INSTALLMENTS";
        textWrap.appendChild(main);
        el.appendChild(textWrap);
      }
      return el;
    }

    if (item.kind === "cod") {
      var el2 = document.createElement("div");
      el2.className = "lana-" + prefix + "payment-cod";
      var icon2 = document.createElement("span");
      icon2.className = "lana-" + prefix + "cash-icon";
      el2.appendChild(icon2);
      var span2 = document.createElement("span");
      span2.innerHTML = "CASH<br>ON DELIVERY";
      el2.appendChild(span2);
      return el2;
    }

    var wrap = document.createElement("div");
    var cls = PAYMENT_LOGO_CLASS[item.id] || "";
    wrap.className = ("lana-" + prefix + "payment-item " + cls).trim();
    var img = document.createElement("img");
    img.src = item.imageUrl || "";
    img.alt = item.label || "";
    wrap.appendChild(img);
    return wrap;
  }

  function renderPaymentMethods(items) {
    if (!items || !items.length) return;
    var enabled = items.filter(function (i) { return i.enabled; });

    document.querySelectorAll(".lana-payment-methods").forEach(function (container) {
      container.innerHTML = "";
      enabled.forEach(function (item) { container.appendChild(buildPaymentItem(item, "")); });
    });

    document.querySelectorAll(".lana-gallery-payment-methods").forEach(function (container) {
      container.innerHTML = "";
      enabled.forEach(function (item) { container.appendChild(buildPaymentItem(item, "gallery-")); });
    });
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

    if (content.announcementBar) {
      ["item1", "item2", "item3"].forEach(function (key) {
        var item = content.announcementBar[key];
        if (!item) return;
        var n = key.slice(4);
        setText("ann-" + n + "-text", item.text);
        setText("ann-" + n + "-code", item.code);
      });
    }

    if (content.bestSellers) {
      setText("best-eyebrow", content.bestSellers.eyebrow);
      setText("best-title", content.bestSellers.title);
      (content.bestSellers.productSlugs || []).forEach(function (slug, i) {
        var n = i + 1;
        var product = findProduct(products, slug);
        if (!product) return;
        setAttr("best-image-" + n, "src", product.thumb);
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
          setAttr("coll-" + key + "-image", "src", product.thumb);
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

    if (content.brand) {
      var b = content.brand;
      setText("brand-kicker", b.kicker);
      setText("brand-small", b.small);
      setText("brand-title1", b.titleLine1);
      setText("brand-title2", b.titleLine2Em);
      setText("brand-description", b.description);
      setText("brand-value1-title", b.value1Title);
      setText("brand-value1-text", b.value1Text);
      setText("brand-value2-title", b.value2Title);
      setText("brand-value2-text", b.value2Text);
      setText("brand-value3-title", b.value3Title);
      setText("brand-value3-text", b.value3Text);
      setText("brand-bottom-text", b.bottomText);
    }

    if (content.paymentMethods) {
      renderPaymentMethods(content.paymentMethods.items);
    }
  }

  function pageHasKnownElements() {
    return (
      document.querySelectorAll("[data-field]").length > 0 ||
      document.querySelectorAll(".lana-payment-methods, .lana-gallery-payment-methods").length > 0
    );
  }

  var fetchedData = null;
  var populated = false;

  function tryPopulate() {
    if (populated || !fetchedData) return;
    if (!pageHasKnownElements()) return;
    populate(fetchedData.content, fetchedData.products);
    populated = true;
  }

  function init() {
    Promise.all([
      fetch(CONTENT_API, { cache: "no-store" }).then(function (r) { return r.json(); }),
      fetch(PRODUCTS_API, { cache: "no-store" }).then(function (r) { return r.json(); }),
    ])
      .then(function (results) {
        var contentRes = results[0];
        var productsRes = results[1];
        if (!contentRes.success) return;
        fetchedData = {
          content: contentRes.content,
          products: productsRes.data || productsRes || [],
        };
        tryPopulate();
      })
      .catch(function (e) {
        console.error("Lana homepage content error:", e);
      });

    // The Easy Orders page builder can render these Custom HTML
    // sections into the DOM after this script has already run (async
    // client-side rendering), so a single one-shot pass on load isn't
    // reliable — watch for the placeholder elements to actually show
    // up and populate as soon as they do, same pattern already used
    // elsewhere on this storefront for the same reason.
    var observer = new MutationObserver(function () {
      tryPopulate();
      if (populated) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also retry a few times on a plain timer as a fallback, in case
    // the sections are added in a way the observer doesn't catch.
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      tryPopulate();
      if (populated || attempts >= 20) {
        clearInterval(interval);
        observer.disconnect();
      }
    }, 500);
  }

  // Wrapped for the same reason as the other bundled files: an uncaught
  // throw here shouldn't be able to abort anything else in the bundle.
  function safeInit() {
    try {
      init();
    } catch (e) {
      console.error("Lana homepage.js init error:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeInit);
  } else {
    safeInit();
  }
})();
