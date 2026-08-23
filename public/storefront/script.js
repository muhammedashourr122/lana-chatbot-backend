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
    var existingHost = document.getElementById("lana-track-form-host");
    if (location.pathname !== "/pages/tracking") {
      // Client-side navigation away otherwise leaves this behind on
      // every other page (same leak class as the scent finder/offers
      // injectors below).
      if (existingHost) existingHost.remove();
      return;
    }
    if (existingHost) return;

    // Insert as a sibling AFTER the React-owned page_content node, never
    // write into it directly — mutating a React-managed subtree causes
    // hydration mismatches (React errors #418/#423/#425) that can crash
    // the whole page render.
    var pageContent = document.querySelector(".content_container.page_content");
    if (!pageContent) return;

    var host = document.createElement("div");
    host.id = "lana-track-form-host";
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
     Gender gate first (For Her / For Him / Unisex), pulled from
     the real catalog categories — so a product never appears as
     a match outside the category it's actually listed under
     (e.g. Shadow Noir is For Him only, never shown to a "For
     Her" answer). Remaining lifestyle questions are filtered to
     only that gender's real products, then simple point-tallying
     picks the winner. Result card shows live price/image from
     the catalog API; tagline/traits/moment copy is authored,
     grounded in each product's actual listed scent notes.
     ======================================================= */

  // From /api/catalog/category/{for-her,for-him,unisex} — Amber Nights
  // is the one product listed under all three.
  var GENDER_PRODUCTS = {
    her: ["body-splash-pure-skin", "body-splash-pink-shadow", "body-splash-ruby-mist", "body-splash-amber-nights"],
    him: ["body-splash-shadow-noir", "body-splash-amber-nights"],
    unisex: ["body-splash-amber-nights"],
  };

  var GENDER_OPTIONS = [
    { label: "For Her", key: "her" },
    { label: "For Him", key: "him" },
    { label: "Unisex", key: "unisex" },
  ];

  var SCENT_PERSONAS = {
    "body-splash-amber-nights": {
      name: "Amber Nights",
      tagline: "Warm. Grounded. Effortless.",
      note: "Aromatic spices, sweet gourmand, warm amber",
      traits: ["Warm", "Grounded", "Effortless"],
      moment: "You don't chase the room — the room settles around you. Amber Nights is cozy without trying, the kind of warmth people lean into.",
      bestWornWhen: "Quiet nights in, slow mornings, or anywhere you want to feel held.",
    },
    "body-splash-pure-skin": {
      name: "Pure Skin",
      tagline: "Calm. Clean. Put together.",
      note: "Juicy fruits, soft florals, warm musk",
      traits: ["Calm", "Clean", "Gentle"],
      moment: "Everything about you is intentional — soft, clear, unhurried. Pure Skin is the scent of someone who has nothing to prove.",
      bestWornWhen: "Everyday wear, mornings, or anytime you want to feel like yourself.",
    },
    "body-splash-pink-shadow": {
      name: "Pink Shadow",
      tagline: "Romantic. Soft. Dreamy.",
      note: "Sparkling freshness, white florals",
      traits: ["Romantic", "Soft", "Dreamy"],
      moment: "You notice the small, beautiful things. Pink Shadow is sparkling and floral — a little bit of daydream, worn out loud.",
      bestWornWhen: "Dates, brunches with friends, or any day that deserves softness.",
    },
    "body-splash-shadow-noir": {
      name: "Shadow Noir",
      tagline: "Bold. Confident. Magnetic.",
      note: "Fresh aromatics, refined spices, warm woods",
      traits: ["Bold", "Confident", "Magnetic"],
      moment: "The moment you walk in, people notice. Shadow Noir is sharp and warm at once — impossible to miss, impossible to forget.",
      bestWornWhen: "Nights out, big moments, or any time you're the main character.",
    },
    "body-splash-ruby-mist": {
      name: "Ruby Mist",
      tagline: "Fun. Playful. Bright.",
      note: "Fresh pomegranate, soft musk",
      traits: ["Fun", "Playful", "Bright"],
      moment: "You bring the energy without even trying. Ruby Mist is juicy and bright — the scent of someone always up for something new.",
      bestWornWhen: "Daytime plans, travel, or anywhere the day could turn into an adventure.",
    },
  };

  var SCENT_QUIZ_QUESTIONS = [
    {
      question: "Pick the moment you'd want to smell incredible in.",
      options: [
        { label: "A slow night in — candles lit, no plans.", slug: "body-splash-amber-nights" },
        { label: "A regular day — errands, coffee, life as usual.", slug: "body-splash-pure-skin" },
        { label: "Brunch with your favorite people.", slug: "body-splash-pink-shadow" },
        { label: "Walking into a room and owning it.", slug: "body-splash-shadow-noir" },
        { label: "A spontaneous trip with your best friend.", slug: "body-splash-ruby-mist" },
      ],
    },
    {
      question: "Which note pulls you in the most?",
      options: [
        { label: "Warm amber and spice.", slug: "body-splash-amber-nights" },
        { label: "Soft musk with a hint of fruit.", slug: "body-splash-pure-skin" },
        { label: "Sparkling white florals.", slug: "body-splash-pink-shadow" },
        { label: "Woody, refined spice.", slug: "body-splash-shadow-noir" },
        { label: "Bright, juicy pomegranate.", slug: "body-splash-ruby-mist" },
      ],
    },
    {
      question: "If someone described your energy in one line, it'd be:",
      options: [
        { label: "Steady and comforting — never in a rush.", slug: "body-splash-amber-nights" },
        { label: "Effortless. Doesn't try, just is.", slug: "body-splash-pure-skin" },
        { label: "Soft-spoken, with a romantic streak.", slug: "body-splash-pink-shadow" },
        { label: "Impossible to ignore.", slug: "body-splash-shadow-noir" },
        { label: "Always the one starting something fun.", slug: "body-splash-ruby-mist" },
      ],
    },
  ];

  function buildScentFinder() {
    var existing = document.getElementById("lana-scent-finder");
    if (location.pathname !== "/pages/scent-finder") {
      // Client-side navigation away from this page (no full reload)
      // otherwise leaves this injected block behind on every other page.
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    var pageContent = document.querySelector(".content_container.page_content");
    if (!pageContent) return;

    var host = document.createElement("div");
    host.id = "lana-scent-finder";
    host.style.cssText = "max-width:520px;margin:24px auto 0;font-family:inherit;";
    pageContent.insertAdjacentElement("afterend", host);

    var selectedGender = null;
    var questions = [];
    var current = 0;
    var scores = {};
    var answered = [];

    function renderGenderStep() {
      var html =
        '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8b7d82;margin-bottom:14px;">Step 1</div>' +
        '<h2 style="font-size:20px;font-weight:700;color:#211c1f;margin:0 0 20px;font-family:Georgia,\'Times New Roman\',serif;">Who are we finding a scent for?</h2>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">';

      GENDER_OPTIONS.forEach(function (opt, i) {
        html +=
          '<button type="button" class="lana-scent-gender-btn" data-gender-index="' + i + '" ' +
            'style="cursor:pointer;text-align:left;padding:14px 16px;border:1.5px solid #ece1dc;' +
            'border-radius:12px;background:#fff;font-size:13px;font-weight:600;color:#211c1f;transition:border-color .2s;">' +
            opt.label +
          '</button>';
      });

      html += '</div>';
      host.innerHTML = html;

      host.querySelectorAll(".lana-scent-gender-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var gender = GENDER_OPTIONS[Number(btn.getAttribute("data-gender-index"))].key;
          startQuizForGender(gender);
        });
      });
    }

    function startQuizForGender(gender) {
      selectedGender = gender;
      var candidates = GENDER_PRODUCTS[gender];

      if (candidates.length === 1) {
        renderResult(candidates[0]);
        return;
      }

      questions = SCENT_QUIZ_QUESTIONS.map(function (q) {
        return {
          question: q.question,
          options: q.options.filter(function (o) { return candidates.indexOf(o.slug) !== -1; }),
        };
      });
      current = 0;
      scores = {};
      answered = [];
      renderQuestion();
    }

    function renderProgress() {
      var total = questions.length;
      var bars = "";
      for (var i = 0; i < total; i++) {
        var filled = i <= current;
        bars +=
          '<span style="flex:1;height:5px;border-radius:3px;background:' +
          (filled ? "#6C4452" : "#ece1dc") + ';"></span>';
      }
      return (
        '<div style="display:flex;gap:5px;margin-bottom:8px;">' + bars + '</div>' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8b7d82;margin-bottom:14px;">' +
        "Question " + (current + 1) + " of " + total + "</div>"
      );
    }

    function renderQuestion() {
      var q = questions[current];
      var html = renderProgress() +
        '<h2 style="font-size:20px;font-weight:700;color:#211c1f;margin:0 0 20px;font-family:Georgia,\'Times New Roman\',serif;">' + q.question + '</h2>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">';

      q.options.forEach(function (opt, i) {
        var isSelected = answered[current] === i;
        html +=
          '<button type="button" class="lana-scent-opt-btn" data-opt-index="' + i + '" ' +
            'style="cursor:pointer;text-align:left;padding:14px 16px;border:1.5px solid ' + (isSelected ? "#6C4452" : "#ece1dc") + ';' +
            'border-radius:12px;background:' + (isSelected ? "#f1e4e8" : "#fff") + ';font-size:13px;color:#211c1f;transition:border-color .2s,background .2s;">' +
            opt.label +
          '</button>';
      });

      html += '</div>';

      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:22px;">';
      html +=
        '<button type="button" id="lana-scent-back" style="background:none;border:1.5px solid #ece1dc;color:#211c1f;border-radius:999px;padding:9px 20px;font-size:12px;font-weight:700;cursor:pointer;">Back</button>';
      var hasAnswer = answered[current] != null;
      html +=
        '<button type="button" id="lana-scent-next" ' + (hasAnswer ? "" : "disabled") + ' ' +
        'style="background:' + (hasAnswer ? "#6C4452" : "#d8c7cd") + ';color:#fff;border:none;border-radius:999px;padding:10px 26px;font-size:12px;font-weight:700;cursor:' + (hasAnswer ? "pointer" : "default") + ';">' +
        (current === questions.length - 1 ? "See your scent" : "Next") +
        '</button>';
      html += '</div>';

      host.innerHTML = html;

      host.querySelectorAll(".lana-scent-opt-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          answered[current] = Number(btn.getAttribute("data-opt-index"));
          renderQuestion();
        });
      });

      document.getElementById("lana-scent-back").addEventListener("click", function () {
        if (current > 0) {
          current--;
          renderQuestion();
        } else {
          renderGenderStep();
        }
      });

      var nextBtn = document.getElementById("lana-scent-next");
      if (nextBtn && hasAnswer) {
        nextBtn.addEventListener("click", function () {
          var chosenSlug = q.options[answered[current]].slug;
          scores[chosenSlug] = (scores[chosenSlug] || 0) + 1;

          if (current < questions.length - 1) {
            current++;
            renderQuestion();
          } else {
            renderResult(pickWinningSlug());
          }
        });
      }
    }

    function pickWinningSlug() {
      var bestSlug = null;
      var bestScore = -1;
      Object.keys(scores).forEach(function (slug) {
        if (scores[slug] > bestScore) {
          bestScore = scores[slug];
          bestSlug = slug;
        }
      });
      return bestSlug;
    }

    function renderResult(slug) {
      var persona = SCENT_PERSONAS[slug];

      host.innerHTML =
        '<div style="text-align:center;background:linear-gradient(160deg,#faf1f3,#f4e4e8);border-radius:22px;padding:32px 24px;">' +
          '<span style="display:inline-block;border:1px solid #6C4452;color:#6C4452;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:5px 14px;border-radius:999px;margin-bottom:18px;">Your Scent</span>' +
          '<div id="lana-scent-result-image" style="width:140px;height:140px;margin:0 auto 16px;border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;"></div>' +
          '<h2 style="font-family:Georgia,\'Times New Roman\',serif;font-size:26px;font-weight:400;color:#211c1f;margin:0 0 4px;">' + persona.name + '</h2>' +
          '<p style="color:#8a6573;font-size:12px;font-weight:700;letter-spacing:.5px;margin:0 0 18px;">' + persona.tagline + '</p>' +
          '<p style="font-family:Georgia,\'Times New Roman\',serif;font-size:16px;color:#211c1f;margin:0 0 10px;">Your moment is <em style="color:#8a6573;font-style:italic;">' + persona.name + '</em></p>' +
          '<p style="font-size:12.5px;line-height:1.7;color:#5a5254;max-width:380px;margin:0 auto 18px;">' + persona.moment + '</p>' +
          '<div style="display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin-bottom:20px;">' +
            persona.traits.map(function (t) {
              return '<span style="background:#6C4452;color:#fff;font-size:10px;font-weight:700;padding:6px 14px;border-radius:999px;">' + t + '</span>';
            }).join("") +
          '</div>' +
          '<div style="background:#fff;border-radius:14px;padding:14px 18px;text-align:left;margin-bottom:22px;">' +
            '<div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8a6573;margin-bottom:6px;">Best Worn When</div>' +
            '<div style="font-size:12.5px;color:#5a5254;line-height:1.6;">' + persona.bestWornWhen + '</div>' +
          '</div>' +
          '<div id="lana-scent-result-price" style="font-size:18px;font-weight:700;color:#211c1f;margin-bottom:16px;"></div>' +
          '<a id="lana-scent-result-shop" href="/products/' + encodeURIComponent(slug) + '" ' +
            'style="display:inline-block;background:#6C4452;color:#fff;text-decoration:none;padding:13px 34px;border-radius:999px;font-size:13px;font-weight:700;">' +
            'Shop ' + persona.name +
          '</a>' +
        '</div>' +
        '<div style="text-align:center;margin-top:18px;">' +
          '<button type="button" id="lana-scent-retry" style="background:none;border:1.5px solid #ece1dc;color:#211c1f;border-radius:999px;padding:9px 22px;font-size:12px;font-weight:700;cursor:pointer;">Take it again</button>' +
        '</div>';

      document.getElementById("lana-scent-retry").addEventListener("click", function () {
        selectedGender = null;
        renderGenderStep();
      });

      fetch(PRODUCTS_API)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var products = (data && data.data) || [];
          var product = products.filter(function (p) { return p.slug === slug; })[0];
          if (!product) return;

          var imgHost = document.getElementById("lana-scent-result-image");
          if (imgHost && product.thumb) {
            imgHost.innerHTML = '<img src="' + product.thumb + '" alt="' + persona.name + '" style="width:100%;height:100%;object-fit:contain;padding:10px;">';
          }
        })
        .catch(function () {});

      // Sale price only lives on the single-product endpoint, not the
      // list one above — separate fetch so a slow/failed price lookup
      // never blocks the image from showing.
      fetch("https://lana-chatbot-backend.onrender.com/api/products/" + encodeURIComponent(slug) + "/price")
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var priceHost = document.getElementById("lana-scent-result-price");
          if (!priceHost || !data.success) return;

          if (data.on_sale) {
            priceHost.innerHTML =
              '<span>' + data.sale_price + ' EGP</span>' +
              '<span style="font-weight:400;font-size:13px;color:#918789;text-decoration:line-through;margin-left:8px;">' + data.price + ' EGP</span>';
          } else {
            priceHost.textContent = data.price + " EGP";
          }
        })
        .catch(function () {});
    }

    renderGenderStep();
  }

  /* =======================================================
     OFFERS PAGE
     Injects the exact same offer-boxes markup used on the
     homepage (data-field attributes + .lana-offer-* classes,
     already styled by homepage.css inside bundle.css) — the
     already-running homepage.js MutationObserver picks these
     new elements up and fills them in automatically, same as
     anywhere else on the site. Editing Offer Box 1/2 in the
     Homepage Builder updates this page and the homepage at once.
     ======================================================= */

  function buildOffersPage() {
    var existing = document.getElementById("lana-offers-page");
    if (location.pathname !== "/pages/offers") {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    var pageContent = document.querySelector(".content_container.page_content");
    if (!pageContent) return;

    var host = document.createElement("div");
    host.id = "lana-offers-page";
    host.innerHTML =
      '<section class="lana-offer">' +
        '<div class="lana-offer-inner">' +
          '<div class="lana-offer-grid">' +

            '<div class="lana-offer-box">' +
              '<div class="lana-offer-content">' +
                '<div class="lana-offer-left">' +
                  '<div class="lana-offer-eyebrow" data-field="box1-eyebrow">A Little Something Extra</div>' +
                  '<h2 class="lana-offer-title">' +
                    '<span data-field="box1-title1">More scents.</span><br>' +
                    '<em data-field="box1-title2">More to love.</em>' +
                  '</h2>' +
                  '<p class="lana-offer-note" data-field="box1-note">Buy 2 or more fragrances and enjoy 10% off your order.</p>' +
                '</div>' +
                '<div class="lana-offer-code-wrap">' +
                  '<div class="lana-offer-code-label">Your exclusive code</div>' +
                  '<div class="lana-offer-code">' +
                    '<strong data-field="box1-code">SAVE10</strong>' +
                    '<span class="lana-offer-copy-icon" aria-hidden="true"></span>' +
                  '</div>' +
                '</div>' +
                '<a href="https://www.lana-beauty.com/collections/all" class="lana-offer-button" data-field="box1-btn-link">' +
                  '<span data-field="box1-btn-text">SHOP THE COLLECTION</span>' +
                '</a>' +
              '</div>' +
            '</div>' +

            '<div class="lana-offer-box lana-offer-box--explore">' +
              '<div class="lana-offer-content">' +
                '<div class="lana-offer-left">' +
                  '<div class="lana-offer-eyebrow" data-field="box2-eyebrow">Explore More. Save More.</div>' +
                  '<h2 class="lana-offer-title">' +
                    '<span data-field="box2-title1">Buy 3</span><br>' +
                    '<em data-field="box2-title2">Get 2 + Free Shipping.</em>' +
                  '</h2>' +
                  '<p class="lana-offer-note" data-field="box2-note">Choose 3 fragrances and receive 2 more absolutely free — with free shipping.</p>' +
                '</div>' +
                '<div class="lana-offer-code-wrap">' +
                  '<div class="lana-offer-code-label">Your exclusive code</div>' +
                  '<div class="lana-offer-code">' +
                    '<strong data-field="box2-code">EXPLORE5</strong>' +
                    '<span class="lana-offer-copy-icon" aria-hidden="true"></span>' +
                  '</div>' +
                '</div>' +
                '<div class="lana-offer-benefits">' +
                  '<span class="lana-offer-benefit">BUY 3</span>' +
                  '<span class="lana-offer-benefit">GET 2 FREE</span>' +
                  '<span class="lana-offer-benefit">FREE SHIPPING</span>' +
                '</div>' +
                '<a href="https://www.lana-beauty.com/collections/all" class="lana-offer-button" data-field="box2-btn-link">' +
                  '<span data-field="box2-btn-text">EXPLORE THE COLLECTION</span>' +
                '</a>' +
              '</div>' +
            '</div>' +

          '</div>' +
        '</div>' +
      '</section>';

    pageContent.insertAdjacentElement("afterend", host);
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

      // The list endpoint's price is never a live sale price — correct
      // it once the real price/sale_price pair comes back, so structured
      // data never mismatches what the page actually charges (Google
      // Merchant flags exactly this kind of mismatch).
      fetch("https://lana-chatbot-backend.onrender.com/api/products/" + encodeURIComponent(product.slug) + "/price")
        .then(function (res) { return res.json(); })
        .then(function (priceData) {
          var currentTag = document.getElementById("lana-product-schema");
          if (!currentTag || currentTag.dataset.slug !== product.slug || !priceData.success) return;
          schema.offers.price = String(priceData.on_sale ? priceData.sale_price : priceData.price);
          currentTag.textContent = JSON.stringify(schema);
        })
        .catch(function () {});
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

  // Each check runs isolated — one throwing (bad DOM assumption, a slug
  // that doesn't match expectations, etc.) must never stop the others,
  // and when this file is concatenated with others into one bundle
  // (see /storefront/bundle.js), an uncaught error here would otherwise
  // abort everything appended after it in the same <script> tag too.
  function safeRun(fn) {
    try {
      fn();
    } catch (e) {
      console.error("Lana script.js error in " + fn.name + ":", e);
    }
  }

  function runAllChecks() {
    safeRun(renamePagesHeading);
    safeRun(showOrderNumberInStatusRow);
    safeRun(buildTrackingForm);
    safeRun(showDeliveryEstimate);
    safeRun(buildScentFinder);
    safeRun(buildOffersPage);
    safeRun(showScentNotes);
    safeRun(showShipmentTimeline);
    safeRun(injectProductSchema);
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
