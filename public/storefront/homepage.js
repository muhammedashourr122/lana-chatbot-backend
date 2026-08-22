(function () {
  "use strict";

  if (window.__lanaHomepageInit) return;
  window.__lanaHomepageInit = true;

  var CONTENT_API = "https://lana-chatbot-backend.onrender.com/api/homepage-content";
  var PRODUCTS_API = "https://lana-chatbot-backend.onrender.com/api/products?limit=200";

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = String(s == null ? "" : s);
    return div.innerHTML;
  }

  function findProduct(products, slug) {
    if (!slug) return null;
    return products.find(function (p) { return p.slug === slug; }) || null;
  }

  function productUrl(slug) {
    return "https://www.lana-beauty.com/products/" + slug;
  }

  // ---------------- HERO ----------------

  function heroHtml(hero) {
    return (
      '<div class="lana-v5-light"></div>' +
      '<div class="lana-v5-inner">' +
        '<div class="lana-v5-word">LANA\'S</div>' +
        '<div class="lana-v5-ribbon"></div>' +
        '<div class="lana-v5-fabric"></div>' +
        '<div class="lana-v5-orbit"></div>' +
        '<div class="lana-v5-orbit lana-v5-orbit-two"></div>' +
        '<div class="lana-v5-dot lana-v5-dot-one"></div>' +
        '<div class="lana-v5-dot lana-v5-dot-two"></div>' +
        '<div class="lana-v5-dot lana-v5-dot-three"></div>' +
        '<div class="lana-v5-content">' +
          '<div class="lana-v5-kicker">' + esc(hero.kicker) + '</div>' +
          '<h1 class="lana-v5-title">' +
            '<span>' + esc(hero.titleLine1) + '</span>' +
            '<span class="soft">' + esc(hero.titleLine2Italic) + '</span>' +
            '<span class="last">' + esc(hero.titleLine3) + '</span>' +
          '</h1>' +
          '<p class="lana-v5-description">' + esc(hero.description) + '</p>' +
          '<div class="lana-v5-actions">' +
            '<a href="' + esc(hero.buttonLink) + '" class="lana-v5-button"><span>' + esc(hero.buttonText) + '</span></a>' +
            '<div class="lana-v5-categories">' +
              '<a href="/collections/for-her">For Her</a><i>·</i>' +
              '<a href="/collections/for-him">For Him</a><i>·</i>' +
              '<a href="/collections/unisex">Unisex</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="lana-v5-side">Lana\'s Beauty · Eau de Parfum · Body Mist</div>' +
        '<div class="lana-v5-bottom"><div class="lana-v5-bottom-left">Made to be remembered</div></div>' +
      '</div>'
    );
  }

  // ---------------- BEST SELLERS ----------------

  function bestSellerCardHtml(product) {
    if (!product) return "";
    return (
      '<a href="' + esc(productUrl(product.slug)) + '" class="lana-best-card">' +
        '<div class="lana-best-image">' +
          '<img src="' + esc(product.thumb) + '" alt="' + esc(product.name) + '" loading="lazy">' +
        '</div>' +
        '<div class="lana-best-info">' +
          '<h3 class="lana-best-name">' + esc(product.name) + '</h3>' +
          '<span class="lana-best-shop">Shop Now</span>' +
        '</div>' +
      '</a>'
    );
  }

  function bestSellersHtml(bestSellers, products) {
    var cards = (bestSellers.productSlugs || [])
      .map(function (slug) { return findProduct(products, slug); })
      .map(bestSellerCardHtml)
      .join("");
    return (
      '<div class="lana-best-inner">' +
        '<div class="lana-best-heading">' +
          '<div class="lana-best-eyebrow">' + esc(bestSellers.eyebrow) + '</div>' +
          '<h2 class="lana-best-title">' + esc(bestSellers.title) + '</h2>' +
        '</div>' +
        '<div class="lana-best-grid">' + cards + '</div>' +
      '</div>'
    );
  }

  // ---------------- COLLECTIONS ----------------

  function collectionCardHtml(key, conf, products) {
    var product = findProduct(products, conf.productSlug);
    var image = product ? product.thumb : "";
    var link = product ? productUrl(product.slug) : "#";
    return (
      '<a href="' + esc(link) + '" class="lana-collection-card ' + key + '">' +
        '<img class="lana-collection-product" src="' + esc(image) + '" alt="' + esc(conf.label) + '" loading="lazy">' +
        '<span class="lana-collection-frame"></span>' +
        '<div class="lana-collection-info">' +
          '<div class="lana-collection-label">' + esc(conf.label) + '</div>' +
          '<h3 class="lana-collection-name">' + esc(conf.name) + '</h3>' +
          '<span class="lana-collection-shop">Shop Collection <span class="lana-collection-arrow">→</span></span>' +
        '</div>' +
      '</a>'
    );
  }

  function collectionsHtml(collections, products) {
    return (
      '<div class="lana-collections-inner">' +
        '<header class="lana-collections-header">' +
          '<div class="lana-collections-kicker">' + esc(collections.kicker) + '</div>' +
          '<h2 class="lana-collections-title">' + collections.title + '</h2>' +
          '<p class="lana-collections-subtitle">' + esc(collections.subtitle) + '</p>' +
        '</header>' +
        '<div class="lana-collections-grid">' +
          collectionCardHtml("her", Object.assign({ name: "For Her" }, collections.her), products) +
          collectionCardHtml("him", Object.assign({ name: "For Him" }, collections.him), products) +
          collectionCardHtml("unisex", Object.assign({ name: "Unisex" }, collections.unisex), products) +
        '</div>' +
      '</div>'
    );
  }

  // ---------------- OFFERS ----------------

  function offerBoxHtml(box, extraClass, benefitsHtml) {
    return (
      '<div class="lana-offer-box' + (extraClass ? " " + extraClass : "") + '">' +
        '<div class="lana-offer-content">' +
          '<div class="lana-offer-left">' +
            '<div class="lana-offer-eyebrow">' + esc(box.eyebrow) + '</div>' +
            '<h2 class="lana-offer-title"><span>' + esc(box.titleLine1) + '</span><br><em>' + esc(box.titleLine2Italic) + '</em></h2>' +
            '<p class="lana-offer-note">' + esc(box.note) + '</p>' +
          '</div>' +
          '<div class="lana-offer-code-wrap">' +
            '<div class="lana-offer-code-label">Your exclusive code</div>' +
            '<div class="lana-offer-code"><strong>' + esc(box.code) + '</strong><span class="lana-offer-copy-icon" aria-hidden="true"></span></div>' +
          '</div>' +
          (benefitsHtml || "") +
          '<a href="' + esc(box.buttonLink) + '" class="lana-offer-button">' + esc(box.buttonText) + '</a>' +
        '</div>' +
      '</div>'
    );
  }

  function offersHtml(offers) {
    var benefits =
      '<div class="lana-offer-benefits">' +
        '<span class="lana-offer-benefit">BUY 3</span>' +
        '<span class="lana-offer-benefit">GET 2 FREE</span>' +
        '<span class="lana-offer-benefit">FREE SHIPPING</span>' +
      '</div>';
    return (
      '<div class="lana-offer-inner"><div class="lana-offer-grid">' +
        offerBoxHtml(offers.box1, "", "") +
        offerBoxHtml(offers.box2, "lana-offer-box--explore", benefits) +
      '</div></div>'
    );
  }

  // ---------------- MOUNT ----------------

  function mount(id, className, innerHtml) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = className;
    el.innerHTML = innerHtml;
  }

  function render(content, products) {
    mount("lana-hero-mount", "lana-v5", heroHtml(content.hero));
    mount("lana-best-mount", "lana-best", bestSellersHtml(content.bestSellers, products));
    mount("lana-collections-mount", "lana-collections", collectionsHtml(content.collections, products));
    mount("lana-offers-mount", "lana-offer", offersHtml(content.offers));
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
        render(contentRes.content, products);
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
