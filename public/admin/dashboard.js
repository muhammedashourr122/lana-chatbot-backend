const money = (n) => (typeof n === "number" ? n.toLocaleString() + " EGP" : "—");
const pct = (n) => (typeof n === "number" ? Math.round(n * 100) + "%" : "—");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

let currentUser = null;
let VALID_STATUSES = [];

// ---------------- Dark mode ----------------

function wireThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  btn.textContent = isDark ? "☀️" : "🌙";

  btn.addEventListener("click", () => {
    const nowDark = document.documentElement.getAttribute("data-theme") !== "dark";
    document.documentElement.setAttribute("data-theme", nowDark ? "dark" : "light");
    localStorage.setItem("lana-admin-theme", nowDark ? "dark" : "light");
    btn.textContent = nowDark ? "☀️" : "🌙";
  });
}
wireThemeToggle();

const REASON_LABELS = {
  delivery_exception: "Delivery Exception",
  silent_dispatch: "No Bosta Signal",
  stale_tracking: "Stale Tracking",
  stuck_payment: "Stuck Payment",
};

function callLink(phone) {
  if (!phone) return "—";
  return (
    '<a class="action-link" href="tel:' + phone + '">Call</a>' +
    '<a class="action-link" href="https://wa.me/' + phone.replace(/\D/g, "") + '" target="_blank" rel="noreferrer">WhatsApp</a>'
  );
}
function printLink(orderId) {
  return '<a class="action-link" href="/admin/packing-slip/' + orderId + '" target="_blank" rel="noreferrer">Print slip</a>';
}
function detailLink(orderId) {
  return '<a class="action-link" href="/admin/order/' + orderId + '" target="_blank" rel="noreferrer">View Details</a>';
}
function awbLink(orderId, hasBosta) {
  if (!hasBosta) return "";
  return '<a class="action-link" href="/admin/awb/' + orderId + '" target="_blank" rel="noreferrer">Print AWB</a>';
}
function customerLink(phone) {
  if (!phone) return "";
  return '<a class="action-link customer-link" href="#" data-phone="' + phone + '">Customer</a>';
}

// ---------------- Customer panel + search ----------------

function openCustomerPanel(phone) {
  const panel = document.getElementById("customer-panel");
  panel.style.display = "block";
  panel.innerHTML = '<div class="section-card"><p class="empty">Loading…</p></div>';
  panel.scrollIntoView({ behavior: "smooth", block: "center" });

  fetch("/api/admin/customer?phone=" + encodeURIComponent(phone))
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        panel.innerHTML = '<div class="section-card"><p class="empty">Could not load customer.</p></div>';
        return;
      }
      const RISK_STATUSES = ["returning_from_delivery", "canceled", "refunded", "request_refund", "refund_in_progress"];
      const riskCount = data.orders.filter((o) => RISK_STATUSES.includes(o.status)).length;
      const riskRate = data.orders.length > 0 ? riskCount / data.orders.length : 0;
      const riskBadge = riskCount > 0
        ? '<span class="badge ' + (riskRate >= 0.5 ? "attn" : "warn") + '" style="margin-left:8px;">' + riskCount + " of " + data.orders.length + " returned/canceled</span>"
        : "";

      let html = '<div class="section-card">' +
        '<div class="section-head"><h2>' + esc(data.full_name || "Customer") + " — " + esc(phone) + riskBadge + "</h2>" +
        '<a class="action-link" href="#" id="close-customer-panel">Close</a></div>' +
        "<p>" + data.order_count + " orders · Lifetime value: " + money(data.lifetime_value) + "</p>" +
        '<div class="table-scroll"><table><tr><th>Order #</th><th>Status</th><th>Total</th><th>Date</th></tr>';
      data.orders.forEach((o) => {
        const rowCls = RISK_STATUSES.includes(o.status) ? ' class="attention"' : "";
        html += "<tr" + rowCls + "><td>" + esc(o.short_id) + "</td><td>" + esc(o.status) + "</td><td>" + money(o.total_cost) + "</td><td>" + new Date(o.created_at).toLocaleDateString() + "</td></tr>";
      });
      html += "</table></div></div>";
      panel.innerHTML = html;
      document.getElementById("close-customer-panel").addEventListener("click", (e) => {
        e.preventDefault();
        panel.style.display = "none";
      });
    })
    .catch(() => {
      panel.innerHTML = '<div class="section-card"><p class="empty">Failed to load customer.</p></div>';
    });
}

function wireSearch() {
  const input = document.getElementById("search-input");
  const btn = document.getElementById("search-btn");
  const resultsEl = document.getElementById("search-results");

  function runSearch() {
    const q = input.value.trim();
    if (!q) return;
    resultsEl.innerHTML = '<div class="section-card"><p class="empty">Searching…</p></div>';

    fetch("/api/admin/search?q=" + encodeURIComponent(q))
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || data.results.length === 0) {
          resultsEl.innerHTML = '<div class="section-card"><p class="empty">No matching orders.</p></div>';
          return;
        }
        let html = '<div class="section-card" style="margin-top:-8px;"><div class="table-scroll"><table><tr><th>Order #</th><th>Name</th><th>Phone</th><th>Status</th><th>Total</th><th>Actions</th></tr>';
        data.results.forEach((o) => {
          html += "<tr><td>" + esc(o.short_id) + "</td><td>" + esc(o.full_name) + "</td><td>" + esc(o.phone) + "</td><td>" + esc(o.status) + "</td><td>" + money(o.total_cost) + "</td><td>" + callLink(o.phone) + customerLink(o.phone) + printLink(o.order_id) + "</td></tr>";
        });
        html += "</table></div></div>";
        resultsEl.innerHTML = html;
        resultsEl.querySelectorAll(".customer-link").forEach((a) => {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            openCustomerPanel(a.getAttribute("data-phone"));
          });
        });
      })
      .catch(() => {
        resultsEl.innerHTML = '<div class="section-card"><p class="empty">Search failed.</p></div>';
      });
  }

  btn.addEventListener("click", runSearch);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
}

document.addEventListener("click", (e) => {
  const a = e.target.closest(".customer-link");
  if (a) {
    e.preventDefault();
    openCustomerPanel(a.getAttribute("data-phone"));
  }
});

// ---------------- Overview (business health) ----------------

function revenueChartSvg(trend) {
  if (!trend || trend.length < 2) return '<p class="empty">Not enough data yet.</p>';
  const w = 720, h = 140, pad = 8;
  const max = Math.max(...trend.map((d) => d.total), 1);
  const stepX = (w - pad * 2) / (trend.length - 1);
  const points = trend.map((d, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (d.total / max) * (h - pad * 2);
    return x + "," + y;
  });
  const areaPoints = "0," + h + " " + points.join(" ") + " " + w + "," + h;
  return (
    '<svg viewBox="0 0 ' + w + " " + h + '" width="100%" height="140" preserveAspectRatio="none">' +
    '<polygon points="' + areaPoints + '" fill="#F1E4E8" />' +
    '<polyline points="' + points.join(" ") + '" fill="none" stroke="#6C4452" stroke-width="2" />' +
    "</svg>"
  );
}

// "Since last week" in one glance — purely from data the Overview call
// already fetches, no extra requests.
function renderWeeklyDigest(data) {
  const trend = data.revenue_trend;
  if (!trend) return "";

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const sumRange = (fromDaysAgo, toDaysAgo) =>
    trend
      .filter((d) => {
        const t = new Date(d.day).getTime();
        return t >= now - fromDaysAgo * day && t < now - toDaysAgo * day;
      })
      .reduce((sum, d) => sum + d.total, 0);

  const thisWeek = sumRange(7, 0);
  const lastWeek = sumRange(14, 7);
  const delta = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  const lowStockCount = (data.low_stock || []).length;
  const returningCount = (data.status_counts || {}).returning_from_delivery || 0;

  const field = (label, valueHtml) =>
    '<div><span style="display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">' + label + '</span><div style="font-size:14px;color:var(--ink);">' + valueHtml + "</div></div>";

  const parts = [];
  if ("revenue" in data.stats) {
    parts.push(field("Revenue, Last 7 Days", money(thisWeek) +
      (delta != null ? ' <span style="color:' + (delta >= 0 ? "#2e7d32" : "#c0392b") + ';font-size:12px;">(' + (delta >= 0 ? "+" : "") + delta + "% vs prior week)</span>" : "")));
  }
  parts.push(field("Low Stock Items", lowStockCount));
  parts.push(field("Returning to You", returningCount));

  const summaryLines = ["Lana Beauty — This Week (" + new Date().toLocaleDateString() + ")"];
  if ("revenue" in data.stats) {
    summaryLines.push("Revenue, last 7 days: " + money(thisWeek) + (delta != null ? " (" + (delta >= 0 ? "+" : "") + delta + "% vs prior week)" : ""));
  }
  summaryLines.push("Low stock items: " + lowStockCount);
  summaryLines.push("Orders returning to you: " + returningCount);
  window.__lanaDigestSummaryText = summaryLines.join("\n");

  return '<div class="section-card"><div class="section-head"><h2>This Week <span class="hint">— a quick pulse, not a replacement for the full tabs</span></h2>' +
    '<button id="copy-digest-btn" style="padding:6px 14px;">Copy Summary</button></div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;">' + parts.join("") + "</div></div>";
}

function renderOverview(data) {
  const root = document.getElementById("overview-root");
  const s = data.stats;

  // Financial fields are omitted entirely from the API response for a
  // moderator session — feature-detect their presence instead of
  // checking role here, so the API redaction stays the single source
  // of truth and nothing financial ever reaches the DOM for them.
  const cards = [];
  if ("revenue" in s) cards.push('<div class="stat-card"><div class="num">' + money(s.revenue) + '</div><div class="label">Revenue</div></div>');
  cards.push('<div class="stat-card"><div class="num">' + s.total_orders + '</div><div class="label">Orders</div></div>');
  if ("avg_order_value" in s) cards.push('<div class="stat-card"><div class="num">' + money(s.avg_order_value) + '</div><div class="label">Avg Order Value</div></div>');
  cards.push('<div class="stat-card"><div class="num">' + pct(s.delivery_success_rate) + '</div><div class="label">Delivery Success Rate</div></div>');
  if ("cod_collected" in s) cards.push('<div class="stat-card"><div class="num">' + money(s.cod_collected) + '</div><div class="label">COD Collected</div></div>');
  if ("cod_pending" in s) cards.push('<div class="stat-card"><div class="num">' + money(s.cod_pending) + '</div><div class="label">COD Pending</div></div>');
  cards.push('<div class="stat-card"><div class="num">' + s.repeat_customers + '</div><div class="label">Repeat Customers</div></div>');

  const statsHtml = '<div class="stats-row">' + cards.join("") + "</div>";

  const statusPills = Object.entries(data.status_counts || {})
    .map(([status, count]) => '<span class="status-pill">' + esc(status) + ": " + count + "</span>")
    .join("");

  const returningCount = (data.status_counts || {}).returning_from_delivery || 0;
  const returningHtml = returningCount > 0
    ? '<div class="section-card" style="border:1px solid var(--danger-text);cursor:pointer;" id="returning-alert-card">' +
      '<h2 style="color:var(--danger-text);margin:0;">⚠ ' + returningCount + ' order' + (returningCount === 1 ? "" : "s") + ' returning to you</h2>' +
      '<p class="empty" style="text-align:left;padding:6px 0 0;">Bosta is sending these back — expect the stock again soon. Click to view them in Orders.</p>' +
      "</div>"
    : "";

  const chartHtml = data.revenue_trend
    ? '<div class="section-card"><h2>Revenue — Last 30 Days</h2>' +
      '<div class="chart-wrap">' + revenueChartSvg(data.revenue_trend) + "</div></div>"
    : "";

  root.innerHTML = renderWeeklyDigest(data) +
    statsHtml +
    returningHtml +
    '<div class="section-card" style="padding:14px 20px;">' + statusPills + "</div>" +
    chartHtml;

  const returningCard = document.getElementById("returning-alert-card");
  if (returningCard) {
    returningCard.addEventListener("click", () => {
      document.querySelector('.tab-btn[data-tab="orders"]').click();
      ordersState.status = "returning_from_delivery";
      ordersState.page = 1;
      loadOrders();
    });
  }

  const copyDigestBtn = document.getElementById("copy-digest-btn");
  if (copyDigestBtn) {
    copyDigestBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(window.__lanaDigestSummaryText || "").then(() => {
        copyDigestBtn.textContent = "Copied!";
        setTimeout(() => { copyDigestBtn.textContent = "Copy Summary"; }, 1500);
      }).catch(() => {
        copyDigestBtn.textContent = "Failed to copy";
      });
    });
  }
}

function renderNeedsAttention(items) {
  const root = document.getElementById("attention-root");
  const badge = document.getElementById("attention-count-badge");
  badge.textContent = items && items.length > 0 ? String(items.length) : "";

  if (!items || items.length === 0) {
    root.innerHTML = '<div class="section-card"><h2>Needs Attention</h2><p class="empty">Nothing needs attention right now.</p></div>';
    return;
  }
  const showMoney = "total_cost" in items[0];
  let html = '<div class="section-card"><h2>Needs Attention (' + items.length + ")</h2>" +
    '<div class="table-scroll"><table><tr><th>Order #</th><th>Reasons</th><th>Customer</th><th>EasyOrders Status</th><th>Bosta State</th>' + (showMoney ? "<th>Total</th>" : "") + "<th>Actions</th></tr>";
  items.forEach((it) => {
    const reasons = it.reasons.map((r) => '<span class="reason-tag ' + r + '">' + REASON_LABELS[r] + "</span>").join("");
    html += '<tr class="attention">' +
      "<td>" + esc(it.short_id) + "</td>" +
      "<td>" + reasons + "</td>" +
      "<td>" + esc(it.full_name) + "<br>" + esc(it.phone) + "</td>" +
      "<td>" + esc(it.easyorders_status) + "</td>" +
      "<td>" + esc(it.bosta_state_name || "—") + "</td>" +
      (showMoney ? "<td>" + money(it.total_cost) + "</td>" : "") +
      "<td>" + callLink(it.phone) + customerLink(it.phone) + printLink(it.order_id) + awbLink(it.order_id, it.bosta_tracking_number) + detailLink(it.order_id) + "</td>" +
      "</tr>";
  });
  html += "</table></div></div>";
  root.innerHTML = html;
}

function renderGovernorates(governorates) {
  const root = document.getElementById("governorates-root");
  if (!governorates || governorates.length === 0) {
    root.innerHTML = "";
    return;
  }
  const showMoney = "revenue" in governorates[0];
  let sorted = governorates.slice().sort((a, b) => (showMoney ? b.revenue - a.revenue : b.order_count - a.order_count));
  let worstFirst = false;

  function draw() {
    let html = '<div class="section-card"><div class="section-head"><h2>Delivery Performance by Governorate</h2>' +
      '<label style="font-size:12px;color:var(--muted);cursor:pointer;"><input type="checkbox" id="gov-worst-toggle" ' + (worstFirst ? "checked" : "") + '> Worst success rate first</label></div>' +
      '<div class="table-scroll"><table><tr><th>Governorate</th><th>Orders</th>' + (showMoney ? "<th>Revenue</th>" : "") + "<th>Success Rate</th><th>Avg Time to Delivered</th>" + (showMoney ? "<th>Avg Shipping Charged</th>" : "") + "</tr>";
    const rows = worstFirst
      ? sorted.slice().sort((a, b) => (a.success_rate ?? 1) - (b.success_rate ?? 1))
      : sorted;
    rows.forEach((g) => {
      html += "<tr><td>" + esc(g.name) + "</td><td>" + g.order_count + "</td>" +
        (showMoney ? "<td>" + money(g.revenue) + "</td>" : "") +
        "<td>" + pct(g.success_rate) + "</td><td>" +
        (g.avg_delivery_hours != null ? Math.round(g.avg_delivery_hours) + "h (n=" + g.avg_delivery_sample_size + ")" : "—") +
        "</td>" + (showMoney ? "<td>" + (g.avg_shipping_cost != null ? money(g.avg_shipping_cost) : "—") + "</td>" : "") + "</tr>";
    });
    html += "</table></div>" +
      '<p class="chart-caption">"Avg Time to Delivered" measures order creation to Bosta\'s delivered signal, not guaranteed physical delivery time.' +
      (showMoney ? ' "Avg Shipping Charged" is what customers paid for shipping on Easy Orders, not Bosta\'s actual cost to us (that data isn\'t available) — it shows where shipping fees are heaviest, not profit margin.' : "") +
      "</p></div>";
    root.innerHTML = html;
    document.getElementById("gov-worst-toggle").addEventListener("change", (e) => {
      worstFirst = e.target.checked;
      draw();
    });
  }
  draw();
}

function renderTopProductsAndLowStock(topProducts, lowStock) {
  const root = document.getElementById("top-products-root");
  let topHtml = '<div class="section-card"><h2>Top Products</h2>';
  if (!topProducts || topProducts.length === 0) {
    topHtml += '<p class="empty">No product data yet.</p>';
  } else {
    topHtml += '<div class="table-scroll"><table><tr><th>Product</th><th>Qty Sold</th></tr>';
    topProducts.forEach((p) => { topHtml += "<tr><td>" + esc(p.name) + "</td><td>" + p.qty + "</td></tr>"; });
    topHtml += "</table></div>";
  }
  topHtml += "</div>";

  let lowStockHtml = "";
  if (lowStock && lowStock.length > 0) {
    lowStockHtml = '<div class="section-card"><h2>Low Stock (' + lowStock.length + ') <span class="hint">— sorted by unfulfilled order demand first</span></h2>' +
      '<div class="table-scroll"><table><tr><th>Product</th><th>Quantity Left</th><th>Pending Order Demand</th></tr>';
    lowStock.forEach((p) => {
      lowStockHtml += '<tr class="attention"><td>' + esc(p.name) + "</td><td>" + p.quantity + "</td><td>" +
        (p.pending_demand > 0 ? '<span class="badge attn">' + p.pending_demand + " needed</span>" : "—") +
        "</td></tr>";
    });
    lowStockHtml += "</table></div></div>";
  }

  root.innerHTML = '<div class="two-col">' + topHtml + (lowStockHtml || '<div class="section-card"><h2>Low Stock</h2><p class="empty">No low-stock items right now.</p></div>') + "</div>";
}

// ---------------- Orders table (paginated, unified EO + Bosta) ----------------

const ordersState = { page: 1, pageSize: 25, status: "", q: "", expandedOrderId: null, selectedOrderIds: new Set(), statuses: [] };

const SAVED_VIEWS_KEY = "lana-saved-order-views";
function getSavedOrderViews() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function setSavedOrderViews(views) {
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
}

function statusBadge(status, bosta) {
  let cls = "neutral";
  if (status === "delivered") cls = "ok";
  else if (["canceled", "refunded"].includes(status)) cls = "attn";
  else if (bosta && bosta.needs_attention) cls = "attn";
  return '<span class="badge ' + cls + '">' + esc(status) + "</span>";
}

function loadOrders() {
  const params = new URLSearchParams({ page: ordersState.page, page_size: ordersState.pageSize });
  if (ordersState.status) params.set("status", ordersState.status);
  if (ordersState.q) params.set("q", ordersState.q);

  const searchInput = document.getElementById("orders-search-input");
  const hadFocus = searchInput && document.activeElement === searchInput;
  const cursorPos = hadFocus ? searchInput.selectionStart : null;

  return fetch("/api/admin/orders?" + params.toString())
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) return;
      renderOrders(data);
      if (hadFocus) {
        const newInput = document.getElementById("orders-search-input");
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(cursorPos, cursorPos);
        }
      }
    });
}

function exportCsv(orders) {
  const header = ["Order #", "Status", "Bosta State", "Name", "Phone", "Governorate", "Total", "Created"];
  const rows = orders.map((o) => [
    o.short_id, o.status, o.bosta ? o.bosta.state_name : "", o.full_name, o.phone, o.government, o.total_cost, o.created_at,
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "orders.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------- Bosta summary (manual refresh) ----------------
// Scans a bounded set of your own recent orders (never Bosta's raw
// account-wide endpoints, which mix in other brands under the same
// Bosta account) via the existing per-order live-lookup route, and
// rolls up SLA breaches + upcoming COD cashouts. Manual trigger only —
// this is N Bosta API calls, not something to run on every page load.

// ---------------- Pickups (Lana-only, filtered server-side) ----------------
// Loaded lazily on first visit to the tab, not on every dashboard load —
// this hits Bosta's API for up to a few pages of account-wide pickups.

function wirePickupsTabLazyLoad() {
  const btn = document.querySelector('.tab-btn[data-tab="pickups"]');
  let loaded = false;
  btn.addEventListener("click", () => {
    if (loaded) return;
    loaded = true;
    renderPickups();
  });
}

function renderPickups() {
  const root = document.getElementById("pickups-root");
  root.innerHTML = '<div class="section-card"><p class="empty">Loading pickups…</p></div>';

  fetch("/api/admin/pickups")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load pickups.</p></div>'; return; }

      let html = "";
      if (data.pickups.length === 0) {
        html = '<div class="section-card"><h2>Pickups</h2><p class="empty">No scheduled pickups found among your recent orders.</p></div>';
      } else {
        html = '<div class="section-card"><h2>Pickups <span class="hint">— only deliveries matching your own orders (other brands on the same Bosta account are filtered out)</span></h2>' +
          '<div class="table-scroll"><table><tr><th>Date</th><th>Time Slot</th><th>State</th><th>Your Parcels</th></tr>';

        data.pickups.forEach((p) => {
          html += "<tr><td>" + esc(p.scheduledDate || "—") + "</td><td>" + esc(p.scheduledTimeSlot || "—") + "</td><td>" + esc(String(p.state ?? "—")) + "</td><td>" + p.deliveries.length + "</td></tr>";
          html += '<tr class="detail-row"><td colspan="4"><div class="table-scroll"><table><tr><th>Tracking #</th><th>Order Ref</th><th>Customer</th></tr>' +
            p.deliveries.map((d) => "<tr><td>" + esc(d.trackingNumber) + "</td><td>" + esc(d.businessReference || "—") + "</td><td>" + esc(d.receiverName || "—") + "</td></tr>").join("") +
            "</table></div></td></tr>";
        });

        html += "</table></div></div>";
      }

      if (currentUser.role === "owner") {
        html += '<div class="section-card" id="circle-v-package-card">' +
          '<div class="section-head"><h2>Circle V — Package Size Check <span class="hint">— tracking # and package type only, no customer info</span></h2>' +
          '<button id="circle-v-check-btn" class="btn">Check Package Sizes</button></div>' +
          '<div id="circle-v-check-body"><p class="empty">Click to scan Circle V\'s deliveries in the same pickups for size mismatches.</p></div>' +
          "</div>";
      }

      root.innerHTML = html;

      const circleVBtn = document.getElementById("circle-v-check-btn");
      if (circleVBtn) circleVBtn.addEventListener("click", runCircleVPackageCheck);
    })
    .catch(() => { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load pickups.</p></div>'; });
}

function runCircleVPackageCheck() {
  const btn = document.getElementById("circle-v-check-btn");
  const body = document.getElementById("circle-v-check-body");
  btn.disabled = true;
  body.innerHTML = '<p class="empty">Scanning…</p>';

  fetch("/api/admin/pickups/other-brand-package-check")
    .then((res) => res.json())
    .then((data) => {
      btn.disabled = false;
      if (!data.success) { body.innerHTML = '<p class="empty">Failed to check.</p>'; return; }

      if (data.flagged.length === 0) {
        body.innerHTML = '<p class="empty">No size mismatches found among Circle V\'s recent deliveries.</p>';
        return;
      }

      body.innerHTML = '<div class="table-scroll"><table><tr><th>Tracking #</th><th>Package Type</th><th>Weight</th></tr>' +
        data.flagged.map((f) =>
          '<tr class="attention"><td>' + esc(f.trackingNumber) + '</td><td><span class="badge attn">' + esc(f.packageType) + '</span></td><td>' +
          (f.weight != null ? f.weight + "g" : "—") + "</td></tr>"
        ).join("") +
        "</table></div>";
    })
    .catch(() => {
      btn.disabled = false;
      body.innerHTML = '<p class="empty">Failed to check.</p>';
    });
}

const BOSTA_SUMMARY_SCAN_LIMIT = 25;

function renderBostaSummary() {
  const root = document.getElementById("bosta-summary-root");
  root.innerHTML = '<div class="section-card">' +
    '<div class="section-head"><h2>Bosta Summary <span class="hint">— SLA compliance, package-size mismatches &amp; upcoming COD cashouts, scanned from your recent orders</span></h2>' +
    '<button id="bosta-summary-refresh-btn" class="btn">Refresh Bosta Summary</button></div>' +
    '<div id="bosta-summary-body"><p class="empty">Click refresh to scan your last ' + BOSTA_SUMMARY_SCAN_LIMIT + ' orders with Bosta tracking.</p></div>' +
    "</div>";

  document.getElementById("bosta-summary-refresh-btn").addEventListener("click", runBostaSummaryScan);
}

function runBostaSummaryScan() {
  const btn = document.getElementById("bosta-summary-refresh-btn");
  const body = document.getElementById("bosta-summary-body");
  btn.disabled = true;
  body.innerHTML = '<p class="empty">Loading recent orders…</p>';

  fetch("/api/admin/orders?page=1&page_size=100")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) throw new Error("orders fetch failed");
      const withTracking = data.orders.filter((o) => o.bosta && o.bosta.tracking_number).slice(0, BOSTA_SUMMARY_SCAN_LIMIT);

      if (withTracking.length === 0) {
        btn.disabled = false;
        body.innerHTML = '<p class="empty">No recent orders have Bosta tracking yet.</p>';
        return;
      }

      body.innerHTML = '<p class="empty">Scanning ' + withTracking.length + ' orders via Bosta…</p>';

      return Promise.all(
        withTracking.map((o) =>
          fetch("/api/admin/orders/" + o.order_id + "/bosta-live")
            .then((res) => res.json())
            .then((result) => ({ order: o, result }))
            .catch(() => ({ order: o, result: { success: false } }))
        )
      ).then((rows) => {
        btn.disabled = false;
        renderBostaSummaryResults(body, rows);
      });
    })
    .catch(() => {
      btn.disabled = false;
      body.innerHTML = '<p class="empty">Failed to load. Try again.</p>';
    });
}

// You ship everything as a small flyer — if Bosta's own warehouse scan
// classified it as anything else, that's worth catching (usually means
// an extra fee was applied, or the parcel was mishandled/mis-scanned).
function isUnexpectedPackageType(packageType) {
  return packageType && packageType.toLowerCase() !== "small";
}

// Flags orders where what the customer was charged for shipping on Easy
// Orders falls meaningfully short of what Bosta actually billed for it
// — i.e. shipping that's quietly eating into margin. A small gap is
// normal (rounding, promo free-shipping codes); only flag a real gap.
const SHIPPING_UNDERCHARGE_THRESHOLD_EGP = 10;

function renderBostaSummaryResults(body, rows) {
  const ok = rows.filter((r) => r.result.success);
  const breached = ok.filter((r) => r.result.slaBreached);
  const wrongPackage = ok.filter((r) => isUnexpectedPackageType(r.result.packageType));
  const underchargedShipping = ok.filter((r) =>
    typeof r.result.shipmentFees === "number" &&
    typeof r.order.shipping_cost === "number" &&
    r.result.shipmentFees - r.order.shipping_cost >= SHIPPING_UNDERCHARGE_THRESHOLD_EGP
  );
  const upcomingCashouts = ok
    .filter((r) => r.result.nextCashoutDate)
    .map((r) => ({ order: r.order, date: r.result.nextCashoutDate }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let html = '<div class="stats-row" style="margin-bottom:16px;">' +
    '<div class="stat-card"><div class="num">' + ok.length + '</div><div class="label">Orders Scanned</div></div>' +
    '<div class="stat-card"><div class="num">' + breached.length + '</div><div class="label">SLA Breached</div></div>' +
    '<div class="stat-card"><div class="num">' + wrongPackage.length + '</div><div class="label">Scanned as Non-Small</div></div>' +
    '<div class="stat-card"><div class="num">' + underchargedShipping.length + '</div><div class="label">Shipping Undercharged</div></div>' +
    '<div class="stat-card"><div class="num">' + upcomingCashouts.length + '</div><div class="label">Upcoming Cashouts</div></div>' +
    "</div>";

  if (underchargedShipping.length > 0) {
    html += '<h3 style="font-size:12px;color:var(--muted);margin:0 0 8px;">Shipping Undercharged (Bosta billed more than the customer paid)</h3>' +
      '<div class="table-scroll" style="margin-bottom:16px;"><table><tr><th>Order #</th><th>Customer</th><th>Customer Paid</th><th>Bosta Billed</th><th>Gap</th></tr>' +
      underchargedShipping.map((r) =>
        "<tr class=\"attention\"><td>" + esc(r.order.short_id) + "</td><td>" + esc(r.order.full_name) + "</td><td>" + money(r.order.shipping_cost) + "</td><td>" + money(r.result.shipmentFees) + "</td><td><span class=\"badge attn\">" + money(r.result.shipmentFees - r.order.shipping_cost) + "</span></td></tr>"
      ).join("") +
      "</table></div>";
  }

  if (wrongPackage.length > 0) {
    html += '<h3 style="font-size:12px;color:var(--muted);margin:0 0 8px;">Scanned as Large/Bulky (you ship small flyers)</h3>' +
      '<div class="table-scroll" style="margin-bottom:16px;"><table><tr><th>Order #</th><th>Customer</th><th>Bosta Package Type</th><th>Weight</th></tr>' +
      wrongPackage.map((r) =>
        "<tr class=\"attention\"><td>" + esc(r.order.short_id) + "</td><td>" + esc(r.order.full_name) + "</td><td><span class=\"badge attn\">" + esc(r.result.packageType) + "</span></td><td>" +
        (r.result.packageWeight != null ? r.result.packageWeight + "g" : "—") + "</td></tr>"
      ).join("") +
      "</table></div>";
  }

  if (breached.length > 0) {
    html += '<h3 style="font-size:12px;color:var(--muted);margin:0 0 8px;">SLA Breached</h3>' +
      '<div class="table-scroll" style="margin-bottom:16px;"><table><tr><th>Order #</th><th>Customer</th><th>Live State</th></tr>' +
      breached.map((r) => "<tr><td>" + esc(r.order.short_id) + "</td><td>" + esc(r.order.full_name) + "</td><td>" + esc((r.result.state && r.result.state.value) || "—") + "</td></tr>").join("") +
      "</table></div>";
  }

  if (upcomingCashouts.length > 0) {
    html += '<h3 style="font-size:12px;color:var(--muted);margin:0 0 8px;">Upcoming COD Cashouts</h3>' +
      '<div class="table-scroll"><table><tr><th>Order #</th><th>Customer</th><th>Cashout Date</th></tr>' +
      upcomingCashouts.map((r) => "<tr><td>" + esc(r.order.short_id) + "</td><td>" + esc(r.order.full_name) + "</td><td>" + new Date(r.date).toLocaleDateString() + "</td></tr>").join("") +
      "</table></div>";
  }

  if (breached.length === 0 && upcomingCashouts.length === 0 && wrongPackage.length === 0 && underchargedShipping.length === 0) {
    html += '<p class="empty">Nothing to flag among the scanned orders.</p>';
  }

  // Both of these are aggregates over the same already-fetched scan
  // results — no extra API calls needed.
  html += renderCourierPerformance(ok);
  html += renderGovernorateAccuracy(ok);

  body.innerHTML = html;
}

function renderCourierPerformance(ok) {
  const byCourier = {};
  ok.forEach((r) => {
    const firstAttempt = r.result.attempts && r.result.attempts[0];
    const courier = firstAttempt && firstAttempt.courierName;
    if (!courier) return;
    if (!byCourier[courier]) byCourier[courier] = { total: 0, delivered: 0 };
    byCourier[courier].total++;
    if (r.result.state && r.result.state.value === "Delivered") byCourier[courier].delivered++;
  });

  const couriers = Object.keys(byCourier);
  if (couriers.length === 0) return "";

  return '<h3 style="font-size:12px;color:var(--muted);margin:16px 0 8px;">Courier Performance <span class="hint">— from this scan\'s delivery attempts</span></h3>' +
    '<div class="table-scroll" style="margin-bottom:16px;"><table><tr><th>Courier</th><th>Orders</th><th>Delivered</th></tr>' +
    couriers.map((c) => "<tr><td>" + esc(c) + "</td><td>" + byCourier[c].total + "</td><td>" + byCourier[c].delivered + " / " + byCourier[c].total + "</td></tr>").join("") +
    "</table></div>";
}

function renderGovernorateAccuracy(ok) {
  const byGov = {};
  ok.forEach((r) => {
    const gov = r.order.government || "Unknown";
    if (!byGov[gov]) byGov[gov] = { count: 0, chargedSum: 0, billedSum: 0, priceCount: 0, slaBreaches: 0 };
    byGov[gov].count++;
    if (r.result.slaBreached) byGov[gov].slaBreaches++;
    if (typeof r.result.shipmentFees === "number" && typeof r.order.shipping_cost === "number") {
      byGov[gov].priceCount++;
      byGov[gov].chargedSum += r.order.shipping_cost;
      byGov[gov].billedSum += r.result.shipmentFees;
    }
  });

  const govs = Object.keys(byGov);
  if (govs.length === 0) return "";

  return '<h3 style="font-size:12px;color:var(--muted);margin:16px 0 8px;">Shipping Accuracy &amp; SLA by Governorate <span class="hint">— from this scan only, not your full order history</span></h3>' +
    '<div class="table-scroll"><table><tr><th>Governorate</th><th>Orders</th><th>Avg Charged</th><th>Avg Billed by Bosta</th><th>SLA Breach Rate</th></tr>' +
    govs.map((g) => {
      const d = byGov[g];
      const slaRate = Math.round((d.slaBreaches / d.count) * 100);
      return "<tr><td>" + esc(g) + "</td><td>" + d.count + "</td><td>" +
        (d.priceCount > 0 ? money(Math.round(d.chargedSum / d.priceCount)) : "—") + "</td><td>" +
        (d.priceCount > 0 ? money(Math.round(d.billedSum / d.priceCount)) : "—") + "</td><td>" +
        (d.slaBreaches > 0 ? '<span class="badge attn">' + slaRate + "%</span>" : "0%") +
        "</td></tr>";
    }).join("") +
    "</table></div>";
}

function renderOrders(data) {
  const root = document.getElementById("orders-root");
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  let html = '<div class="section-card">' +
    '<div class="section-head"><h2>Orders (' + data.total + ')</h2>' +
    '<div class="controls-row" style="margin-bottom:0;">' +
    '<input type="text" id="orders-search-input" placeholder="Name, phone, or order #" value="' + esc(ordersState.q) + '" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;min-width:200px;">' +
    '<select id="status-filter"><option value="">All statuses</option>' +
    VALID_STATUSES.map((s) => '<option value="' + s + '" ' + (ordersState.status === s ? "selected" : "") + ">" + s + "</option>").join("") +
    "</select>" +
    '<select id="saved-views-select"><option value="">— Saved Views —</option>' +
    getSavedOrderViews().map((v, i) => '<option value="' + i + '">' + esc(v.name) + "</option>").join("") +
    "</select>" +
    '<button id="save-view-btn" title="Save current search + status filter">Save View</button>' +
    '<button id="export-btn">Export CSV</button>' +
    "</div></div>";

  if (ordersState.selectedOrderIds.size > 0) {
    html += '<div class="controls-row" style="background:var(--accent-soft);padding:10px 14px;border-radius:10px;">' +
      "<span>" + ordersState.selectedOrderIds.size + " selected</span>" +
      '<select id="bulk-status-select">' + VALID_STATUSES.map((s) => '<option value="' + s + '">' + s + "</option>").join("") + "</select>" +
      '<button id="bulk-apply-btn" class="btn">Apply to selected</button>' +
      '<button id="bulk-awb-btn" type="button" class="btn" style="background:var(--card);border:1px solid var(--accent);color:var(--accent);">Print AWBs</button>' +
      '<span id="bulk-msg"></span></div>';
  }

  if (data.orders.length === 0) {
    html += '<p class="empty">No orders match this filter.</p></div>';
    root.innerHTML = html;
    wireOrdersControls(data);
    return;
  }

  const showMoney = data.orders.length > 0 && "total_cost" in data.orders[0];
  const colCount = showMoney ? 8 : 7;

  html += '<div class="table-scroll"><table>' +
    '<tr><th><input type="checkbox" id="select-all-checkbox"></th><th>Order #</th><th>EasyOrders Status</th><th>Bosta State</th><th>Customer</th><th>Governorate</th>' + (showMoney ? "<th>Total</th>" : "") + "<th>Actions</th></tr>";

  data.orders.forEach((o) => {
    const isExpanded = ordersState.expandedOrderId === o.order_id;
    html += '<tr class="order-row" data-order-id="' + o.order_id + '">' +
      '<td><input type="checkbox" class="row-checkbox" data-order-id="' + o.order_id + '" ' + (ordersState.selectedOrderIds.has(o.order_id) ? "checked" : "") + "></td>" +
      "<td>" + esc(o.short_id) + "</td>" +
      "<td>" + statusBadge(o.status, o.bosta) + "</td>" +
      "<td>" + (o.bosta ? esc(o.bosta.state_name) + " (" + o.bosta.hours_since_update + "h ago)" : "—") + "</td>" +
      "<td>" + esc(o.full_name) + "<br>" + esc(o.phone) + "</td>" +
      "<td>" + esc(o.government) + "</td>" +
      (showMoney ? "<td>" + money(o.total_cost) + "</td>" : "") +
      "<td>" + callLink(o.phone) + customerLink(o.phone) + printLink(o.order_id) + awbLink(o.order_id, o.bosta?.tracking_number) + detailLink(o.order_id) + "</td>" +
      "</tr>";

    if (isExpanded) {
      const items = (o.cart_items || []).map((it) => (it.product ? it.product.name : "Item") + " × " + it.quantity).join(", ") || "—";
      const timeline = (o.bosta_timeline || []).length === 0
        ? '<p class="empty" style="padding:8px 0;">No Bosta tracking events yet.</p>'
        : '<ul style="margin:0;padding-left:18px;font-size:12px;color:var(--ink);">' +
          o.bosta_timeline.map((e) => "<li>" + esc(e.state_name) + " — " + new Date(e.timestamp).toLocaleString() + "</li>").join("") +
          "</ul>";
      html += '<tr class="detail-row"><td colspan="' + colCount + '"><div class="detail-grid">' +
        "<div><span>Address</span>" + esc(o.address || "—") + "</div>" +
        "<div><span>Payment</span>" + esc(o.payment_method || "—") + "</div>" +
        ("shipping_cost" in o ? "<div><span>Shipping Cost</span>" + money(o.shipping_cost) + "</div>" : "") +
        "<div><span>Orders From This Phone</span>" + o.orders_count + "</div>" +
        "<div><span>Items</span>" + esc(items) + "</div>" +
        "</div>" +
        '<div style="margin-bottom:12px;"><span style="display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Delivery Timeline</span>' + timeline + "</div>" +
        (o.bosta?.tracking_number
          ? '<div style="margin-bottom:12px;">' +
            '<button type="button" class="bosta-live-btn action-link" data-order-id="' + o.order_id + '" style="background:none;border:none;cursor:pointer;padding:0;">Refresh live from Bosta</button>' +
            '<div id="bosta-live-' + o.order_id + '" style="margin-top:8px;font-size:12px;"></div>' +
            "</div>"
          : "") +
        '<select class="status-select" data-order-id="' + o.order_id + '">' +
        VALID_STATUSES.map((s) => '<option value="' + s + '" ' + (s === o.status ? "selected" : "") + ">" + s + "</option>").join("") +
        "</select>" +
        '<button class="status-btn" data-order-id="' + o.order_id + '">Update Status</button>' +
        "</td></tr>";
    }
  });
  html += "</table></div>";

  html += '<div class="pagination">' +
    '<button id="prev-page-btn" ' + (data.page <= 1 ? "disabled" : "") + ">Prev</button>" +
    "<span>Page " + data.page + " of " + totalPages + "</span>" +
    '<button id="next-page-btn" ' + (data.page >= totalPages ? "disabled" : "") + ">Next</button>" +
    "</div></div>";

  root.innerHTML = html;
  wireOrdersControls(data);
}

let ordersSearchDebounce = null;

const BOSTA_TIMELINE_LABELS = {
  new: "Order created",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

function renderBostaLive(orderId, result) {
  const el = document.getElementById("bosta-live-" + orderId);
  if (!el) return;
  if (!result.success) {
    el.innerHTML = '<span style="color:var(--danger-text);">' + esc(result.error || "Failed to fetch") + "</span>";
    return;
  }

  const timelineHtml = (result.timeline || [])
    .map((step) => {
      const label = BOSTA_TIMELINE_LABELS[step.value] || step.value;
      const when = step.date ? new Date(step.date).toLocaleString() : "pending";
      const color = step.done ? "var(--ink)" : "var(--muted)";
      return '<li style="color:' + color + ';">' + esc(label) + " — " + esc(when) + (step.desc ? " (" + esc(step.desc) + ")" : "") + "</li>";
    })
    .join("");

  const stateLogHtml = (result.stateLog || [])
    .map((entry) => {
      const when = entry.time ? new Date(entry.time).toLocaleString() : "";
      const who = entry.by ? esc(entry.by) : "System";
      return "<li>" + esc(entry.from || "—") + " → <strong>" + esc(entry.to || "—") + "</strong> — " + esc(when) + " (" + who + ")</li>";
    })
    .join("");

  el.innerHTML =
    '<div style="margin-bottom:6px;"><strong>Live state:</strong> ' + esc(result.state?.value || "—") + "</div>" +
    (result.cod != null ? '<div style="margin-bottom:6px;"><strong>COD amount:</strong> ' + money(result.cod) + "</div>" : "") +
    (result.shipmentFees != null ? '<div style="margin-bottom:6px;"><strong>Bosta shipping fee (actual):</strong> ' + money(result.shipmentFees) + "</div>" : "") +
    (result.numberOfAttempts != null ? '<div style="margin-bottom:6px;"><strong>Delivery attempts:</strong> ' + result.numberOfAttempts + "</div>" : "") +
    (result.nextCashoutDate ? '<div style="margin-bottom:6px;"><strong>Next COD cashout:</strong> ' + new Date(result.nextCashoutDate).toLocaleDateString() + "</div>" : "") +
    (result.slaBreached ? '<div style="margin-bottom:6px;"><span class="badge attn">SLA breached</span></div>' : "") +
    '<div style="margin:8px 0 2px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">Timeline</div>' +
    '<ul style="margin:0;padding-left:18px;">' + timelineHtml + "</ul>" +
    (stateLogHtml
      ? '<div style="margin:8px 0 2px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">Full State History (Bosta audit log)</div>' +
        '<ul style="margin:0;padding-left:18px;">' + stateLogHtml + "</ul>"
      : "");
}

function wireOrdersControls(data) {
  document.querySelectorAll(".bosta-live-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const orderId = btn.getAttribute("data-order-id");
      const el = document.getElementById("bosta-live-" + orderId);
      if (el) el.innerHTML = '<span style="color:var(--muted);">Fetching…</span>';
      btn.disabled = true;

      fetch("/api/admin/orders/" + orderId + "/bosta-live")
        .then((res) => res.json())
        .then((result) => {
          btn.disabled = false;
          renderBostaLive(orderId, result);
        })
        .catch(() => {
          btn.disabled = false;
          renderBostaLive(orderId, { success: false, error: "Network error" });
        });
    });
  });

  document.getElementById("status-filter").addEventListener("change", (e) => {
    ordersState.status = e.target.value;
    ordersState.page = 1;
    loadOrders();
  });

  document.getElementById("orders-search-input").addEventListener("input", (e) => {
    const value = e.target.value;
    clearTimeout(ordersSearchDebounce);
    ordersSearchDebounce = setTimeout(() => {
      ordersState.q = value.trim();
      ordersState.page = 1;
      loadOrders();
    }, 300);
  });

  document.getElementById("saved-views-select").addEventListener("change", (e) => {
    if (e.target.value === "") return;
    const view = getSavedOrderViews()[Number(e.target.value)];
    if (!view) return;
    ordersState.status = view.status;
    ordersState.q = view.q;
    ordersState.page = 1;
    loadOrders();
  });

  document.getElementById("save-view-btn").addEventListener("click", () => {
    const name = prompt("Name this view (e.g. \"Pending Cairo orders\"):");
    if (!name) return;
    const views = getSavedOrderViews();
    views.push({ name, status: ordersState.status, q: ordersState.q });
    setSavedOrderViews(views);
    loadOrders();
  });

  const exportBtn = document.getElementById("export-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportCsv(data.orders));

  const prevBtn = document.getElementById("prev-page-btn");
  const nextBtn = document.getElementById("next-page-btn");
  if (prevBtn) prevBtn.addEventListener("click", () => { ordersState.page--; loadOrders(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { ordersState.page++; loadOrders(); });

  document.querySelectorAll("tr.order-row").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".action-link") || e.target.closest("input")) return;
      const id = tr.getAttribute("data-order-id");
      ordersState.expandedOrderId = ordersState.expandedOrderId === id ? null : id;
      renderOrders(data);
    });
  });

  document.querySelectorAll(".row-checkbox").forEach((cb) => {
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      const id = cb.getAttribute("data-order-id");
      if (cb.checked) ordersState.selectedOrderIds.add(id);
      else ordersState.selectedOrderIds.delete(id);
      renderOrders(data);
    });
  });

  const selectAllCb = document.getElementById("select-all-checkbox");
  if (selectAllCb) {
    selectAllCb.addEventListener("change", () => {
      data.orders.forEach((o) => {
        if (selectAllCb.checked) ordersState.selectedOrderIds.add(o.order_id);
        else ordersState.selectedOrderIds.delete(o.order_id);
      });
      renderOrders(data);
    });
  }

  const bulkBtn = document.getElementById("bulk-apply-btn");
  if (bulkBtn) {
    bulkBtn.addEventListener("click", () => {
      const newStatus = document.getElementById("bulk-status-select").value;
      const msg = document.getElementById("bulk-msg");
      const ids = Array.from(ordersState.selectedOrderIds);

      bulkBtn.disabled = true;
      msg.textContent = "Updating " + ids.length + "…";

      Promise.all(
        ids.map((id) =>
          fetch("/api/admin/update-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: id, status: newStatus }),
          }).then((res) => res.json())
        )
      ).then((results) => {
        const failed = results.filter((r) => !r.success).length;
        bulkBtn.disabled = false;
        if (failed === 0) {
          ordersState.selectedOrderIds.clear();
          loadOrders();
          loadAttentionAndOverview();
        } else {
          msg.textContent = failed + " of " + ids.length + " failed.";
          msg.style.color = "#c0392b";
        }
      });
    });
  }

  const bulkAwbBtn = document.getElementById("bulk-awb-btn");
  if (bulkAwbBtn) {
    bulkAwbBtn.addEventListener("click", () => {
      const ids = Array.from(ordersState.selectedOrderIds);
      window.open("/admin/awb-bulk?orderIds=" + ids.map(encodeURIComponent).join(","), "_blank");
    });
  }

  document.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const orderId = btn.getAttribute("data-order-id");
      const select = document.querySelector('.status-select[data-order-id="' + orderId + '"]');
      const newStatus = select.value;
      btn.disabled = true;
      btn.textContent = "Updating…";

      fetch("/api/admin/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, status: newStatus }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.success) {
            loadOrders();
            loadAttentionAndOverview();
          } else {
            btn.disabled = false;
            btn.textContent = "Update Status";
            alert(result.error || "Failed to update status");
          }
        });
    });
  });
}

// ---------------- Products (owner-only): price, sale price, stock ----------------

// ---------------- Production: capacity, raw materials, recipes, runs (owner-only) ----------------

function renderProductionCapacity() {
  const root = document.getElementById("production-capacity-root");
  root.innerHTML = '<div class="section-card"><p class="empty">Loading…</p></div>';

  fetch("/api/admin/production/capacity")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load' + (data.error ? ": " + esc(data.error) : ".") + '</p></div>'; return; }

      if (data.capacity.length === 0) {
        root.innerHTML = '<div class="section-card"><h2>What Can We Produce Right Now?</h2><p class="empty">No products have a recipe yet — set one up below.</p></div>';
        return;
      }

      root.innerHTML = '<div class="section-card"><h2>What Can We Produce Right Now? <span class="hint">— based on current raw material stock</span></h2>' +
        '<div class="table-scroll"><table><tr><th>Product</th><th>Can Produce Now</th><th>Limiting Material</th></tr>' +
        data.capacity.map((c) => {
          const cls = c.maxProducible <= 0 ? ' class="attention"' : "";
          return "<tr" + cls + "><td>" + esc(c.productName) + "</td><td><strong>" + c.maxProducible + " units</strong></td><td>" +
            (c.limitingMaterial ? esc(c.limitingMaterial.name) : "—") + "</td></tr>";
        }).join("") +
        "</table></div></div>";
    })
    .catch((err) => { console.error(err); root.innerHTML = '<div class="section-card"><p class="empty">Failed to load — network or server error.</p></div>'; });
}

function renderRawMaterials() {
  const root = document.getElementById("raw-materials-root");
  root.innerHTML = '<div class="section-card"><p class="empty">Loading materials…</p></div>';

  Promise.all([
    fetch("/api/admin/production/raw-materials").then((res) => res.json()),
    fetch("/api/admin/products").then((res) => res.json()),
  ]).then(([data, productsData]) => {
      if (!data.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load materials.</p></div>'; return; }
      const products = productsData.success ? productsData.products : [];

      const categories = Array.from(new Set(data.materials.map((m) => m.category || "General"))).sort();

      let html = '<div class="section-card"><h2>Raw Materials <span class="hint">— shared materials (bottles, caps, alcohol) plus per-product ones (stickers, scents)</span></h2>';

      if (categories.length > 1) {
        html += '<div style="margin-bottom:12px;"><select id="mat-category-filter" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink);">' +
          '<option value="">All categories</option>' +
          categories.map((c) => '<option value="' + esc(c) + '">' + esc(c) + "</option>").join("") +
          "</select></div>";
      }

      html += '<div class="table-scroll"><table><tr><th>Material</th><th>Category</th><th>For Product</th><th>Unit</th><th>Stock</th><th>Cost / Unit</th><th>Low Stock At</th><th></th></tr>';

      data.materials.forEach((m) => {
        const low = m.stock <= m.lowStockThreshold;
        html += '<tr data-material-id="' + m.id + '" data-category="' + esc(m.category || "General") + '"' + (low ? ' class="attention"' : "") + '>' +
          '<td>' + esc(m.name) + '</td>' +
          '<td>' + esc(m.category || "General") + '</td>' +
          '<td>' + (m.productName ? '<span class="badge neutral">' + esc(m.productName) + '</span>' : "—") + '</td>' +
          '<td><input type="text" class="mat-unit" value="' + esc(m.unit) + '" style="width:70px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></td>' +
          '<td><input type="number" step="0.01" class="mat-stock" value="' + m.stock + '" style="width:90px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></td>' +
          '<td><input type="number" step="0.01" class="mat-cost" value="' + m.costPerUnit + '" style="width:90px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></td>' +
          '<td><input type="number" step="0.01" class="mat-threshold" value="' + m.lowStockThreshold + '" style="width:80px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></td>' +
          '<td><button class="mat-save-btn btn" style="padding:6px 12px;">Save</button> <button class="mat-delete-btn" style="padding:6px 10px;color:var(--danger-text);">Delete</button> <span class="mat-msg" style="font-size:12px;"></span></td>' +
          "</tr>";
      });

      html += "</table></div>" +
        '<h3 style="font-size:12px;color:var(--muted);margin:16px 0 8px;">Add Raw Material</h3>' +
        '<p class="hint" style="margin:0 0 10px;">For a material that\'s unique to one product (a sticker or scent), pick the product below instead of adding it here one by one — the Recipes tab has a faster shortcut for that.</p>' +
        '<div class="detail-grid" style="margin-bottom:14px;">' +
        '<div><span>Name</span><input type="text" id="new-mat-name" placeholder="e.g. Glass Bottle 236ml" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Category</span><input type="text" id="new-mat-category" list="mat-category-list" placeholder="Bottle / Cap / Sticker / Scent / Alcohol" value="General" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);">' +
        '<datalist id="mat-category-list">' + categories.map((c) => '<option value="' + esc(c) + '">').join("") + '<option value="Bottle"><option value="Cap"><option value="Sticker"><option value="Scent"><option value="Alcohol"></datalist></div>' +
        '<div><span>For Product (optional)</span><select id="new-mat-product" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"><option value="">— shared material —</option>' +
        products.map((p) => '<option value="' + esc(p.id) + '" data-name="' + esc(p.name) + '">' + esc(p.name) + "</option>").join("") + "</select></div>" +
        '<div><span>Unit</span><input type="text" id="new-mat-unit" placeholder="piece / ml / gram" value="piece" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Starting Stock</span><input type="number" step="0.01" id="new-mat-stock" value="0" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Cost per Unit</span><input type="number" step="0.01" id="new-mat-cost" value="0" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Low Stock Threshold</span><input type="number" step="0.01" id="new-mat-threshold" value="0" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        "</div>" +
        '<button id="add-mat-btn" class="btn">Add Material</button> <span id="add-mat-msg" style="font-size:12px;"></span></div>';

      root.innerHTML = html;

      const filterSelect = document.getElementById("mat-category-filter");
      if (filterSelect) {
        filterSelect.addEventListener("change", () => {
          const val = filterSelect.value;
          root.querySelectorAll("tr[data-material-id]").forEach((row) => {
            row.style.display = !val || row.getAttribute("data-category") === val ? "" : "none";
          });
        });
      }

      root.querySelectorAll(".mat-save-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest("tr");
          const id = row.getAttribute("data-material-id");
          const msg = row.querySelector(".mat-msg");
          const body = {
            unit: row.querySelector(".mat-unit").value,
            stock: row.querySelector(".mat-stock").value,
            costPerUnit: row.querySelector(".mat-cost").value,
            lowStockThreshold: row.querySelector(".mat-threshold").value,
          };
          btn.disabled = true;
          msg.textContent = "Saving…";
          msg.style.color = "var(--muted)";
          fetch("/api/admin/production/raw-materials/" + id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
            .then((res) => res.json())
            .then((result) => {
              btn.disabled = false;
              if (result.success) {
                msg.textContent = "Saved.";
                msg.style.color = "#2e7d32";
              } else {
                msg.textContent = result.error || "Failed.";
                msg.style.color = "#c0392b";
              }
            })
            .catch(() => { btn.disabled = false; msg.textContent = "Failed."; msg.style.color = "#c0392b"; });
        });
      });

      root.querySelectorAll(".mat-delete-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest("tr");
          const id = row.getAttribute("data-material-id");
          if (!confirm("Delete this material? Any recipe using it will break.")) return;
          fetch("/api/admin/production/raw-materials/" + id, { method: "DELETE" })
            .then((res) => res.json())
            .then((result) => {
              if (result.success) { renderRawMaterials(); renderRecipes(); }
              else alert(result.error || "Failed to delete");
            });
        });
      });

      document.getElementById("add-mat-btn").addEventListener("click", () => {
        const msg = document.getElementById("add-mat-msg");
        const name = document.getElementById("new-mat-name").value.trim();
        if (!name) { msg.textContent = "Name is required."; msg.style.color = "#c0392b"; return; }

        const productSelect = document.getElementById("new-mat-product");
        const productOption = productSelect.options[productSelect.selectedIndex];
        const body = {
          name,
          category: document.getElementById("new-mat-category").value.trim() || "General",
          productId: productSelect.value || null,
          productName: productSelect.value ? productOption.getAttribute("data-name") : null,
          unit: document.getElementById("new-mat-unit").value.trim() || "piece",
          stock: document.getElementById("new-mat-stock").value,
          costPerUnit: document.getElementById("new-mat-cost").value,
          lowStockThreshold: document.getElementById("new-mat-threshold").value,
        };
        msg.textContent = "Adding…";
        msg.style.color = "var(--muted)";
        fetch("/api/admin/production/raw-materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success) { renderRawMaterials(); }
            else { msg.textContent = result.error || "Failed."; msg.style.color = "#c0392b"; }
          })
          .catch(() => { msg.textContent = "Failed."; msg.style.color = "#c0392b"; });
      });
    })
    .catch(() => { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load materials.</p></div>'; });
}

function renderRecipes() {
  const root = document.getElementById("recipes-root");
  root.innerHTML = '<div class="section-card"><p class="empty">Loading…</p></div>';

  Promise.all([
    fetch("/api/admin/products").then((res) => res.json()),
    fetch("/api/admin/production/raw-materials").then((res) => res.json()),
  ]).then(([productsData, materialsData]) => {
    if (!productsData.success || !materialsData.success) {
      const err = productsData.error || materialsData.error;
      root.innerHTML = '<div class="section-card"><p class="empty">Failed to load' + (err ? ": " + esc(err) : ".") + '</p></div>';
      return;
    }
    const products = productsData.products;
    const materials = materialsData.materials;

    root.innerHTML = '<div class="section-card"><h2>Recipes <span class="hint">— what each product is made from</span></h2>' +
      '<div style="margin-bottom:14px;"><select id="recipe-product-select" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink);"><option value="">— choose a product —</option>' +
      products.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>").join("") +
      "</select></div>" +
      '<div id="recipe-editor"></div></div>';

    document.getElementById("recipe-product-select").addEventListener("change", (e) => {
      const productId = e.target.value;
      if (!productId) { document.getElementById("recipe-editor").innerHTML = ""; return; }
      const product = products.find((p) => p.id === productId);
      loadRecipeEditor(productId, materials, product ? product.name : "");
    });
  }).catch((err) => { console.error(err); root.innerHTML = '<div class="section-card"><p class="empty">Failed to load — network or server error.</p></div>'; });
}

function recipeRowHtml(materials, selectedMaterialId, quantityPerUnit) {
  return '<div class="recipe-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
    '<select class="recipe-material-select" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);">' +
    materials.map((m) => '<option value="' + esc(m.id) + '" ' + (m.id === selectedMaterialId ? "selected" : "") + '>' + esc(m.name) + " (" + esc(m.unit) + ")</option>").join("") +
    '</select>' +
    '<input type="number" step="0.001" class="recipe-qty-input" value="' + (quantityPerUnit ?? "") + '" placeholder="qty per unit" style="width:120px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);">' +
    '<button type="button" class="recipe-remove-btn" style="padding:6px 10px;color:var(--danger-text);">×</button>' +
    "</div>";
}

function quickAddMaterialFormHtml(productName) {
  return '<div id="quick-add-mat-form" style="border:1px dashed var(--border);border-radius:8px;padding:12px;margin:10px 0;">' +
    '<div class="detail-grid" style="margin-bottom:10px;">' +
    '<div><span>Name</span><input type="text" id="qam-name" value="Sticker — ' + esc(productName) + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
    '<div><span>Category</span><select id="qam-category" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"><option value="Sticker">Sticker</option><option value="Scent">Scent</option><option value="Other">Other</option></select></div>' +
    '<div><span>Unit</span><input type="text" id="qam-unit" value="piece" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
    '<div><span>Starting Stock</span><input type="number" step="0.01" id="qam-stock" value="0" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
    '<div><span>Cost per Unit</span><input type="number" step="0.01" id="qam-cost" value="0" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
    "</div>" +
    '<button type="button" id="qam-submit-btn" class="btn">Create &amp; Add to Recipe</button> <button type="button" id="qam-cancel-btn" style="padding:6px 12px;">Cancel</button> <span id="qam-msg" style="font-size:12px;"></span>' +
    "</div>";
}

function loadRecipeEditor(productId, materials, productName) {
  const editor = document.getElementById("recipe-editor");
  editor.innerHTML = '<p class="empty">Loading recipe…</p>';

  fetch("/api/admin/production/recipes/" + productId)
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { editor.innerHTML = '<p class="empty">Failed to load recipe.</p>'; return; }

      const rows = data.ingredients.length > 0 ? data.ingredients : (materials.length > 0 ? [{ materialId: materials[0].id, quantityPerUnit: "" }] : []);
      editor.innerHTML = '<div id="recipe-rows">' +
        rows.map((r) => recipeRowHtml(materials, r.materialId, r.quantityPerUnit)).join("") +
        "</div>" +
        (materials.length > 0 ? '<button type="button" id="recipe-add-row-btn" style="padding:6px 12px;margin-top:4px;">+ Add Ingredient</button> ' : "") +
        '<button type="button" id="recipe-quick-add-btn" style="padding:6px 12px;margin-top:4px;">+ New material for this product</button>' +
        '<div id="quick-add-mat-container"></div>' +
        '<div style="margin-top:14px;"><button id="recipe-save-btn" class="btn">Save Recipe</button> <span id="recipe-save-msg" style="font-size:12px;"></span></div>';

      function wireRemoveButtons() {
        editor.querySelectorAll(".recipe-remove-btn").forEach((btn) => {
          btn.onclick = () => btn.closest(".recipe-row").remove();
        });
      }
      wireRemoveButtons();

      function refreshMaterialSelectOptions() {
        editor.querySelectorAll(".recipe-material-select").forEach((select) => {
          const current = select.value;
          select.innerHTML = materials.map((m) => '<option value="' + esc(m.id) + '" ' + (m.id === current ? "selected" : "") + '>' + esc(m.name) + " (" + esc(m.unit) + ")</option>").join("");
        });
      }

      const addRowBtn = document.getElementById("recipe-add-row-btn");
      if (addRowBtn) {
        addRowBtn.addEventListener("click", () => {
          document.getElementById("recipe-rows").insertAdjacentHTML("beforeend", recipeRowHtml(materials, materials[0].id, ""));
          wireRemoveButtons();
        });
      }

      document.getElementById("recipe-quick-add-btn").addEventListener("click", () => {
        const container = document.getElementById("quick-add-mat-container");
        if (container.innerHTML) { container.innerHTML = ""; return; }
        container.innerHTML = quickAddMaterialFormHtml(productName);

        document.getElementById("qam-cancel-btn").addEventListener("click", () => { container.innerHTML = ""; });

        document.getElementById("qam-submit-btn").addEventListener("click", () => {
          const msg = document.getElementById("qam-msg");
          const name = document.getElementById("qam-name").value.trim();
          if (!name) { msg.textContent = "Name is required."; msg.style.color = "#c0392b"; return; }

          const body = {
            name,
            category: document.getElementById("qam-category").value,
            productId,
            productName,
            unit: document.getElementById("qam-unit").value.trim() || "piece",
            stock: document.getElementById("qam-stock").value,
            costPerUnit: document.getElementById("qam-cost").value,
          };
          msg.textContent = "Creating…";
          msg.style.color = "var(--muted)";
          fetch("/api/admin/production/raw-materials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
            .then((res) => res.json())
            .then((result) => {
              if (!result.success) { msg.textContent = result.error || "Failed."; msg.style.color = "#c0392b"; return; }
              materials.push(result.material);
              refreshMaterialSelectOptions();
              const rowsContainer = document.getElementById("recipe-rows");
              if (rowsContainer) {
                rowsContainer.insertAdjacentHTML("beforeend", recipeRowHtml(materials, result.material.id, ""));
              } else {
                editor.querySelector("#recipe-quick-add-btn").insertAdjacentHTML("beforebegin", '<div id="recipe-rows">' + recipeRowHtml(materials, result.material.id, "") + "</div>");
              }
              wireRemoveButtons();
              container.innerHTML = "";
            })
            .catch(() => { msg.textContent = "Failed."; msg.style.color = "#c0392b"; });
        });
      });

      document.getElementById("recipe-save-btn").addEventListener("click", () => {
        const msg = document.getElementById("recipe-save-msg");
        const ingredients = Array.from(editor.querySelectorAll(".recipe-row")).map((row) => ({
          materialId: row.querySelector(".recipe-material-select").value,
          quantityPerUnit: row.querySelector(".recipe-qty-input").value,
        }));

        msg.textContent = "Saving…";
        msg.style.color = "var(--muted)";
        fetch("/api/admin/production/recipes/" + productId, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success) {
              msg.textContent = "Saved.";
              msg.style.color = "#2e7d32";
              renderProductionCapacity();
            } else {
              msg.textContent = result.error || "Failed.";
              msg.style.color = "#c0392b";
            }
          })
          .catch(() => { msg.textContent = "Failed."; msg.style.color = "#c0392b"; });
      });
    })
    .catch(() => { editor.innerHTML = '<p class="empty">Failed to load recipe.</p>'; });
}

function renderProductionRuns() {
  const root = document.getElementById("production-runs-root");
  root.innerHTML = '<div class="section-card"><p class="empty">Loading…</p></div>';

  Promise.all([
    fetch("/api/admin/products").then((res) => res.json()),
    fetch("/api/admin/production/runs").then((res) => res.json()),
  ]).then(([productsData, runsData]) => {
    if (!productsData.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load.</p></div>'; return; }
    const products = productsData.products;
    const runs = runsData.success ? runsData.runs : [];

    let html = '<div class="section-card"><h2>Log a Production Run</h2>' +
      '<div class="detail-grid" style="margin-bottom:14px;">' +
      '<div><span>Product</span><select id="run-product-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"><option value="">— choose —</option>' +
      products.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>").join("") +
      "</select></div>" +
      '<div><span>Quantity Produced</span><input type="number" step="1" id="run-quantity-input" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
      '<div><span>Notes (optional)</span><input type="text" id="run-notes-input" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
      "</div>" +
      '<button id="run-submit-btn" class="btn">Log Production Run</button> <span id="run-msg" style="font-size:12px;"></span></div>';

    html += '<div class="section-card"><h2>Recent Production Runs</h2>';
    if (runs.length === 0) {
      html += '<p class="empty">No production runs logged yet.</p>';
    } else {
      html += '<div class="table-scroll"><table><tr><th>Date</th><th>Product</th><th>Quantity</th><th>Unit Cost</th><th>Total Cost</th><th>By</th></tr>' +
        runs.map((r) =>
          "<tr><td>" + new Date(r.createdAt).toLocaleString() + "</td><td>" + esc(r.productName) + "</td><td>" + r.quantityProduced + "</td><td>" +
          money(Math.round(r.unitCost * 100) / 100) + "</td><td>" + money(Math.round(r.totalCost * 100) / 100) + "</td><td>" + esc(r.producedBy) + "</td></tr>"
        ).join("") +
        "</table></div>";
    }
    html += "</div>";

    root.innerHTML = html;

    document.getElementById("run-submit-btn").addEventListener("click", () => {
      const msg = document.getElementById("run-msg");
      const productId = document.getElementById("run-product-select").value;
      const quantityProduced = document.getElementById("run-quantity-input").value;
      const notes = document.getElementById("run-notes-input").value.trim();

      if (!productId || !quantityProduced) {
        msg.textContent = "Product and quantity are required.";
        msg.style.color = "#c0392b";
        return;
      }

      msg.textContent = "Logging…";
      msg.style.color = "var(--muted)";
      fetch("/api/admin/production/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantityProduced, notes }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.success) {
            renderProductionRuns();
            renderProductionCapacity();
            renderRawMaterials();
          } else if (result.shortages) {
            msg.innerHTML = "Not enough stock: " + result.shortages.map((s) => esc(s.materialName) + " (need " + s.required + ", have " + s.available + ")").join("; ");
            msg.style.color = "#c0392b";
          } else {
            msg.textContent = result.error || "Failed.";
            msg.style.color = "#c0392b";
          }
        })
        .catch(() => { msg.textContent = "Failed."; msg.style.color = "#c0392b"; });
    });
  }).catch(() => { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load.</p></div>'; });
}

// ---------------- Suppliers & Purchases (owner-only) ----------------

let cachedSuppliers = [];

function renderSuppliers() {
  const root = document.getElementById("suppliers-root");
  root.innerHTML = '<div class="section-card"><p class="empty">Loading suppliers…</p></div>';

  fetch("/api/admin/production/suppliers")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load suppliers.</p></div>'; return; }
      cachedSuppliers = data.suppliers;

      let html = '<div class="section-card"><h2>Suppliers</h2>';
      if (data.suppliers.length === 0) {
        html += '<p class="empty">No suppliers yet — add one below.</p>';
      } else {
        html += '<div class="table-scroll"><table><tr><th>Name</th><th>Phone</th><th>Balance Owed</th><th></th></tr>' +
          data.suppliers.map((s) => {
            const owed = s.balance > 0 ? ' class="attention"' : "";
            return '<tr data-supplier-id="' + s.id + '"><td>' + esc(s.name) + '</td><td>' + esc(s.phone || "—") + '</td><td' + owed + '>' + money(s.balance) + '</td>' +
              '<td>' + (s.balance > 0 ? '<button class="pay-supplier-btn" style="padding:6px 10px;">Record Payment</button> ' : "") +
              '<button class="delete-supplier-btn" style="padding:6px 10px;color:var(--danger-text);">Delete</button></td></tr>';
          }).join("") +
          "</table></div>";
      }

      html += '<h3 style="font-size:12px;color:var(--muted);margin:16px 0 8px;">Add Supplier</h3>' +
        '<div class="detail-grid" style="margin-bottom:14px;">' +
        '<div><span>Name</span><input type="text" id="new-sup-name" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Phone</span><input type="text" id="new-sup-phone" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Notes</span><input type="text" id="new-sup-notes" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        "</div>" +
        '<button id="add-sup-btn" class="btn">Add Supplier</button> <span id="add-sup-msg" style="font-size:12px;"></span></div>';

      root.innerHTML = html;

      root.querySelectorAll(".delete-supplier-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest("tr");
          const id = row.getAttribute("data-supplier-id");
          if (!confirm("Delete this supplier?")) return;
          fetch("/api/admin/production/suppliers/" + id, { method: "DELETE" })
            .then((res) => res.json())
            .then((result) => { if (result.success) renderSuppliers(); else alert(result.error || "Failed"); });
        });
      });

      root.querySelectorAll(".pay-supplier-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest("tr");
          const id = row.getAttribute("data-supplier-id");
          const amount = prompt("Payment amount:");
          if (!amount) return;
          fetch("/api/admin/production/suppliers/" + id + "/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
          })
            .then((res) => res.json())
            .then((result) => { if (result.success) renderSuppliers(); else alert(result.error || "Failed"); });
        });
      });

      document.getElementById("add-sup-btn").addEventListener("click", () => {
        const msg = document.getElementById("add-sup-msg");
        const name = document.getElementById("new-sup-name").value.trim();
        if (!name) { msg.textContent = "Name is required."; msg.style.color = "#c0392b"; return; }
        const body = {
          name,
          phone: document.getElementById("new-sup-phone").value.trim(),
          notes: document.getElementById("new-sup-notes").value.trim(),
        };
        msg.textContent = "Adding…";
        msg.style.color = "var(--muted)";
        fetch("/api/admin/production/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then((res) => res.json())
          .then((result) => { if (result.success) renderSuppliers(); else { msg.textContent = result.error || "Failed."; msg.style.color = "#c0392b"; } })
          .catch(() => { msg.textContent = "Failed."; msg.style.color = "#c0392b"; });
      });
    })
    .catch(() => { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load suppliers.</p></div>'; });
}

function purchaseItemRowHtml(materials) {
  return '<div class="purchase-item-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
    '<select class="purchase-material-select" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);">' +
    materials.map((m) => '<option value="' + esc(m.id) + '">' + esc(m.name) + " (" + esc(m.unit) + ")</option>").join("") +
    '</select>' +
    '<input type="number" step="0.01" class="purchase-qty-input" placeholder="quantity" style="width:110px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);">' +
    '<input type="number" step="0.01" class="purchase-cost-input" placeholder="unit cost" style="width:110px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);">' +
    '<button type="button" class="purchase-remove-row-btn" style="padding:6px 10px;color:var(--danger-text);">×</button>' +
    "</div>";
}

function renderPurchases() {
  const root = document.getElementById("purchases-root");
  root.innerHTML = '<div class="section-card"><p class="empty">Loading…</p></div>';

  Promise.all([
    fetch("/api/admin/production/suppliers").then((res) => res.json()),
    fetch("/api/admin/production/raw-materials").then((res) => res.json()),
    fetch("/api/admin/production/purchases").then((res) => res.json()),
  ]).then(([suppliersData, materialsData, purchasesData]) => {
    if (!suppliersData.success || !materialsData.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load.</p></div>'; return; }
    const suppliers = suppliersData.suppliers;
    const materials = materialsData.materials;
    const purchases = purchasesData.success ? purchasesData.purchases : [];

    if (suppliers.length === 0 || materials.length === 0) {
      root.innerHTML = '<div class="section-card"><h2>Log a Purchase</h2><p class="empty">Add at least one supplier and one raw material first.</p></div>';
      return;
    }

    let html = '<div class="section-card"><h2>Log a Purchase <span class="hint">— buying raw materials from a supplier</span></h2>' +
      '<div style="margin-bottom:10px;"><span style="font-size:12px;color:var(--muted);">Supplier</span><br>' +
      '<select id="purchase-supplier-select" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--ink);">' +
      suppliers.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>").join("") +
      "</select></div>" +
      '<div id="purchase-items">' + purchaseItemRowHtml(materials) + "</div>" +
      '<button type="button" id="purchase-add-row-btn" style="padding:6px 12px;margin-top:4px;">+ Add Item</button>' +
      '<div class="detail-grid" style="margin-top:14px;">' +
      '<div><span>Amount Paid Now</span><input type="number" step="0.01" id="purchase-amount-paid" value="0" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
      '<div><span>Notes (optional)</span><input type="text" id="purchase-notes" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
      "</div>" +
      '<div style="margin-top:14px;"><button id="purchase-submit-btn" class="btn">Log Purchase</button> <span id="purchase-msg" style="font-size:12px;"></span></div>' +
      "</div>";

    html += '<div class="section-card"><h2>Recent Purchases</h2>';
    if (purchases.length === 0) {
      html += '<p class="empty">No purchases logged yet.</p>';
    } else {
      html += '<div class="table-scroll"><table><tr><th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Paid</th></tr>' +
        purchases.map((p) =>
          "<tr><td>" + new Date(p.createdAt).toLocaleString() + "</td><td>" + esc(p.supplierName) + "</td><td>" +
          esc(p.items.map((i) => i.materialName + " ×" + i.quantity).join(", ")) + "</td><td>" + money(p.totalAmount) + "</td><td>" + money(p.amountPaid) + "</td></tr>"
        ).join("") +
        "</table></div>";
    }
    html += "</div>";

    root.innerHTML = html;

    function wireRemoveButtons() {
      root.querySelectorAll(".purchase-remove-row-btn").forEach((btn) => {
        btn.onclick = () => btn.closest(".purchase-item-row").remove();
      });
    }
    wireRemoveButtons();

    document.getElementById("purchase-add-row-btn").addEventListener("click", () => {
      document.getElementById("purchase-items").insertAdjacentHTML("beforeend", purchaseItemRowHtml(materials));
      wireRemoveButtons();
    });

    document.getElementById("purchase-submit-btn").addEventListener("click", () => {
      const msg = document.getElementById("purchase-msg");
      const supplierId = document.getElementById("purchase-supplier-select").value;
      const items = Array.from(root.querySelectorAll(".purchase-item-row")).map((row) => ({
        materialId: row.querySelector(".purchase-material-select").value,
        quantity: row.querySelector(".purchase-qty-input").value,
        unitCost: row.querySelector(".purchase-cost-input").value,
      }));
      const amountPaid = document.getElementById("purchase-amount-paid").value;
      const notes = document.getElementById("purchase-notes").value.trim();

      msg.textContent = "Logging…";
      msg.style.color = "var(--muted)";
      fetch("/api/admin/production/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, items, amountPaid, notes }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.success) {
            renderPurchases();
            renderSuppliers();
            renderRawMaterials();
            renderProductionCapacity();
          } else {
            msg.textContent = result.error || "Failed.";
            msg.style.color = "#c0392b";
          }
        })
        .catch(() => { msg.textContent = "Failed."; msg.style.color = "#c0392b"; });
    });
  }).catch(() => { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load.</p></div>'; });
}

// ---------------- Cash Ledger (owner-only) ----------------

function renderCashLedger() {
  const root = document.getElementById("cash-ledger-root");
  root.innerHTML = '<div class="section-card"><p class="empty">Loading…</p></div>';

  fetch("/api/admin/production/cash-ledger")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load.</p></div>'; return; }

      let html = '<div class="section-card"><h2>Cash Ledger <span class="hint">— running balance over the last 100 entries</span></h2>' +
        '<div class="stat-card" style="max-width:220px;margin-bottom:16px;"><div class="num">' + money(data.balance) + '</div><div class="label">Cash Balance</div></div>' +
        '<h3 style="font-size:12px;color:var(--muted);margin:16px 0 8px;">Record a Manual Entry</h3>' +
        '<div class="detail-grid" style="margin-bottom:14px;">' +
        '<div><span>Type</span><select id="cash-type-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"><option value="receipt">Receipt (cash in)</option><option value="disbursement">Disbursement (cash out)</option></select></div>' +
        '<div><span>Amount</span><input type="number" step="0.01" id="cash-amount-input" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Category</span><input type="text" id="cash-category-input" placeholder="e.g. rent, sale, misc" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Description</span><input type="text" id="cash-description-input" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        "</div>" +
        '<button id="cash-submit-btn" class="btn">Add Entry</button> <span id="cash-msg" style="font-size:12px;"></span>';

      html += '<h3 style="font-size:12px;color:var(--muted);margin:20px 0 8px;">Recent Entries</h3>';
      if (data.entries.length === 0) {
        html += '<p class="empty">No cash entries yet.</p>';
      } else {
        html += '<div class="table-scroll"><table><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th><th>By</th></tr>' +
          data.entries.map((e) => {
            const sign = e.type === "receipt" ? "+" : "−";
            const color = e.type === "receipt" ? "#2e7d32" : "#c0392b";
            return "<tr><td>" + new Date(e.createdAt).toLocaleString() + "</td><td>" +
              '<span class="badge ' + (e.type === "receipt" ? "neutral" : "attn") + '">' + esc(e.type) + "</span></td><td>" + esc(e.category) + "</td><td>" +
              esc(e.description || "—") + '</td><td style="color:' + color + ';font-weight:600;">' + sign + money(e.amount) + "</td><td>" + esc(e.recordedBy) + "</td></tr>";
          }).join("") +
          "</table></div>";
      }
      html += "</div>";

      root.innerHTML = html;

      document.getElementById("cash-submit-btn").addEventListener("click", () => {
        const msg = document.getElementById("cash-msg");
        const type = document.getElementById("cash-type-select").value;
        const amount = document.getElementById("cash-amount-input").value;
        const category = document.getElementById("cash-category-input").value.trim();
        const description = document.getElementById("cash-description-input").value.trim();

        if (!amount) { msg.textContent = "Amount is required."; msg.style.color = "#c0392b"; return; }

        msg.textContent = "Saving…";
        msg.style.color = "var(--muted)";
        fetch("/api/admin/production/cash-ledger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, amount, category, description }),
        })
          .then((res) => res.json())
          .then((result) => { if (result.success) renderCashLedger(); else { msg.textContent = result.error || "Failed."; msg.style.color = "#c0392b"; } })
          .catch(() => { msg.textContent = "Failed."; msg.style.color = "#c0392b"; });
      });
    })
    .catch(() => { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load.</p></div>'; });
}

function renderProducts() {
  const root = document.getElementById("products-root");
  if (currentUser.role !== "owner") { root.innerHTML = ""; return; }

  root.innerHTML = '<div class="section-card"><p class="empty">Loading products…</p></div>';

  Promise.all([
    fetch("/api/admin/products").then((res) => res.json()),
    fetch("/api/admin/categories").then((res) => res.json()),
  ])
    .then(([productsData, categoriesData]) => {
      if (!productsData.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load products.</p></div>'; return; }
      const categories = categoriesData.success ? categoriesData.categories : [];

      let html = '<div class="section-card"><h2>Products <span class="hint">— edit price, sale price, stock, visibility, and categories directly (writes to Easy Orders)</span></h2>' +
        '<div class="table-scroll"><table><tr><th>Product</th><th>Price</th><th>Sale Price</th><th>Stock</th><th>Visible</th><th>Add Category</th><th></th></tr>';

      productsData.products.forEach((p) => {
        html += '<tr data-product-id="' + p.id + '">' +
          '<td>' + esc(p.name) + '</td>' +
          '<td><input type="number" min="0" step="0.01" class="prod-price" value="' + (p.price ?? "") + '" style="width:90px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></td>' +
          '<td><input type="number" min="0" step="0.01" class="prod-sale-price" value="' + (p.sale_price ?? "") + '" style="width:90px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);" placeholder="none"></td>' +
          '<td><input type="number" min="0" step="1" class="prod-quantity" value="' + (p.quantity ?? "") + '" style="width:80px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></td>' +
          '<td><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="prod-visible" ' + (p.hidden ? "" : "checked") + '></label></td>' +
          '<td><select class="prod-add-category" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"><option value="">— pick —</option>' +
            categories.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join("") +
            '</select> <button class="prod-add-category-btn" style="padding:6px 10px;">Add</button></td>' +
          '<td><button class="prod-save-btn btn" style="padding:6px 14px;">Save</button> <span class="prod-msg" style="font-size:12px;"></span></td>' +
          "</tr>";
      });

      html += "</table></div>" +
        '<h3 style="font-size:12px;color:var(--muted);margin:16px 0 8px;">Add Product</h3>' +
        '<div class="detail-grid" style="margin-bottom:14px;">' +
        '<div><span>Name</span><input type="text" id="new-prod-name" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Slug (URL-friendly, English)</span><input type="text" id="new-prod-slug" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Price</span><input type="number" min="0" step="0.01" id="new-prod-price" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Thumbnail Image URL</span><input type="text" id="new-prod-thumb" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Starting Stock</span><input type="number" min="0" step="1" id="new-prod-quantity" value="0" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Track Stock</span><label style="display:flex;align-items:center;gap:8px;padding-top:6px;"><input type="checkbox" id="new-prod-track-stock" checked> Yes</label></div>' +
        "</div>" +
        '<button id="add-prod-btn" class="btn">Add Product</button> <span id="add-prod-msg" style="font-size:12px;"></span></div>';

      root.innerHTML = html;

      root.querySelectorAll(".prod-save-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest("tr");
          const productId = row.getAttribute("data-product-id");
          const msg = row.querySelector(".prod-msg");
          const salePriceRaw = row.querySelector(".prod-sale-price").value;

          const body = {
            price: row.querySelector(".prod-price").value,
            quantity: row.querySelector(".prod-quantity").value,
            hidden: !row.querySelector(".prod-visible").checked,
          };
          if (salePriceRaw !== "") body.sale_price = salePriceRaw;

          btn.disabled = true;
          msg.textContent = "Saving…";
          msg.style.color = "var(--muted)";

          fetch("/api/admin/products/" + productId, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
            .then((res) => res.json())
            .then((result) => {
              btn.disabled = false;
              if (result.success) {
                msg.textContent = "Saved.";
                msg.style.color = "#2e7d32";
              } else {
                msg.textContent = result.error || "Failed.";
                msg.style.color = "#c0392b";
              }
            })
            .catch(() => {
              btn.disabled = false;
              msg.textContent = "Failed.";
              msg.style.color = "#c0392b";
            });
        });
      });

      root.querySelectorAll(".prod-add-category-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest("tr");
          const productId = row.getAttribute("data-product-id");
          const select = row.querySelector(".prod-add-category");
          const categoryId = select.value;
          const msg = row.querySelector(".prod-msg");
          if (!categoryId) return;

          btn.disabled = true;
          msg.textContent = "Adding…";
          msg.style.color = "var(--muted)";

          // Fetch current categories first so we only ever add, never
          // accidentally wipe out categories already assigned.
          fetch("/api/admin/products/" + productId)
            .then((res) => res.json())
            .then((detail) => {
              if (!detail.success) throw new Error(detail.error || "Failed to load product");
              const existingIds = (detail.product.categories || []).map((c) => c.id);
              const newIds = existingIds.includes(categoryId) ? existingIds : [...existingIds, categoryId];

              return fetch("/api/admin/products/" + productId, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categories: newIds }),
              }).then((res) => res.json());
            })
            .then((result) => {
              btn.disabled = false;
              if (result.success) {
                msg.textContent = "Category added.";
                msg.style.color = "#2e7d32";
                select.value = "";
              } else {
                msg.textContent = result.error || "Failed.";
                msg.style.color = "#c0392b";
              }
            })
            .catch((err) => {
              btn.disabled = false;
              msg.textContent = err.message || "Failed.";
              msg.style.color = "#c0392b";
            });
        });
      });

      document.getElementById("add-prod-btn").addEventListener("click", () => {
        const msg = document.getElementById("add-prod-msg");
        const name = document.getElementById("new-prod-name").value.trim();
        const slug = document.getElementById("new-prod-slug").value.trim();
        const price = document.getElementById("new-prod-price").value;
        const thumb = document.getElementById("new-prod-thumb").value.trim();
        const quantity = document.getElementById("new-prod-quantity").value;
        const track_stock = document.getElementById("new-prod-track-stock").checked;

        if (!name || !slug || price === "") {
          msg.textContent = "Name, slug, and price are required.";
          msg.style.color = "#c0392b";
          return;
        }

        msg.textContent = "Adding…";
        msg.style.color = "var(--muted)";
        fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, slug, price, thumb, quantity, track_stock }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success) {
              renderProducts();
            } else {
              msg.textContent = result.error || "Failed to add product.";
              msg.style.color = "#c0392b";
            }
          })
          .catch(() => {
            msg.textContent = "Failed to add product.";
            msg.style.color = "#c0392b";
          });
      });
    })
    .catch(() => { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load products.</p></div>'; });
}

// ---------------- Categories (owner-only) ----------------

function renderCategories() {
  const root = document.getElementById("categories-root");
  if (currentUser.role !== "owner") { root.innerHTML = ""; return; }

  root.innerHTML = '<div class="section-card"><p class="empty">Loading categories…</p></div>';

  fetch("/api/admin/categories")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load categories.</p></div>'; return; }

      let html = '<div class="section-card"><h2>Categories</h2>' +
        '<div class="table-scroll"><table><tr><th>Name</th><th>Slug</th><th>Shown in Header</th></tr>';

      data.categories.forEach((c) => {
        html += "<tr><td>" + esc(c.name) + "</td><td>" + esc(c.slug) + "</td><td>" + (c.show_in_header ? "Yes" : "No") + "</td></tr>";
      });

      html += "</table></div>" +
        '<h3 style="font-size:12px;color:var(--muted);margin:16px 0 8px;">Add Category</h3>' +
        '<div class="detail-grid" style="margin-bottom:14px;">' +
        '<div><span>Name</span><input type="text" id="new-cat-name" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Slug (URL-friendly, English)</span><input type="text" id="new-cat-slug" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></div>' +
        '<div><span>Show in header nav</span><label style="display:flex;align-items:center;gap:8px;padding-top:6px;"><input type="checkbox" id="new-cat-show" checked> Yes</label></div>' +
        "</div>" +
        '<button id="add-cat-btn" class="btn">Add Category</button> <span id="add-cat-msg" style="font-size:12px;"></span></div>';

      root.innerHTML = html;

      document.getElementById("add-cat-btn").addEventListener("click", () => {
        const msg = document.getElementById("add-cat-msg");
        const name = document.getElementById("new-cat-name").value.trim();
        const slug = document.getElementById("new-cat-slug").value.trim();
        const show_in_header = document.getElementById("new-cat-show").checked;

        if (!name || !slug) {
          msg.textContent = "Name and slug are required.";
          msg.style.color = "#c0392b";
          return;
        }

        msg.textContent = "Adding…";
        msg.style.color = "var(--muted)";
        fetch("/api/admin/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, slug, show_in_header }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success) {
              renderCategories();
            } else {
              msg.textContent = result.error || "Failed to add category.";
              msg.style.color = "#c0392b";
            }
          })
          .catch(() => {
            msg.textContent = "Failed to add category.";
            msg.style.color = "#c0392b";
          });
      });
    })
    .catch(() => { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load categories.</p></div>'; });
}

// ---------------- Settings (owner-only) ----------------

function renderSettings() {
  const root = document.getElementById("settings-root");
  if (currentUser.role !== "owner") { root.innerHTML = ""; return; }

  fetch("/api/admin/settings")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { root.innerHTML = ""; return; }
      const s = data.settings;
      root.innerHTML = '<div class="section-card"><h2>Settings <span class="hint">— thresholds used by Needs Attention / Low Stock</span></h2>' +
        '<div class="detail-grid" style="margin-bottom:14px;">' +
        '<div><span>Stale Tracking (hours)</span><input type="number" id="set-staleHours" value="' + s.staleHours + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;"></div>' +
        '<div><span>Stuck Payment (hours)</span><input type="number" id="set-pendingStaleHours" value="' + s.pendingStaleHours + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;"></div>' +
        '<div><span>Silent Dispatch (hours)</span><input type="number" id="set-silentDispatchHours" value="' + s.silentDispatchHours + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;"></div>' +
        '<div><span>Low Stock Threshold</span><input type="number" id="set-lowStockThreshold" value="' + s.lowStockThreshold + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;"></div>' +
        "</div>" +
        '<h3 style="font-size:12px;color:var(--muted);margin:16px 0 8px;">Bosta API Key <span class="hint">— used to print AWBs; ' + (s.bostaApiKeySet ? "a key is currently set" : "no key set yet") + '</span></h3>' +
        '<div class="detail-grid" style="margin-bottom:14px;">' +
        '<div><span>New key (leave blank to keep current)</span><input type="password" id="set-bostaApiKey" placeholder="' + (s.bostaApiKeySet ? "•••••••••••••••• (unchanged)" : "paste Bosta API key") + '" autocomplete="off" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;"></div>' +
        "</div>" +
        '<button id="save-settings-btn" class="btn">Save Settings</button> <span id="settings-msg"></span></div>';

      document.getElementById("save-settings-btn").addEventListener("click", () => {
        const msg = document.getElementById("settings-msg");
        const body = {
          staleHours: document.getElementById("set-staleHours").value,
          pendingStaleHours: document.getElementById("set-pendingStaleHours").value,
          silentDispatchHours: document.getElementById("set-silentDispatchHours").value,
          lowStockThreshold: document.getElementById("set-lowStockThreshold").value,
          bostaApiKey: document.getElementById("set-bostaApiKey").value,
        };
        msg.textContent = "Saving…";
        fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success) {
              renderSettings();
              document.getElementById("settings-msg").textContent = "Saved.";
              document.getElementById("settings-msg").style.color = "#2e7d32";
              loadAll();
            } else {
              msg.textContent = result.error || "Failed to save.";
              msg.style.color = "#c0392b";
            }
          });
      });
    })
    .catch(() => { root.innerHTML = ""; });
}

// ---------------- Users management (owner-only) ----------------

// ---------------- Activity log (owner-only) ----------------

function describeActivity(entry) {
  const d = entry.details || {};
  switch (entry.action) {
    case "order_status_changed":
      return "changed order status to \"" + esc(d.status) + "\"";
    case "order_note_added":
      return "added a note: “" + esc((d.note || "").slice(0, 80)) + (d.note && d.note.length > 80 ? "…" : "") + "”";
    case "product_created":
      return "created product \"" + esc(d.name) + "\"";
    case "product_updated":
      return "updated product (" + esc((d.fields || []).join(", ")) + ")";
    case "category_created":
      return "created category \"" + esc(d.name) + "\"";
    default:
      return esc(entry.action);
  }
}

function renderActivity() {
  const root = document.getElementById("activity-root");
  if (currentUser.role !== "owner") { root.innerHTML = ""; return; }

  root.innerHTML = '<div class="section-card"><p class="empty">Loading…</p></div>';

  fetch("/api/admin/activity")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load activity.</p></div>'; return; }

      if (data.activity.length === 0) {
        root.innerHTML = '<div class="section-card"><h2>Team Activity</h2><p class="empty">Nothing logged yet.</p></div>';
        return;
      }

      const html = '<div class="section-card"><h2>Team Activity <span class="hint">— last ' + data.activity.length + ' actions across the team</span></h2>' +
        '<ul class="od-timeline" style="list-style:none;margin:0;padding:0;">' +
        data.activity.map((entry) =>
          '<li style="padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
          '<strong>' + esc(entry.username) + '</strong> ' + describeActivity(entry) +
          '<div style="color:var(--muted);font-size:11px;margin-top:2px;">' + new Date(entry.at).toLocaleString() + '</div>' +
          '</li>'
        ).join("") +
        "</ul></div>";

      root.innerHTML = html;
    })
    .catch(() => { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load activity.</p></div>'; });
}

function renderUsers() {
  const root = document.getElementById("users-root");
  if (currentUser.role !== "owner") { root.innerHTML = ""; return; }

  fetch("/api/admin/users")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { root.innerHTML = ""; return; }
      let html = '<div class="section-card"><h2>Moderators & Owners</h2>' +
        '<div class="table-scroll"><table><tr><th>Username</th><th>Role</th><th>Created</th><th></th></tr>';
      data.users.forEach((u) => {
        html += "<tr><td>" + esc(u.username) + "</td><td>" + esc(u.role) + "</td><td>" + new Date(Number(u.createdAt)).toLocaleDateString() + "</td>" +
          '<td>' + (u.username === currentUser.username ? "" : '<a class="action-link delete-user-link" href="#" data-username="' + esc(u.username) + '">Remove</a>') + "</td></tr>";
      });
      html += "</table></div>" +
        '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
        '<input type="text" id="new-user-username" placeholder="username" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;">' +
        '<input type="password" id="new-user-password" placeholder="password (6+ chars)" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;">' +
        '<select id="new-user-role" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;"><option value="moderator">Moderator</option><option value="owner">Owner</option></select>' +
        '<button id="create-user-btn" class="btn">Add User</button>' +
        '<span id="users-msg"></span></div></div>';
      root.innerHTML = html;

      document.querySelectorAll(".delete-user-link").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          if (!confirm('Remove user "' + a.getAttribute("data-username") + '"?')) return;
          fetch("/api/admin/users/" + encodeURIComponent(a.getAttribute("data-username")), { method: "DELETE" })
            .then((res) => res.json())
            .then((result) => {
              if (result.success) renderUsers();
              else alert(result.error || "Failed to remove user");
            });
        });
      });

      document.getElementById("create-user-btn").addEventListener("click", () => {
        const msg = document.getElementById("users-msg");
        const username = document.getElementById("new-user-username").value.trim();
        const password = document.getElementById("new-user-password").value;
        const role = document.getElementById("new-user-role").value;
        msg.textContent = "Adding…";
        fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, role }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success) renderUsers();
            else { msg.textContent = result.error || "Failed to add user"; msg.style.color = "#c0392b"; }
          });
      });
    })
    .catch(() => { root.innerHTML = ""; });
}

// ---------------- Tabs ----------------

function wireTabs() {
  const tabs = document.getElementById("dash-tabs");
  tabs.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");
      tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.style.display = panel.getAttribute("data-tab-panel") === target ? "" : "none";
      });
    });
  });
}

function wireSubTabs() {
  document.querySelectorAll(".sub-tabs").forEach((nav) => {
    const panelGroup = nav.parentElement;
    nav.querySelectorAll(".sub-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-sub-tab");
        nav.querySelectorAll(".sub-tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        panelGroup.querySelectorAll(".sub-tab-panel").forEach((panel) => {
          panel.classList.toggle("active", panel.getAttribute("data-sub-tab-panel") === target);
        });
      });
    });
  });
}

// ---------------- User menu ----------------

function renderUserMenu() {
  const el = document.getElementById("user-menu");
  el.innerHTML = '<span style="font-size:12px;color:var(--muted);">' + esc(currentUser.username) + " (" + esc(currentUser.role) + ')</span>' +
    '<button id="logout-btn" class="action-link" style="background:none;border:none;cursor:pointer;padding:0;">Log out</button>';
  document.getElementById("logout-btn").addEventListener("click", () => {
    fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/admin/login"; });
  });
}

// ---------------- Orchestration ----------------

function loadAttentionAndOverview() {
  return Promise.all([
    fetch("/api/admin/overview").then((res) => res.json()),
    fetch("/api/admin/needs-attention").then((res) => res.json()),
  ]).then(([overview, attention]) => {
    if (overview.success) {
      renderOverview(overview);
      renderGovernorates(overview.governorates);
      renderTopProductsAndLowStock(overview.top_products, overview.low_stock);
    }
    if (attention.success) renderNeedsAttention(attention.items);
  });
}

function loadAll() {
  return Promise.all([loadAttentionAndOverview(), loadOrders()]);
}

function init() {
  fetch("/api/admin/me")
    .then((res) => {
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return null;
      }
      return res.json();
    })
    .then((data) => {
      if (!data || !data.success) return;
      currentUser = { username: data.username, role: data.role };
      VALID_STATUSES = data.allowed_statuses;

      renderUserMenu();
      wireSearch();
      wireTabs();
      wireSubTabs();
      renderSettings();
      renderUsers();
      if (currentUser.role === "owner") {
        document.getElementById("homepage-builder-link").style.display = "inline-flex";
        document.getElementById("tab-btn-users").style.display = "";
        document.getElementById("tab-btn-products").style.display = "";
        document.getElementById("tab-btn-categories").style.display = "";
        document.getElementById("tab-btn-production").style.display = "";
        document.getElementById("tab-btn-activity").style.display = "";
        renderProducts();
        renderCategories();
        renderProductionCapacity();
        renderRawMaterials();
        renderRecipes();
        renderProductionRuns();
        renderSuppliers();
        renderPurchases();
        renderCashLedger();
        renderActivity();
      }
      renderBostaSummary();
      wirePickupsTabLazyLoad();

      return loadAll();
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("overview-root").innerHTML = '<div class="error">Failed to load dashboard.</div>';
    });
}

init();

setInterval(() => {
  if (!currentUser) return;
  loadAll();
  document.getElementById("refresh-note").textContent = "· Last refreshed " + new Date().toLocaleTimeString();
}, 30000);
