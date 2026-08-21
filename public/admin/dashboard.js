const money = (n) => (typeof n === "number" ? n.toLocaleString() + " EGP" : "—");
const pct = (n) => (typeof n === "number" ? Math.round(n * 100) + "%" : "—");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

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

  const statsHtml = '<div class="stats-row">' +
    '<div class="stat-card"><div class="num">' + money(s.revenue) + '</div><div class="label">Revenue</div></div>' +
    '<div class="stat-card"><div class="num">' + s.total_orders + '</div><div class="label">Orders</div></div>' +
    '<div class="stat-card"><div class="num">' + money(s.avg_order_value) + '</div><div class="label">Avg Order Value</div></div>' +
    '<div class="stat-card"><div class="num">' + pct(s.delivery_success_rate) + '</div><div class="label">Delivery Success Rate</div></div>' +
    '<div class="stat-card"><div class="num">' + money(s.cod_collected) + '</div><div class="label">COD Collected</div></div>' +
    '<div class="stat-card"><div class="num">' + money(s.cod_pending) + '</div><div class="label">COD Pending</div></div>' +
    '<div class="stat-card"><div class="num">' + s.repeat_customers + '</div><div class="label">Repeat Customers</div></div>' +
    "</div>";

  const statusPills = Object.entries(data.status_counts || {})
    .map(([status, count]) => '<span class="status-pill">' + esc(status) + ": " + count + "</span>")
    .join("");

  const chartHtml = '<div class="section-card"><h2>Revenue — Last 30 Days</h2>' +
    '<div class="chart-wrap">' + revenueChartSvg(data.revenue_trend) + "</div></div>";

  root.innerHTML = statsHtml +
    '<div class="section-card" style="padding:14px 20px;">' + statusPills + "</div>" +
    chartHtml;
}

function renderNeedsAttention(items) {
  const root = document.getElementById("attention-root");
  if (!items || items.length === 0) {
    root.innerHTML = '<div class="section-card"><h2>Needs Attention</h2><p class="empty">Nothing needs attention right now.</p></div>';
    return;
  }
  let html = '<div class="section-card"><h2>Needs Attention (' + items.length + ")</h2>" +
    '<div class="table-scroll"><table><tr><th>Order #</th><th>Reasons</th><th>Customer</th><th>EasyOrders Status</th><th>Bosta State</th><th>Total</th><th>Actions</th></tr>';
  items.forEach((it) => {
    const reasons = it.reasons.map((r) => '<span class="reason-tag ' + r + '">' + REASON_LABELS[r] + "</span>").join("");
    html += '<tr class="attention">' +
      "<td>" + esc(it.short_id) + "</td>" +
      "<td>" + reasons + "</td>" +
      "<td>" + esc(it.full_name) + "<br>" + esc(it.phone) + "</td>" +
      "<td>" + esc(it.easyorders_status) + "</td>" +
      "<td>" + esc(it.bosta_state_name || "—") + "</td>" +
      "<td>" + money(it.total_cost) + "</td>" +
      "<td>" + callLink(it.phone) + customerLink(it.phone) + printLink(it.order_id) + "</td>" +
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
  let sorted = governorates.slice().sort((a, b) => b.revenue - a.revenue);
  let worstFirst = false;

  function draw() {
    let html = '<div class="section-card"><div class="section-head"><h2>Delivery Performance by Governorate</h2>' +
      '<label style="font-size:12px;color:var(--muted);cursor:pointer;"><input type="checkbox" id="gov-worst-toggle" ' + (worstFirst ? "checked" : "") + '> Worst success rate first</label></div>' +
      '<div class="table-scroll"><table><tr><th>Governorate</th><th>Orders</th><th>Revenue</th><th>Success Rate</th><th>Avg Time to Delivered</th><th>Avg Shipping Charged</th></tr>';
    const rows = worstFirst
      ? sorted.slice().sort((a, b) => (a.success_rate ?? 1) - (b.success_rate ?? 1))
      : sorted;
    rows.forEach((g) => {
      html += "<tr><td>" + esc(g.name) + "</td><td>" + g.order_count + "</td><td>" + money(g.revenue) + "</td><td>" + pct(g.success_rate) + "</td><td>" +
        (g.avg_delivery_hours != null ? Math.round(g.avg_delivery_hours) + "h (n=" + g.avg_delivery_sample_size + ")" : "—") +
        "</td><td>" + (g.avg_shipping_cost != null ? money(g.avg_shipping_cost) : "—") + "</td></tr>";
    });
    html += "</table></div>" +
      '<p class="chart-caption">"Avg Time to Delivered" measures order creation to Bosta\'s delivered signal, not guaranteed physical delivery time. "Avg Shipping Charged" is what customers paid for shipping on Easy Orders, not Bosta\'s actual cost to us (that data isn\'t available) — it shows where shipping fees are heaviest, not profit margin.</p></div>';
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
    lowStockHtml = '<div class="section-card"><h2>Low Stock (' + lowStock.length + ")</h2>" +
      '<div class="table-scroll"><table><tr><th>Product</th><th>Quantity Left</th></tr>';
    lowStock.forEach((p) => { lowStockHtml += '<tr class="attention"><td>' + esc(p.name) + "</td><td>" + p.quantity + "</td></tr>"; });
    lowStockHtml += "</table></div></div>";
  }

  root.innerHTML = '<div class="two-col">' + topHtml + (lowStockHtml || '<div class="section-card"><h2>Low Stock</h2><p class="empty">No low-stock items right now.</p></div>') + "</div>";
}

// ---------------- Orders table (paginated, unified EO + Bosta) ----------------

const ordersState = { page: 1, pageSize: 25, status: "", expandedOrderId: null, selectedOrderIds: new Set(), statuses: [] };

function statusBadge(status, bosta) {
  let cls = "neutral";
  if (status === "delivered") cls = "ok";
  else if (["canceled", "refunded"].includes(status)) cls = "attn";
  else if (bosta && bosta.needs_attention) cls = "attn";
  return '<span class="badge ' + cls + '">' + esc(status) + "</span>";
}

const VALID_STATUSES = [
  "pending", "confirmed", "pending_payment", "paid", "paid_failed",
  "processing", "waiting_for_pickup", "in_delivery", "delivered",
  "canceled", "returning_from_delivery", "request_refund",
  "refund_in_progress", "refunded",
];

function loadOrders() {
  const params = new URLSearchParams({ page: ordersState.page, page_size: ordersState.pageSize });
  if (ordersState.status) params.set("status", ordersState.status);

  return fetch("/api/admin/orders?" + params.toString())
    .then((res) => res.json())
    .then((data) => {
      if (data.success) renderOrders(data);
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

function renderOrders(data) {
  const root = document.getElementById("orders-root");
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  let html = '<div class="section-card">' +
    '<div class="section-head"><h2>Orders (' + data.total + ')</h2>' +
    '<div class="controls-row" style="margin-bottom:0;">' +
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
      '<span id="bulk-msg"></span></div>';
  }

  if (data.orders.length === 0) {
    html += '<p class="empty">No orders match this filter.</p></div>';
    root.innerHTML = html;
    wireOrdersControls(data);
    return;
  }

  html += '<div class="table-scroll"><table>' +
    '<tr><th><input type="checkbox" id="select-all-checkbox"></th><th>Order #</th><th>EasyOrders Status</th><th>Bosta State</th><th>Customer</th><th>Governorate</th><th>Total</th><th>Actions</th></tr>';

  data.orders.forEach((o) => {
    const isExpanded = ordersState.expandedOrderId === o.order_id;
    html += '<tr class="order-row" data-order-id="' + o.order_id + '">' +
      '<td><input type="checkbox" class="row-checkbox" data-order-id="' + o.order_id + '" ' + (ordersState.selectedOrderIds.has(o.order_id) ? "checked" : "") + "></td>" +
      "<td>" + esc(o.short_id) + "</td>" +
      "<td>" + statusBadge(o.status, o.bosta) + "</td>" +
      "<td>" + (o.bosta ? esc(o.bosta.state_name) + " (" + o.bosta.hours_since_update + "h ago)" : "—") + "</td>" +
      "<td>" + esc(o.full_name) + "<br>" + esc(o.phone) + "</td>" +
      "<td>" + esc(o.government) + "</td>" +
      "<td>" + money(o.total_cost) + "</td>" +
      "<td>" + callLink(o.phone) + customerLink(o.phone) + printLink(o.order_id) + "</td>" +
      "</tr>";

    if (isExpanded) {
      const items = (o.cart_items || []).map((it) => (it.product ? it.product.name : "Item") + " × " + it.quantity).join(", ") || "—";
      const timeline = (o.bosta_timeline || []).length === 0
        ? '<p class="empty" style="padding:8px 0;">No Bosta tracking events yet.</p>'
        : '<ul style="margin:0;padding-left:18px;font-size:12px;color:var(--ink);">' +
          o.bosta_timeline.map((e) => "<li>" + esc(e.state_name) + " — " + new Date(e.timestamp).toLocaleString() + "</li>").join("") +
          "</ul>";
      html += '<tr class="detail-row"><td colspan="8"><div class="detail-grid">' +
        "<div><span>Address</span>" + esc(o.address || "—") + "</div>" +
        "<div><span>Payment</span>" + esc(o.payment_method || "—") + "</div>" +
        "<div><span>Shipping Cost</span>" + money(o.shipping_cost) + "</div>" +
        "<div><span>Orders From This Phone</span>" + o.orders_count + "</div>" +
        "<div><span>Items</span>" + esc(items) + "</div>" +
        "</div>" +
        '<div style="margin-bottom:12px;"><span style="display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Delivery Timeline</span>' + timeline + "</div>" +
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

function wireOrdersControls(data) {
  document.getElementById("status-filter").addEventListener("change", (e) => {
    ordersState.status = e.target.value;
    ordersState.page = 1;
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

wireSearch();
loadAll().catch((err) => {
  console.error(err);
  document.getElementById("overview-root").innerHTML = '<div class="error">Failed to load dashboard.</div>';
});

setInterval(() => {
  loadAll();
  document.getElementById("refresh-note").textContent = "· Last refreshed " + new Date().toLocaleTimeString();
}, 30000);
