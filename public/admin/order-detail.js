const money = (n) => (typeof n === "number" ? n.toLocaleString() + " EGP" : "—");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

(function wireThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  btn.textContent = isDark ? "☀️" : "🌙";
  btn.addEventListener("click", () => {
    const nowDark = document.documentElement.getAttribute("data-theme") !== "dark";
    document.documentElement.setAttribute("data-theme", nowDark ? "dark" : "light");
    localStorage.setItem("lana-admin-theme", nowDark ? "dark" : "light");
    btn.textContent = nowDark ? "☀️" : "🌙";
  });
})();

function getOrderIdFromUrl() {
  const match = location.pathname.match(/^\/admin\/order\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const BOSTA_TIMELINE_LABELS = {
  new: "Order created",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

function buildUnifiedTimeline(order, events, bostaLive) {
  const entries = [];

  if (order.created_at) {
    entries.push({ time: order.created_at, label: "Order placed on Easy Orders", source: "easyorders" });
  }

  (events || []).forEach((e) => {
    entries.push({
      time: e.timestamp,
      label: (e.stateName || "State " + e.state) + (e.trackingNumber ? " — Tracking #" + e.trackingNumber : ""),
      source: "webhook",
    });
  });

  if (bostaLive && bostaLive.success && bostaLive.stateLog) {
    bostaLive.stateLog.forEach((entry) => {
      entries.push({
        time: entry.time,
        label: esc(entry.from || "—") + " → " + esc(entry.to || "—") + (entry.by ? " (" + esc(entry.by) + ")" : " (System)"),
        source: "bosta",
      });
    });
  }

  entries.sort((a, b) => new Date(a.time) - new Date(b.time));
  return entries;
}

function renderTimeline(entries) {
  if (entries.length === 0) return '<p class="empty">No timeline events yet.</p>';
  return '<ul class="od-timeline">' +
    entries.map((e) =>
      '<li><span class="od-tl-dot"></span><div class="od-tl-body">' +
        e.label + '<span class="od-source-tag ' + e.source + '">' + e.source + '</span>' +
        '<div class="od-tl-when">' + new Date(e.time).toLocaleString() + '</div>' +
      '</div></li>'
    ).join("") +
    '</ul>';
}

function render(order, events, bostaLive) {
  document.getElementById("od-title").textContent = "Order #" + order.short_id;

  const items = (order.cart_items || []).map((it) =>
    '<tr><td>' + esc(it.product ? it.product.name : "Item") + '</td><td>' + it.quantity + '</td>' +
    ("price" in it ? '<td>' + money(it.price) + '</td>' : "") + '</tr>'
  ).join("");

  const showMoney = "total_cost" in order;

  let html = '<div class="section-card"><div class="section-head"><h2>Order Info</h2>' + statusBadgeHtml(order) + '</div>' +
    '<div class="od-grid">' +
      '<div class="od-field"><span>Customer</span><div>' + esc(order.full_name) + '</div></div>' +
      '<div class="od-field"><span>Phone</span><div>' + esc(order.phone) + '</div></div>' +
      '<div class="od-field"><span>Governorate</span><div>' + esc(order.government) + '</div></div>' +
      '<div class="od-field"><span>Address</span><div>' + esc(order.address || "—") + '</div></div>' +
      '<div class="od-field"><span>Payment Method</span><div>' + esc(order.payment_method || "—") + '</div></div>' +
      (showMoney ? '<div class="od-field"><span>Total</span><div>' + money(order.total_cost) + '</div></div>' : "") +
      (showMoney && "shipping_cost" in order ? '<div class="od-field"><span>Shipping Cost</span><div>' + money(order.shipping_cost) + '</div></div>' : "") +
      '<div class="od-field"><span>Orders From This Phone</span><div>' + (order.orders_count || 1) + '</div></div>' +
    '</div></div>';

  html += '<div class="section-card"><h2>Items</h2><div class="table-scroll"><table class="od-items-table"><tr><th>Product</th><th>Qty</th>' + (showMoney ? "<th>Price</th>" : "") + '</tr>' + items + '</table></div></div>';

  const entries = buildUnifiedTimeline(order, events, bostaLive);
  html += '<div class="section-card"><h2>Unified Timeline <span class="hint">— Easy Orders + our webhook history' + (bostaLive && bostaLive.success ? " + Bosta's live audit log" : "") + '</span></h2>' + renderTimeline(entries) + '</div>';

  if (bostaLive && bostaLive.success) {
    html += '<div class="section-card"><h2>Live Bosta Details</h2><div class="od-grid">' +
      '<div class="od-field"><span>Live State</span><div>' + esc((bostaLive.state && bostaLive.state.value) || "—") + '</div></div>' +
      (bostaLive.cod != null ? '<div class="od-field"><span>COD Amount</span><div>' + money(bostaLive.cod) + '</div></div>' : "") +
      (bostaLive.shipmentFees != null ? '<div class="od-field"><span>Bosta Shipping Fee</span><div>' + money(bostaLive.shipmentFees) + '</div></div>' : "") +
      (bostaLive.numberOfAttempts != null ? '<div class="od-field"><span>Delivery Attempts</span><div>' + bostaLive.numberOfAttempts + '</div></div>' : "") +
      (bostaLive.nextCashoutDate ? '<div class="od-field"><span>Next COD Cashout</span><div>' + new Date(bostaLive.nextCashoutDate).toLocaleDateString() + '</div></div>' : "") +
      (bostaLive.packageType ? '<div class="od-field"><span>Bosta Package Type</span><div>' +
        (bostaLive.packageType.toLowerCase() !== "small" ? '<span class="badge attn">' + esc(bostaLive.packageType) + ' (expected Small)</span>' : esc(bostaLive.packageType)) +
        '</div></div>' : "") +
      (bostaLive.slaBreached ? '<div class="od-field"><span>SLA</span><div><span class="badge attn">Breached</span></div></div>' : "") +
      '</div></div>';

    if (bostaLive.attempts && bostaLive.attempts.length > 0) {
      html += '<div class="section-card"><h2>Delivery Attempts <span class="hint">— which courier had this, and when</span></h2>' +
        '<div class="table-scroll"><table><tr><th>Type</th><th>Date</th><th>Courier</th><th>Phone</th></tr>' +
        bostaLive.attempts.map((a) =>
          "<tr><td>" + esc(a.type || "—") + "</td><td>" + (a.date ? new Date(a.date).toLocaleString() : "—") + "</td><td>" + esc(a.courierName || "—") + "</td><td>" + esc(a.courierPhone || "—") + "</td></tr>"
        ).join("") +
        "</table></div></div>";
    }
  } else if (order.bosta && order.bosta.tracking_number) {
    html += '<div class="section-card"><p class="empty">Live Bosta details unavailable right now.</p></div>';
  }

  document.getElementById("od-page").innerHTML = html;
}

function statusBadgeHtml(order) {
  let cls = "neutral";
  if (order.status === "delivered") cls = "ok";
  else if (["canceled", "refunded"].includes(order.status)) cls = "attn";
  else if (order.bosta && order.bosta.needs_attention) cls = "attn";
  return '<span class="badge ' + cls + '">' + esc(order.status) + '</span>';
}

function init() {
  const orderId = getOrderIdFromUrl();
  if (!orderId) {
    document.getElementById("od-page").innerHTML = '<p class="empty">No order specified.</p>';
    return;
  }

  fetch("/api/admin/me")
    .then((res) => {
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return null;
      }
      return res.json();
    })
    .then((me) => {
      if (!me || !me.success) return;

      return fetch("/api/admin/orders/" + orderId)
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) {
            document.getElementById("od-page").innerHTML = '<p class="empty">' + esc(data.error || "Order not found.") + '</p>';
            return;
          }

          render(data.order, data.events, null);

          if (data.order.bosta && data.order.bosta.tracking_number) {
            fetch("/api/admin/orders/" + orderId + "/bosta-live")
              .then((res) => res.json())
              .then((bostaLive) => render(data.order, data.events, bostaLive))
              .catch(() => {});
          }
        });
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("od-page").innerHTML = '<div class="error">Failed to load order.</div>';
    });
}

init();
