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
      let html = '<div class="section-card">' +
        '<div class="section-head"><h2>' + esc(data.full_name || "Customer") + " — " + esc(phone) + "</h2>" +
        '<a class="action-link" href="#" id="close-customer-panel">Close</a></div>' +
        "<p>" + data.order_count + " orders · Lifetime value: " + money(data.lifetime_value) + "</p>" +
        '<div class="table-scroll"><table><tr><th>Order #</th><th>Status</th><th>Total</th><th>Date</th></tr>';
      data.orders.forEach((o) => {
        html += "<tr><td>" + esc(o.short_id) + "</td><td>" + esc(o.status) + "</td><td>" + money(o.total_cost) + "</td><td>" + new Date(o.created_at).toLocaleDateString() + "</td></tr>";
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

  const chartHtml = data.revenue_trend
    ? '<div class="section-card"><h2>Revenue — Last 30 Days</h2>' +
      '<div class="chart-wrap">' + revenueChartSvg(data.revenue_trend) + "</div></div>"
    : "";

  root.innerHTML = statsHtml +
    '<div class="section-card" style="padding:14px 20px;">' + statusPills + "</div>" +
    chartHtml;
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
      "<td>" + callLink(it.phone) + customerLink(it.phone) + printLink(it.order_id) + awbLink(it.order_id, it.bosta_tracking_number) + "</td>" +
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

const BOSTA_SUMMARY_SCAN_LIMIT = 25;

function renderBostaSummary() {
  const root = document.getElementById("bosta-summary-root");
  root.innerHTML = '<div class="section-card">' +
    '<div class="section-head"><h2>Bosta Summary <span class="hint">— SLA compliance &amp; upcoming COD cashouts, scanned from your recent orders</span></h2>' +
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

function renderBostaSummaryResults(body, rows) {
  const ok = rows.filter((r) => r.result.success);
  const breached = ok.filter((r) => r.result.slaBreached);
  const upcomingCashouts = ok
    .filter((r) => r.result.nextCashoutDate)
    .map((r) => ({ order: r.order, date: r.result.nextCashoutDate }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let html = '<div class="stats-row" style="margin-bottom:16px;">' +
    '<div class="stat-card"><div class="num">' + ok.length + '</div><div class="label">Orders Scanned</div></div>' +
    '<div class="stat-card"><div class="num">' + breached.length + '</div><div class="label">SLA Breached</div></div>' +
    '<div class="stat-card"><div class="num">' + upcomingCashouts.length + '</div><div class="label">Upcoming Cashouts</div></div>' +
    "</div>";

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

  if (breached.length === 0 && upcomingCashouts.length === 0) {
    html += '<p class="empty">No SLA breaches and no upcoming cashouts among the scanned orders.</p>';
  }

  body.innerHTML = html;
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
      "<td>" + callLink(o.phone) + customerLink(o.phone) + printLink(o.order_id) + awbLink(o.order_id, o.bosta?.tracking_number) + "</td>" +
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

function renderProducts() {
  const root = document.getElementById("products-root");
  if (currentUser.role !== "owner") { root.innerHTML = ""; return; }

  root.innerHTML = '<div class="section-card"><p class="empty">Loading products…</p></div>';

  fetch("/api/admin/products")
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) { root.innerHTML = '<div class="section-card"><p class="empty">Failed to load products.</p></div>'; return; }

      let html = '<div class="section-card"><h2>Products <span class="hint">— edit price, sale price, and stock directly (writes to Easy Orders)</span></h2>' +
        '<div class="table-scroll"><table><tr><th>Product</th><th>Price</th><th>Sale Price</th><th>Stock</th><th></th></tr>';

      data.products.forEach((p) => {
        html += '<tr data-product-id="' + p.id + '">' +
          '<td>' + esc(p.name) + '</td>' +
          '<td><input type="number" min="0" step="0.01" class="prod-price" value="' + (p.price ?? "") + '" style="width:90px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></td>' +
          '<td><input type="number" min="0" step="0.01" class="prod-sale-price" value="' + (p.sale_price ?? "") + '" style="width:90px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);" placeholder="none"></td>' +
          '<td><input type="number" min="0" step="1" class="prod-quantity" value="' + (p.quantity ?? "") + '" style="width:80px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--ink);"></td>' +
          '<td><button class="prod-save-btn btn" style="padding:6px 14px;">Save</button> <span class="prod-msg" style="font-size:12px;"></span></td>' +
          "</tr>";
      });

      html += "</table></div></div>";
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
      renderSettings();
      renderUsers();
      if (currentUser.role === "owner") {
        document.getElementById("homepage-builder-link").style.display = "inline-flex";
        document.getElementById("tab-btn-users").style.display = "";
        document.getElementById("tab-btn-products").style.display = "";
        document.getElementById("tab-btn-categories").style.display = "";
        renderProducts();
        renderCategories();
      }
      renderBostaSummary();

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
