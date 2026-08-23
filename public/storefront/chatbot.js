(function () {

  "use strict";


  /* =======================================================
     CONFIG
     ======================================================= */

  const API_URL =
    "https://lana-chatbot-backend.onrender.com/api/chat";

  const HISTORY_KEY =
    "lana_beauty_chat_history_v63";


  /* =======================================================
     INITIALIZE
     ======================================================= */

  function initLanaChat() {

    if (
      document.getElementById(
        "lana-chat-root"
      )
    ) {
      return;
    }


    /* =====================================================
       ROOT
       ===================================================== */

    const root =
      document.createElement("div");

    root.id =
      "lana-chat-root";


    /* =====================================================
       HTML
       ===================================================== */

    root.innerHTML = `

      <button
        class="lana-chat-button"
        id="lana-chat-open"
        type="button"
        aria-label="Open Lana's Beauty Chat"
      >

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >

          <path
            d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2 1.2-4A7.5 7.5 0 1 1 20 11.5Z"
          />

          <path d="M8 11h.01"/>
          <path d="M12 11h.01"/>
          <path d="M16 11h.01"/>

        </svg>


        <span
          class="lana-chat-notification"
          id="lana-chat-notification"
        >
          1
        </span>

      </button>


      <div
        class="lana-chat-window"
        id="lana-chat-window"
        role="dialog"
        aria-label="Lana's Beauty Chat"
      >


        <!-- HEADER -->

        <div class="lana-chat-header">

          <div class="lana-chat-brand">

            <div class="lana-chat-avatar">
              L
            </div>

            <div class="lana-chat-brand-text">

              <div class="lana-chat-brand-name">
                Lana's Beauty
              </div>

              <div class="lana-chat-brand-status">
                Beauty Assistant
              </div>

            </div>

          </div>


          <div class="lana-chat-actions">


            <!-- MINIMIZE -->

            <button
              class="lana-chat-action"
              id="lana-chat-minimize"
              type="button"
              aria-label="Minimize"
              title="Minimize"
            >

              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
              >

                <path d="M5 12h14"/>

              </svg>

            </button>


            <!-- CLEAR -->

            <button
              class="lana-chat-action"
              id="lana-chat-clear"
              type="button"
              aria-label="Clear conversation"
              title="Clear conversation"
            >

              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >

                <path d="M3 6h18"/>
                <path d="M8 6V4h8v2"/>
                <path d="M19 6l-1 15H6L5 6"/>
                <path d="M10 11v6"/>
                <path d="M14 11v6"/>

              </svg>

            </button>


            <!-- CLOSE -->

            <button
              class="lana-chat-action"
              id="lana-chat-close"
              type="button"
              aria-label="Close"
              title="Close"
            >

              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
              >

                <path d="M6 6l12 12"/>
                <path d="M18 6L6 18"/>

              </svg>

            </button>

          </div>

        </div>


        <!-- MESSAGES -->

        <div
          class="lana-chat-messages"
          id="lana-chat-messages"
        >

          <div class="lana-message assistant">

            <div class="lana-bubble">

              أهلاً بحضرتك في Lana's Beauty 🤍
              <br>

              قوللي محتاج تعرف ايه — منتج معين، حالة طلبك، الشحن، الاسترجاع، أو أي عروض حالية.

            </div>

          </div>

        </div>


        <!-- INPUT -->

        <div class="lana-chat-input-area">

          <form
            class="lana-chat-form"
            id="lana-chat-form"
          >

            <input
              id="lana-chat-input"
              class="lana-chat-input"
              type="text"
              autocomplete="off"
              placeholder="اكتب اللي محتاجه..."
              maxlength="500"
              inputmode="text"
            />


            <button
              id="lana-chat-send"
              class="lana-chat-send"
              type="submit"
              aria-label="Send"
            >

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >

                <path d="M22 2 11 13"/>
                <path d="m22 2-7 20-4-9-9-4Z"/>

              </svg>

            </button>

          </form>

        </div>

      </div>

    `;


    document.body.appendChild(root);


    /* =====================================================
       ELEMENTS
       ===================================================== */

    const openButton =
      root.querySelector(
        "#lana-chat-open"
      );

    const closeButton =
      root.querySelector(
        "#lana-chat-close"
      );

    const minimizeButton =
      root.querySelector(
        "#lana-chat-minimize"
      );

    const clearButton =
      root.querySelector(
        "#lana-chat-clear"
      );

    const windowElement =
      root.querySelector(
        "#lana-chat-window"
      );

    const form =
      root.querySelector(
        "#lana-chat-form"
      );

    const input =
      root.querySelector(
        "#lana-chat-input"
      );

    const messages =
      root.querySelector(
        "#lana-chat-messages"
      );

    const sendButton =
      root.querySelector(
        "#lana-chat-send"
      );

    const notification =
      root.querySelector(
        "#lana-chat-notification"
      );


    /* =====================================================
       SCROLL
       ===================================================== */

    function scrollToBottom() {

      requestAnimationFrame(
        function () {

          messages.scrollTop =
            messages.scrollHeight;

        }
      );

    }


    /* =====================================================
       HISTORY
       ===================================================== */

    function saveHistory() {

      try {

        const items = [];

        messages
          .querySelectorAll(
            ".lana-message"
          )
          .forEach(
            function (message) {

              if (
                message.id ===
                "lana-typing-message"
              ) {
                return;
              }

              const bubble =
                message.querySelector(
                  ".lana-bubble"
                );

              if (!bubble) {
                return;
              }

              items.push({

                type:
                  message.classList.contains(
                    "user"
                  )
                    ? "user"
                    : "assistant",

                text:
                  bubble.textContent || ""

              });

            }
          );


        localStorage.setItem(
          HISTORY_KEY,
          JSON.stringify(items)
        );

      } catch (error) {

        console.log(
          "Lana history unavailable"
        );

      }

    }


    function loadHistory() {

      try {

        const saved =
          localStorage.getItem(
            HISTORY_KEY
          );

        if (!saved) {
          return false;
        }

        const history =
          JSON.parse(saved);

        if (
          !Array.isArray(history) ||
          history.length === 0
        ) {
          return false;
        }


        messages.innerHTML = "";


        history.forEach(
          function (item) {

            if (
              !item ||
              !item.text
            ) {
              return;
            }

            addMessage(
              item.text,
              item.type === "user"
                ? "user"
                : "assistant",
              false
            );

          }
        );


        scrollToBottom();

        return true;

      } catch (error) {

        return false;

      }

    }


    /* =====================================================
       NOTIFICATION
       ===================================================== */

    function showNotification() {

      if (
        windowElement.classList.contains(
          "open"
        )
      ) {
        return;
      }

      notification.classList.add(
        "show"
      );

    }


    function hideNotification() {

      notification.classList.remove(
        "show"
      );

    }


    /* =====================================================
       OPEN
       ===================================================== */

    openButton.addEventListener(
      "click",
      function () {

        windowElement.classList.add(
          "open"
        );

        windowElement.classList.remove(
          "minimized"
        );

        hideNotification();


        setTimeout(
          function () {

            input.focus();

            scrollToBottom();

          },
          80
        );

      }
    );


    /* =====================================================
       CLOSE
       ===================================================== */

    closeButton.addEventListener(
      "click",
      function () {

        windowElement.classList.remove(
          "open"
        );

      }
    );


    /* =====================================================
       MINIMIZE
       ===================================================== */

    minimizeButton.addEventListener(
      "click",
      function () {

        windowElement.classList.toggle(
          "minimized"
        );

      }
    );


    /* =====================================================
       ESCAPE
       ===================================================== */

    document.addEventListener(
      "keydown",
      function (event) {

        if (
          event.key ===
          "Escape"
        ) {

          windowElement.classList.remove(
            "open"
          );

        }

      }
    );


    /* =====================================================
       ADD MESSAGE
       ===================================================== */

    function addMessage(
      text,
      type,
      save
    ) {

      const wrapper =
        document.createElement(
          "div"
        );

      wrapper.className =
        "lana-message " +
        type;


      const bubble =
        document.createElement(
          "div"
        );

      bubble.className =
        "lana-bubble";


      const messageText =
        String(text || "");


      if (
        detectLang(messageText) ===
        "en"
      ) {

        bubble.style.direction =
          "ltr";

        bubble.style.textAlign =
          "left";

      }


      bubble.textContent =
        messageText;


      wrapper.appendChild(
        bubble
      );


      messages.appendChild(
        wrapper
      );


      if (
        save !== false
      ) {

        saveHistory();

      }


      scrollToBottom();

    }


    /* =====================================================
       TYPING
       ===================================================== */

    function addTyping() {

      removeTyping();


      const wrapper =
        document.createElement(
          "div"
        );

      wrapper.className =
        "lana-message assistant";

      wrapper.id =
        "lana-typing-message";


      wrapper.innerHTML = `

        <div class="lana-typing">

          <span></span>
          <span></span>
          <span></span>

        </div>

      `;


      messages.appendChild(
        wrapper
      );


      scrollToBottom();

    }


    function removeTyping() {

      const typing =
        root.querySelector(
          "#lana-typing-message"
        );


      if (typing) {

        typing.remove();

      }

    }


    /* =====================================================
       PRICE
       ===================================================== */

    function formatPrice(price) {

      const number =
        Number(price);


      if (
        !Number.isFinite(number)
      ) {

        return "";

      }


      return (
        new Intl.NumberFormat(
          "en-EG"
        )
          .format(number)
        + " EGP"
      );

    }


    /* =====================================================
       ESCAPE HTML
       ===================================================== */

    function escapeHtml(value) {

      const div =
        document.createElement(
          "div"
        );


      div.textContent =
        String(value ?? "");


      return div.innerHTML;

    }


    /* =====================================================
       PRODUCTS
       ===================================================== */

    function addProducts(
      products
    ) {

      if (
        !Array.isArray(
          products
        ) ||
        products.length === 0
      ) {

        return;

      }


      const wrapper =
        document.createElement(
          "div"
        );

      wrapper.className =
        "lana-message assistant";


      const container =
        document.createElement(
          "div"
        );

      container.style.width =
        "100%";


      const cards =
        document.createElement(
          "div"
        );

      cards.className =
        "lana-products";


      products.forEach(
        function (product) {

          if (!product) {
            return;
          }


          const card =
            document.createElement(
              "div"
            );

          card.className =
            "lana-product-card";


          const name =
            escapeHtml(
              product.name ||
              "Lana's Beauty"
            );


          const description =
            escapeHtml(
              product.description ||
              ""
            );


          const image =
            escapeHtml(
              product.image ||
              ""
            );


          const finalPrice =
            formatPrice(
              product.finalPrice ??
              product.salePrice ??
              product.price
            );


          const originalPrice =
            formatPrice(
              product.price
            );


          const hasSale =
            Number(
              product.price
            ) >
            Number(
              product.finalPrice ??
              product.salePrice ??
              product.price
            );


          const discountPercent =
            hasSale
              ? Math.round(
                  (1 -
                    Number(
                      product.finalPrice ??
                      product.salePrice ??
                      product.price
                    ) /
                    Number(product.price)) *
                    100
                )
              : 0;


          const inStock =
            Boolean(
              product.inStock
            );


          card.innerHTML = `

            ${
              hasSale && discountPercent > 0
                ? `
                  <div class="lana-product-badge">
                    -${discountPercent}%
                  </div>
                `
                : ""
            }

            <div class="lana-product-main">

              ${
                image
                  ? `
                    <img
                      class="lana-product-image"
                      src="${image}"
                      alt="${name}"
                      loading="lazy"
                    />
                  `
                  : `
                    <div
                      class="lana-product-image"
                      aria-hidden="true"
                    ></div>
                  `
              }


              <div class="lana-product-info">

                <div
                  class="lana-product-name"
                >
                  ${name}
                </div>


                <div
                  class="lana-product-description"
                >
                  ${description}
                </div>


                <div
                  class="lana-product-price"
                >

                  ${
                    hasSale
                      ? `
                        <span
                          class="lana-product-old-price"
                        >
                          ${originalPrice}
                        </span>
                      `
                      : ""
                  }


                  <span
                    class="lana-product-current-price"
                  >
                    ${finalPrice}
                  </span>

                </div>


                <div
                  class="lana-product-stock ${
                    inStock
                      ? "available"
                      : "unavailable"
                  }"
                >

                  <span class="lana-stock-dot"></span>
                  ${
                    inStock
                      ? "Available"
                      : "Currently unavailable"
                  }

                </div>

              </div>

            </div>

          `;


          if (
            product.url
          ) {

            const button =
              document.createElement(
                "button"
              );


            button.type =
              "button";


            button.className =
              "lana-product-button";


            button.textContent =
              "View Product";


            button.addEventListener(
              "click",
              function () {

                window.location.href =
                  product.url;

              }
            );


            card.appendChild(
              button
            );

          }


          cards.appendChild(
            card
          );

        }
      );


      container.appendChild(
        cards
      );


      wrapper.appendChild(
        container
      );


      messages.appendChild(
        wrapper
      );


      scrollToBottom();

    }


    /* =====================================================
       OFFERS UI
       ===================================================== */

    function detectLang(text) {

      if (/[؀-ۿ]/.test(text)) {
        return "ar";
      }

      return "en";

    }


    function showOffers(lang) {

      const wrapper =
        document.createElement(
          "div"
        );

      wrapper.className =
        "lana-message assistant";


      const container =
        document.createElement(
          "div"
        );

      container.style.width =
        "100%";


      const introHtml =
        lang === "ar"
          ? `
            <strong>
              العروض الحالية ✨
            </strong>

            <br>

            اختار العرض المناسب:
          `
          : `
            <strong>
              Current Offers ✨
            </strong>

            <br>

            Pick the offer that works for you:
          `;


      container.innerHTML = `

        <div class="lana-bubble">

          ${introHtml}

        </div>


        <div class="lana-offers">

          <!-- OFFER 1 -->

          <div class="lana-offer-card">

            <div class="lana-chat-offer-title">

              BUY 3 GET 2
              + FREE SHIPPING

            </div>


            <div class="lana-chat-offer-code">

              USE CODE: EXPLORE5

            </div>

          </div>


          <!-- OFFER 2 -->

          <div class="lana-offer-card">

            <div class="lana-chat-offer-title">

              FREE SHIPPING
              ON ORDERS OVER EGP 999

            </div>

          </div>


          <!-- OFFER 3 -->

          <div class="lana-offer-card">

            <div class="lana-chat-offer-title">

              BUY 2 OR MORE
              & SAVE 10%

            </div>


            <div class="lana-chat-offer-code">

              USE CODE: SAVE10

            </div>

          </div>

        </div>

      `;


      wrapper.appendChild(
        container
      );


      messages.appendChild(
        wrapper
      );


      scrollToBottom();


      setTimeout(
        function () {

          scrollToBottom();

        },
        120
      );

    }


    /* =====================================================
       SEND
       ===================================================== */

    async function sendMessage(
      message
    ) {

      addMessage(
        message,
        "user"
      );


      input.value =
        "";

      input.disabled =
        true;

      sendButton.disabled =
        true;


      addTyping();


      try {

        const response =
          await fetch(
            API_URL,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  message:
                    message
                })
            }
          );


        if (
          !response.ok
        ) {

          throw new Error(
            "Request failed: " +
            response.status
          );

        }


        const data =
          await response.json();


        console.log(
          "Lana Chat Response:",
          data
        );


        removeTyping();


        /*
         * AI MESSAGE
         */

        if (
          data.message &&
          data.intent !== "offers"
        ) {

          addMessage(
            data.message,
            "assistant"
          );

        }


        /*
         * PRODUCTS
         */

        if (
          Array.isArray(
            data.products
          )
        ) {

          addProducts(
            data.products
          );

        }


        /*
         * OFFERS — triggered by the backend recognizing an offers
         * question in the message text, not a button anymore.
         */

        if (
          data.intent ===
          "offers"
        ) {

          showOffers(
            detectLang(message)
          );

        }


        /*
         * Notification
         */

        if (
          !windowElement.classList.contains(
            "open"
          )
        ) {

          showNotification();

        }

      } catch (error) {

        console.error(
          "Lana Chat Error:",
          error
        );


        removeTyping();


        addMessage(
          "حصلت مشكلة بسيطة وأنا بحاول أجيبلك المنتجات. جربي تاني بعد شوية 🤍",
          "assistant"
        );

      } finally {

        input.disabled =
          false;

        sendButton.disabled =
          false;

        input.focus();

      }

    }


    /* =====================================================
       FORM
       ===================================================== */

    form.addEventListener(
      "submit",
      function (event) {

        event.preventDefault();


        const message =
          input.value.trim();


        if (!message) {
          return;
        }


        sendMessage(
          message
        );

      }
    );


    /* =====================================================
       ENTER + SHIFT ENTER
       ===================================================== */

    input.addEventListener(
      "keydown",
      function (event) {

        if (
          event.key ===
          "Enter" &&
          !event.shiftKey
        ) {

          event.preventDefault();


          if (
            !sendButton.disabled
          ) {

            form.requestSubmit();

          }

        }

        /*
         * Shift + Enter
         * remains normal browser behavior.
         */

      }
    );


    /* =====================================================
       CLEAR CONVERSATION
       ===================================================== */

    clearButton.addEventListener(
      "click",
      function () {

        const confirmed =
          window.confirm(
            "هل تريدين مسح المحادثة؟"
          );


        if (!confirmed) {
          return;
        }


        try {

          localStorage.removeItem(
            HISTORY_KEY
          );

        } catch (error) {}


        messages.innerHTML = `

          <div class="lana-message assistant">

            <div class="lana-bubble">

              أهلاً بحضرتك في Lana's Beauty 🤍
              <br>

              قوللي محتاج تعرف ايه — منتج معين، حالة طلبك، الشحن، الاسترجاع، أو أي عروض حالية.

            </div>

          </div>

        `;


        scrollToBottom();

      }
    );


    /* =====================================================
       LOAD HISTORY
       ===================================================== */

    loadHistory();

  }


  /* =======================================================
     START
     ======================================================= */

  // Wrapped: this file is concatenated with others into one bundle (see
  // /storefront/bundle.js) — an uncaught throw here would otherwise abort
  // whatever's appended after it in the same <script> tag too.
  function safeInitLanaChat() {
    try {
      initLanaChat();
    } catch (e) {
      console.error("Lana chatbot.js init error:", e);
    }
  }

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      safeInitLanaChat
    );

  } else {

    safeInitLanaChat();

  }

})();
