/* Lana Beauty — live theme JS overrides */
(function () {
  function renamePagesHeading() {
    document.querySelectorAll("footer h3").forEach(function (h3) {
      if (h3.textContent.trim() === "Pages") {
        h3.textContent = "Terms and Policies";
      }
    });
  }

  var ORDER_API = "https://lana-chatbot-backend.onrender.com/api/orders/";

  function getOrderIdFromUrl() {
    if (location.pathname === "/thanks") {
      return new URLSearchParams(location.search).get("order_id");
    }
    var match = location.pathname.match(/^\/track\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function showOrderNumberInStatusRow() {
    var orderId = getOrderIdFromUrl();
    if (!orderId) return;

    var statusRow = document.querySelector(
      ".flex.flex-col.gap-6.p-5.border.rounded-lg.shadow-sm > dt.flex.flex-wrap.justify-between"
    );
    if (!statusRow || statusRow.children.length < 2) return;

    var el = document.getElementById("lana-order-number");
    var isNew = !el;

    if (isNew) {
      el = document.createElement("span");
      el.id = "lana-order-number";
      el.className = "mt-2 text-xl";
      el.style.color = "#6C4452";
      el.textContent = "Order #…";
    }

    // Keep it between the two existing spans: "Order Status:" … "Pending"
    var firstSpan = statusRow.children[0];
    if (firstSpan.nextSibling !== el) {
      firstSpan.insertAdjacentElement("afterend", el);
    }

    if (!isNew) return;

    fetch(ORDER_API + encodeURIComponent(orderId))
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject(new Error(res.status));
      })
      .then(function (order) {
        if (order && order.short_id) {
          el.textContent = "Order #" + order.short_id;
        } else {
          el.remove();
        }
      })
      .catch(function () {
        el.remove();
      });
  }

  var TRACK_API = "https://lana-chatbot-backend.onrender.com/api/track-order";
  var ORDERS_BY_PHONE_API = "https://lana-chatbot-backend.onrender.com/api/orders-by-phone";

  function buildTrackingForm() {
    if (location.pathname !== "/pages/tracking") return;
    if (document.getElementById("lana-track-form")) return;

    // Insert as a sibling AFTER the React-owned page_content node, never
    // write into it directly — mutating a React-managed subtree causes
    // hydration mismatches (React errors #418/#423/#425) that can crash
    // the whole page render.
    var pageContent = document.querySelector(".content_container.page_content");
    if (!pageContent) return;

    var host = document.createElement("div");
    host.style.cssText = "margin-top:24px;";
    pageContent.insertAdjacentElement("afterend", host);

    host.innerHTML =
      '<form id="lana-track-form" style="max-width:420px;margin:0 auto;display:flex;flex-direction:column;gap:14px;font-family:inherit;">' +
        '<div>' +
          '<label style="display:block;font-size:13px;font-weight:600;color:#3a2e2c;margin-bottom:6px;">Phone Number</label>' +
          '<input type="tel" id="lana-track-phone-input" placeholder="Enter your phone number" required ' +
            'style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid #E5E5EF;border-radius:10px;font-size:15px;" />' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:13px;font-weight:600;color:#3a2e2c;margin-bottom:6px;">Order Number <span style="font-weight:400;color:#8b7d82;">(optional)</span></label>' +
          '<input type="text" id="lana-track-order-number-input" placeholder="Leave blank to see all your orders" ' +
            'style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid #E5E5EF;border-radius:10px;font-size:15px;" />' +
        '</div>' +
        '<button type="submit" ' +
          'style="background:#6C4452;color:#fff;border:none;border-radius:999px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;">' +
          'Search' +
        '</button>' +
        '<p id="lana-track-error" style="display:none;color:#c94a4a;font-size:13px;text-align:center;margin:0;"></p>' +
        '<p style="text-align:center;font-size:12px;color:#8b7d82;margin:4px 0 0;">' +
          "Know your order number? Enter it above for a direct match. Otherwise, just search with your phone number to see everything." +
        '</p>' +
        '<div id="lana-all-orders-panel" style="display:none;flex-direction:column;gap:10px;"></div>' +
      '</form>';

    var form = document.getElementById("lana-track-form");
    var errorEl = document.getElementById("lana-track-error");
    var allOrdersPanel = document.getElementById("lana-all-orders-panel");

    function searchByPhoneOnly(phone, submitBtn) {
      allOrdersPanel.style.display = "flex";
      allOrdersPanel.innerHTML = '<p style="font-size:13px;color:#8b7d82;margin:0;">Loading your orders…</p>';

      fetch(ORDERS_BY_PHONE_API + "?phone=" + encodeURIComponent(phone))
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var orders = (data && data.orders) || [];
          if (orders.length === 0) {
            allOrdersPanel.innerHTML =
              '<p style="font-size:13px;color:#8b7d82;margin:0;">No orders found for this phone number.</p>';
          } else {
            var html = "";
            orders.forEach(function (o) {
              var dateStr = new Date(o.created_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              });
              html +=
                '<a href="/track/' + encodeURIComponent(o.order_id) + '" ' +
                  'style="display:flex;justify-content:space-between;align-items:center;text-decoration:none;color:inherit;' +
                  'border:1px solid #E5E5EF;border-radius:10px;padding:10px 14px;">' +
                  '<span style="font-size:14px;font-weight:600;color:#3a2e2c;">Order #' + o.short_id + '</span>' +
                  '<span style="font-size:12px;color:#8b7d82;">' + dateStr + ' — ' + (o.status || "") + '</span>' +
                '</a>';
            });
            allOrdersPanel.innerHTML = html;
          }
        })
        .catch(function () {
          allOrdersPanel.innerHTML =
            '<p style="font-size:13px;color:#c94a4a;margin:0;">Couldn\'t load your orders. Please try again.</p>';
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = "Search";
        });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.style.display = "none";
      allOrdersPanel.style.display = "none";
      allOrdersPanel.innerHTML = "";

      var orderNumber = document.getElementById("lana-track-order-number-input").value.trim();
      var phone = document.getElementById("lana-track-phone-input").value.trim();
      if (!phone) return;

      var submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      submitBtn.textContent = "Searching…";

      if (!orderNumber) {
        searchByPhoneOnly(phone, submitBtn);
        return;
      }

      var url = TRACK_API +
        "?order_number=" + encodeURIComponent(orderNumber) +
        "&phone=" + encodeURIComponent(phone);

      fetch(url)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.success && data.order_id) {
            location.href = "/track/" + encodeURIComponent(data.order_id);
          } else {
            errorEl.textContent = (data && data.error) || "Order not found.";
            errorEl.style.display = "block";
            submitBtn.disabled = false;
            submitBtn.textContent = "Search";
          }
        })
        .catch(function () {
          errorEl.textContent = "Something went wrong. Please try again.";
          errorEl.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "Search";
        });
    });
  }

  /* =======================================================
     ESTIMATED DELIVERY DATE
     Shown near the buy button on product pages. Egypt's
     weekend is Friday + Saturday, so those are skipped when
     counting the 1-3 business day window.
     ======================================================= */

  function addBusinessDays(date, days) {
    var result = new Date(date);
    var added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      var day = result.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
      if (day !== 5 && day !== 6) added++;
    }
    return result;
  }

  function formatDeliveryDate(date) {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  function showDeliveryEstimate() {
    if (!/^\/products\//.test(location.pathname)) return;

    var buyBtn = document.querySelector(".checkout_btn");
    if (!buyBtn) return;

    var existing = document.getElementById("lana-delivery-estimate");
    // If a stale copy is orphaned (detached from the current buy button,
    // e.g. after client-side navigation to a different product), rebuild.
    if (existing) {
      if (existing.previousElementSibling === buyBtn) return;
      existing.remove();
    }

    var today = new Date();
    var earliest = addBusinessDays(today, 1);
    var latest = addBusinessDays(today, 3);

    var el = document.createElement("p");
    el.id = "lana-delivery-estimate";
    el.style.cssText =
      "text-align:center;font-size:13px;color:#6C4452;margin-top:10px;";
    el.textContent =
      "Estimated delivery: " + formatDeliveryDate(earliest) + " – " + formatDeliveryDate(latest);

    buyBtn.insertAdjacentElement("afterend", el);
  }

  /* =======================================================
     SCENT FINDER QUIZ
     Multi-step: a broad scent-family question, then (only when
     a family has more than one match) a follow-up to pick
     between them — every option and result is grounded in a
     real product's actual listed scent notes, not fabricated.
     ======================================================= */

  var SCENT_FAMILIES = [
    { key: "warm", label: "Warm & Spicy", desc: "Cozy amber, sweet gourmand" },
    { key: "fresh", label: "Fresh & Floral", desc: "Soft florals, clean freshness" },
    { key: "bold", label: "Bold & Woody", desc: "Refined spices, warm woods" },
    { key: "fruity", label: "Sweet & Fruity", desc: "Juicy, playful sweetness" },
  ];

  var SCENT_PRODUCTS = {
    warm: [
      { slug: "body-splash-amber-nights", name: "Amber Nights", note: "Aromatic spices, sweet gourmand, warm amber" },
    ],
    fresh: [
      { slug: "body-splash-pure-skin", name: "Pure Skin", note: "Juicy fruits, soft florals, warm musk" },
      { slug: "body-splash-pink-shadow", name: "Pink Shadow", note: "Sparkling freshness, white florals" },
    ],
    bold: [
      { slug: "body-splash-shadow-noir", name: "Shadow Noir", note: "Fresh aromatics, refined spices, warm woods" },
    ],
    fruity: [
      { slug: "body-splash-ruby-mist", name: "Ruby Mist", note: "Fresh pomegranate, soft musk" },
    ],
  };

  function buildScentFinder() {
    if (location.pathname !== "/pages/scent-finder") return;
    if (document.getElementById("lana-scent-finder")) return;

    var pageContent = document.querySelector(".content_container.page_content");
    if (!pageContent) return;

    var host = document.createElement("div");
    host.id = "lana-scent-finder";
    host.style.cssText = "max-width:640px;margin:24px auto 0;font-family:inherit;";
    pageContent.insertAdjacentElement("afterend", host);

    function renderOptionGrid(title, subtitle, items, onPick, onBack) {
      var html =
        '<h2 style="text-align:center;font-size:20px;font-weight:700;color:#3a2e2c;margin:0 0 6px;">' + title + '</h2>' +
        '<p style="text-align:center;font-size:14px;color:#8b7d82;margin:0 0 24px;">' + subtitle + '</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">';

      items.forEach(function (item, i) {
        html +=
          '<button type="button" class="lana-scent-opt-btn" data-opt-index="' + i + '" ' +
            'style="cursor:pointer;text-align:left;padding:16px;border:1px solid #E5E5EF;border-radius:14px;background:#fff;transition:border-color .2s;">' +
            '<div style="font-weight:600;font-size:15px;color:#3a2e2c;margin-bottom:4px;">' + item.label + '</div>' +
            '<div style="font-size:12px;color:#8b7d82;">' + item.desc + '</div>' +
          '</button>';
      });

      html += '</div>';

      if (onBack) {
        html +=
          '<div style="text-align:center;margin-top:18px;">' +
            '<button type="button" id="lana-scent-back" ' +
              'style="background:none;border:none;color:#8b7d82;text-decoration:underline;font-size:12px;cursor:pointer;">' +
              '&larr; Back' +
            '</button>' +
          '</div>';
      }

      host.innerHTML = html;

      host.querySelectorAll(".lana-scent-opt-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          onPick(items[Number(btn.getAttribute("data-opt-index"))]);
        });
        btn.addEventListener("mouseenter", function () {
          btn.style.borderColor = "#6C4452";
        });
        btn.addEventListener("mouseleave", function () {
          btn.style.borderColor = "#E5E5EF";
        });
      });

      if (onBack) {
        document.getElementById("lana-scent-back").addEventListener("click", onBack);
      }
    }

    function renderStep1() {
      renderOptionGrid(
        "Find Your Signature Scent",
        "Step 1 of 2 — which family pulls you in?",
        SCENT_FAMILIES.map(function (f) { return { label: f.label, desc: f.desc, key: f.key }; }),
        function (family) {
          var candidates = SCENT_PRODUCTS[family.key];
          if (candidates.length === 1) {
            renderResult(candidates[0]);
          } else {
            renderStep2(candidates);
          }
        },
        null
      );
    }

    function renderStep2(candidates) {
      renderOptionGrid(
        "Almost There",
        "Step 2 of 2 — which one feels more you?",
        candidates.map(function (p) { return { label: p.name, desc: p.note, slug: p.slug }; }),
        function (picked) {
          renderResult(candidates.filter(function (p) { return p.slug === picked.slug; })[0]);
        },
        renderStep1
      );
    }

    function renderResult(product) {
      host.innerHTML =
        '<div style="text-align:center;">' +
          '<p style="font-size:13px;color:#8b7d82;margin:0 0 6px;text-transform:uppercase;letter-spacing:.05em;">Your signature scent</p>' +
          '<h2 style="font-size:22px;font-weight:700;color:#3a2e2c;margin:0 0 8px;">' + product.name + '</h2>' +
          '<p style="font-size:14px;color:#8b7d82;margin:0 0 20px;">' + product.note + '</p>' +
          '<a href="/products/' + encodeURIComponent(product.slug) + '" ' +
            'style="display:inline-block;background:#6C4452;color:#fff;text-decoration:none;padding:12px 32px;border-radius:999px;font-size:14px;font-weight:600;margin-bottom:14px;">' +
            'Shop ' + product.name +
          '</a><br/>' +
          '<button type="button" id="lana-scent-retry" ' +
            'style="background:none;border:none;color:#6C4452;text-decoration:underline;font-size:13px;cursor:pointer;">' +
            'Retake the Quiz' +
          '</button>' +
        '</div>';

      document.getElementById("lana-scent-retry").addEventListener("click", renderStep1);
    }

    renderStep1();
  }

  /* =======================================================
     SCENT NOTES BREAKDOWN
     Top/Heart/Base note cards on product pages, derived from
     each product's real listed ingredients (order they're
     given in the description follows the standard top→base
     convention), not invented.
     ======================================================= */

  var SCENT_NOTES = {
    "body-splash-amber-nights": { top: "Aromatic Spices", heart: "Sweet & Creamy", base: "Woody Amber" },
    "body-splash-shadow-noir": { top: "Fresh & Aromatic", heart: "Refined Spices", base: "Warm Woods" },
    "body-splash-pure-skin": { top: "Juicy Fruits", heart: "Soft Florals", base: "Warm Musk" },
    "body-splash-ruby-mist": { top: "Fresh Pomegranate", heart: "Soft Musk", base: "Lingering Musk" },
    "body-splash-pink-shadow": { top: "Sparkling Freshness", heart: "White Florals", base: "Warm Finish" },
  };

  function getProductSlugFromUrl() {
    var match = location.pathname.match(/^\/products\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function showScentNotes() {
    var slug = getProductSlugFromUrl();
    if (!slug || !SCENT_NOTES[slug]) return;

    var existing = document.getElementById("lana-scent-notes");
    // Next.js routes between products client-side without a full reload,
    // so a stale block from a previously viewed product can stick around —
    // rebuild it whenever the slug it was built for no longer matches.
    if (existing) {
      if (existing.dataset.slug === slug) return;
      existing.remove();
    }

    var buyBtn = document.querySelector(".checkout_btn");
    if (!buyBtn) return;

    // Anchor after the delivery estimate if present, else the buy button.
    var anchor = document.getElementById("lana-delivery-estimate") || buyBtn;

    var notes = SCENT_NOTES[slug];
    var tiers = [
      { label: "Top", value: notes.top },
      { label: "Heart", value: notes.heart },
      { label: "Base", value: notes.base },
    ];

    var el = document.createElement("div");
    el.id = "lana-scent-notes";
    el.dataset.slug = slug;
    el.style.cssText =
      "display:flex;justify-content:center;gap:18px;margin-top:16px;text-align:center;";

    tiers.forEach(function (tier) {
      var col = document.createElement("div");
      col.innerHTML =
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8b7d82;margin-bottom:2px;">' + tier.label + '</div>' +
        '<div style="font-size:13px;font-weight:600;color:#3a2e2c;">' + tier.value + '</div>';
      el.appendChild(col);
    });

    anchor.insertAdjacentElement("afterend", el);
  }

  /* =======================================================
     PRODUCT STRUCTURED DATA (SEO)
     Injects real, verifiable schema.org Product JSON-LD —
     name/image/price/availability only. No fabricated
     ratings/review counts, since Google penalizes fake
     structured data.
     ======================================================= */

  var PRODUCTS_API = "https://lana-chatbot-backend.onrender.com/api/products?limit=200";
  var productCatalogCache = null;

  function injectProductSchema() {
    var slug = getProductSlugFromUrl();
    if (!slug) return;

    var existingTag = document.getElementById("lana-product-schema");
    if (existingTag) {
      if (existingTag.dataset.slug === slug) return;
      existingTag.remove();
    }

    function inject(product) {
      if (!product) return;
      var stillCurrent = document.getElementById("lana-product-schema");
      if (stillCurrent && stillCurrent.dataset.slug === slug) return;
      if (stillCurrent) stillCurrent.remove();

      var schema = {
        "@context": "https://schema.org/",
        "@type": "Product",
        name: product.name,
        image: product.thumb,
        sku: product.slug,
        url: "https://www.lana-beauty.com/products/" + product.slug,
        offers: {
          "@type": "Offer",
          priceCurrency: "EGP",
          price: String(product.price),
          availability: "https://schema.org/InStock",
          url: "https://www.lana-beauty.com/products/" + product.slug,
        },
      };

      var tag = document.createElement("script");
      tag.type = "application/ld+json";
      tag.id = "lana-product-schema";
      tag.dataset.slug = slug;
      tag.textContent = JSON.stringify(schema);
      document.head.appendChild(tag);
    }

    if (productCatalogCache) {
      inject(productCatalogCache.find(function (p) { return p.slug === slug; }));
      return;
    }

    fetch(PRODUCTS_API)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        productCatalogCache = (data && data.data) || [];
        inject(productCatalogCache.find(function (p) { return p.slug === slug; }));
      })
      .catch(function () {});
  }

  /* =======================================================
     BOSTA SHIPMENT TIMELINE
     Reads tracking events we've stored (via the Bosta webhook
     -> Upstash pipeline) and injects them into the native
     order-events <ul> as extra <li> entries, matching its
     existing "Order Created" markup.
     ======================================================= */

  var TRACKING_EVENTS_API = "https://lana-chatbot-backend.onrender.com/api/tracking-events/";

  function showShipmentTimeline() {
    var orderId = getOrderIdFromUrl();
    if (!orderId) return;
    if (document.getElementById("lana-shipment-timeline")) return;

    var list = document.querySelector("ul.rounded-lg.border.p-4.list-disc");
    if (!list) return;

    // Guard synchronously, before the fetch even starts — otherwise two
    // debounce ticks firing back-to-back both pass the check above and
    // both end up appending the same events (the duplicate-entries bug).
    if (list.dataset.lanaTimelineFetching === orderId) return;
    list.dataset.lanaTimelineFetching = orderId;

    var latestTrackingNumber = null;

    fetch(TRACKING_EVENTS_API + encodeURIComponent(orderId))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var events = (data && data.events) || [];
        if (events.length === 0) return;

        var marker = document.createElement("span");
        marker.id = "lana-shipment-timeline";
        marker.style.display = "none";
        list.appendChild(marker);

        events.forEach(function (evt) {
          var li = document.createElement("li");
          li.className = "ms-2";

          var dateStr = new Date(evt.timestamp).toLocaleString("en-US", {
            month: "numeric", day: "numeric", year: "numeric",
            hour: "numeric", minute: "2-digit",
          });

          var label = evt.stateName || ("State " + evt.state);
          if (evt.trackingNumber) {
            label += " — Tracking #" + evt.trackingNumber;
            latestTrackingNumber = evt.trackingNumber;
          }

          li.innerHTML =
            '<span>' + label + '</span><br>' +
            '<span class="text-gray-500 text-sm">' + dateStr + '</span>';

          list.appendChild(li);
        });

        if (latestTrackingNumber) {
          var btn = document.createElement("a");
          btn.href = "https://bosta.co/en-eg/tracking-shipments?shipment-number=" + encodeURIComponent(latestTrackingNumber);
          btn.target = "_blank";
          btn.rel = "noreferrer";
          btn.style.cssText =
            "display:inline-block;margin-top:14px;background:#6C4452;color:#fff;" +
            "text-decoration:none;padding:10px 24px;border-radius:999px;font-size:13px;font-weight:600;";
          btn.textContent = "Track Now";
          list.insertAdjacentElement("afterend", btn);
        }
      })
      .catch(function () {});
  }

  function runAllChecks() {
    renamePagesHeading();
    showOrderNumberInStatusRow();
    buildTrackingForm();
    showDeliveryEstimate();
    buildScentFinder();
    showScentNotes();
    showShipmentTimeline();
    injectProductSchema();
  }

  runAllChecks();

  // Safety net: React can re-render the page (hydration, client-side nav, etc.)
  // Debounced — React's initial hydration alone can fire hundreds of DOM
  // mutations in rapid succession, and running every function above on
  // each one synchronously can lock up the tab.
  var debounceTimer = null;
  var observer = new MutationObserver(function () {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runAllChecks, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
