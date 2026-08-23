(function () {
  "use strict";

  if (window.__lanaQuizInit) return;
  window.__lanaQuizInit = true;

  var CONTENT_API = "https://lana-chatbot-backend.onrender.com/api/homepage-content";
  var PRODUCTS_API = "https://lana-chatbot-backend.onrender.com/api/products?limit=200";
  var TOTAL_STEPS = 3;

  var COLLECTION_URLS = {
    her: "https://www.lana-beauty.com/collections/for-her",
    him: "https://www.lana-beauty.com/collections/for-him",
    unisex: "https://www.lana-beauty.com/collections/unisex",
  };

  var GENDER_LABELS = { her: "For Her", him: "For Him", unisex: "Unisex" };

  var VIBE_COPY = {
    romantic: "soft and romantic",
    bold: "bold and magnetic",
    fresh: "clean and fresh",
    cozy: "warm and cozy",
  };

  var OCCASION_COPY = {
    everyday: "a scent that carries you through every day",
    night: "a scent made to turn heads after dark",
    special: "a scent saved for the moments that matter",
  };

  var answers = { gender: null, vibe: null, occasion: null };
  var currentStep = 1;
  var fetchedData = null;

  function q(selector, root) {
    return (root || document).querySelector(selector);
  }
  function qa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function showStep(root, step) {
    qa(".lana-quiz-step", root).forEach(function (el) {
      el.classList.toggle("active", Number(el.getAttribute("data-step")) === step);
    });
    qa(".lana-quiz-dot", root).forEach(function (dot) {
      var n = Number(dot.getAttribute("data-dot"));
      dot.classList.toggle("active", n === step);
      dot.classList.toggle("done", n < step);
    });
    var back = q('[data-quiz="back"]', root);
    var nav = q('[data-quiz="nav"]', root);
    var result = q('[data-quiz="result"]', root);
    result.classList.remove("active");
    nav.style.display = "flex";
    if (back) back.classList.toggle("visible", step > 1);
  }

  function showResult(root) {
    qa(".lana-quiz-step", root).forEach(function (el) { el.classList.remove("active"); });
    q('[data-quiz="nav"]', root).style.display = "none";
    var result = q('[data-quiz="result"]', root);
    result.classList.add("active");
    renderResult(root);
  }

  function renderResult(root) {
    var headline = q('[data-quiz="headline"]', root);
    var note = q('[data-quiz="note"]', root);
    var loading = q('[data-quiz="loading"]', root);
    var card = q('[data-quiz="result-card"]', root);

    var vibeText = VIBE_COPY[answers.vibe] || "uniquely you";
    headline.innerHTML = "You're <em>" + vibeText + ".</em>";
    note.textContent = "Based on your answers, we picked " + (OCCASION_COPY[answers.occasion] || "a fragrance that fits you") + ".";

    if (!fetchedData) {
      loading.style.display = "block";
      card.style.display = "none";
      return;
    }

    loading.style.display = "none";

    var collections = fetchedData.content && fetchedData.content.collections;
    var conf = collections ? collections[answers.gender] : null;
    var product = conf ? findProduct(fetchedData.products, conf.productSlug) : null;

    if (!product) {
      card.style.display = "none";
      note.textContent += " Explore the full collection to find the one that speaks to you.";
      var fallback = document.createElement("a");
      fallback.href = COLLECTION_URLS[answers.gender] || "https://www.lana-beauty.com/collections/all";
      fallback.className = "lana-quiz-result-shop";
      fallback.style.display = "inline-flex";
      fallback.style.marginTop = "8px";
      fallback.textContent = "Shop the Collection";
      note.parentNode.insertBefore(fallback, note.nextSibling);
      return;
    }

    card.style.display = "flex";
    card.href = productUrl(product.slug);
    q('[data-quiz="result-image"]', root).src = product.thumb || "";
    q('[data-quiz="result-image"]', root).alt = product.name || "";
    q('[data-quiz="result-label"]', root).textContent = GENDER_LABELS[answers.gender] || "";
    q('[data-quiz="result-name"]', root).textContent = product.name || "";
  }

  function findProduct(products, slug) {
    if (!products || !slug) return null;
    return products.find(function (p) { return p.slug === slug; }) || null;
  }

  function productUrl(slug) {
    return "https://www.lana-beauty.com/products/" + slug;
  }

  function resetQuiz(root) {
    answers = { gender: null, vibe: null, occasion: null };
    currentStep = 1;
    qa(".lana-quiz-option", root).forEach(function (btn) { btn.classList.remove("selected"); });
    showStep(root, 1);
  }

  function wireQuiz(root) {
    qa('[data-question]', root).forEach(function (group) {
      var question = group.getAttribute("data-question");
      qa(".lana-quiz-option", group).forEach(function (btn) {
        btn.addEventListener("click", function () {
          qa(".lana-quiz-option", group).forEach(function (b) { b.classList.remove("selected"); });
          btn.classList.add("selected");
          answers[question] = btn.getAttribute("data-value");

          setTimeout(function () {
            if (currentStep < TOTAL_STEPS) {
              currentStep++;
              showStep(root, currentStep);
            } else {
              showResult(root);
            }
          }, 220);
        });
      });
    });

    var back = q('[data-quiz="back"]', root);
    if (back) {
      back.addEventListener("click", function () {
        if (currentStep > 1) {
          currentStep--;
          showStep(root, currentStep);
        }
      });
    }

    var retake = q('[data-quiz="retake"]', root);
    if (retake) {
      retake.addEventListener("click", function () { resetQuiz(root); });
    }
  }

  function init() {
    var root = q('[data-field="quiz-root"]');
    if (!root || root.__wired) return;
    root.__wired = true;

    wireQuiz(root);

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
        if (q('[data-quiz="result"]', root).classList.contains("active")) {
          renderResult(root);
        }
      })
      .catch(function (e) {
        console.error("Lana scent finder error:", e);
      });
  }

  function tryInit() {
    if (q('[data-field="quiz-root"]')) init();
  }

  function start() {
    tryInit();

    var observer = new MutationObserver(function () {
      tryInit();
      var root = q('[data-field="quiz-root"]');
      if (root && root.__wired) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      tryInit();
      var root = q('[data-field="quiz-root"]');
      if ((root && root.__wired) || attempts >= 20) {
        clearInterval(interval);
        observer.disconnect();
      }
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
