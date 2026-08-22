const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

// ---------------- Section definitions ----------------
// Each field: { key, label, type: "text"|"textarea"|"product", wide? }

const SECTIONS = [
  {
    id: "hero",
    label: "Hero",
    hint: "The full-screen opening banner.",
    fields: [
      { key: "hero.kicker", label: "Kicker", type: "text" },
      { key: "hero.titleLine1", label: "Title line 1", type: "text" },
      { key: "hero.titleLine2Italic", label: "Title line 2 (italic)", type: "text" },
      { key: "hero.titleLine3", label: "Title line 3", type: "text" },
      { key: "hero.description", label: "Description", type: "textarea", wide: true },
      { key: "hero.buttonText", label: "Button text", type: "text" },
      { key: "hero.buttonLink", label: "Button link", type: "text" },
    ],
  },
  {
    id: "announcementBar",
    label: "Announcement Bar",
    hint: "The 3 rotating messages in the scrolling strip at the top of the page.",
    fields: [
      { key: "announcementBar.item1.text", label: "Message 1", type: "text", wide: true },
      { key: "announcementBar.item2.text", label: "Message 2 text", type: "text" },
      { key: "announcementBar.item2.code", label: "Message 2 code", type: "text" },
      { key: "announcementBar.item3.text", label: "Message 3 text", type: "text" },
      { key: "announcementBar.item3.code", label: "Message 3 code", type: "text" },
    ],
  },
  {
    id: "bestSellers",
    label: "Best Sellers",
    hint: "The two-product Best Sellers grid.",
    fields: [
      { key: "bestSellers.eyebrow", label: "Eyebrow", type: "text" },
      { key: "bestSellers.title", label: "Title", type: "text" },
      { key: "bestSellers.productSlugs.0", label: "Product 1", type: "product" },
      { key: "bestSellers.productSlugs.1", label: "Product 2", type: "product" },
    ],
  },
  {
    id: "collections",
    label: "Collections",
    hint: "The For Her / For Him / Unisex grid.",
    fields: [
      { key: "collections.kicker", label: "Kicker", type: "text" },
      { key: "collections.title", label: "Title (HTML allowed, e.g. <em>)", type: "text", wide: true },
      { key: "collections.subtitle", label: "Subtitle", type: "textarea", wide: true },
      { key: "collections.her.label", label: "For Her — label", type: "text" },
      { key: "collections.her.productSlug", label: "For Her — product image", type: "product" },
      { key: "collections.him.label", label: "For Him — label", type: "text" },
      { key: "collections.him.productSlug", label: "For Him — product image", type: "product" },
      { key: "collections.unisex.label", label: "Unisex — label", type: "text" },
      { key: "collections.unisex.productSlug", label: "Unisex — product image", type: "product" },
    ],
  },
  {
    id: "brand",
    label: "Why Lana's Beauty",
    hint: "The editorial brand-statement section.",
    fields: [
      { key: "brand.kicker", label: "Kicker (left)", type: "text" },
      { key: "brand.small", label: "Small label (right)", type: "text" },
      { key: "brand.titleLine1", label: "Statement line 1", type: "text" },
      { key: "brand.titleLine2Em", label: "Statement line 2 (italic)", type: "text" },
      { key: "brand.description", label: "Description", type: "textarea", wide: true },
      { key: "brand.value1Title", label: "Value 1 — title", type: "text" },
      { key: "brand.value1Text", label: "Value 1 — text", type: "textarea" },
      { key: "brand.value2Title", label: "Value 2 — title", type: "text" },
      { key: "brand.value2Text", label: "Value 2 — text", type: "textarea" },
      { key: "brand.value3Title", label: "Value 3 — title", type: "text" },
      { key: "brand.value3Text", label: "Value 3 — text", type: "textarea" },
      { key: "brand.bottomText", label: "Bottom tagline", type: "text" },
    ],
  },
  {
    id: "box1",
    label: "Offer Box 1",
    hint: "The left offer card.",
    fields: [
      { key: "offers.box1.eyebrow", label: "Eyebrow", type: "text" },
      { key: "offers.box1.titleLine1", label: "Title line 1", type: "text" },
      { key: "offers.box1.titleLine2Italic", label: "Title line 2 (italic)", type: "text" },
      { key: "offers.box1.note", label: "Note", type: "textarea", wide: true },
      { key: "offers.box1.code", label: "Discount code", type: "text" },
      { key: "offers.box1.buttonText", label: "Button text", type: "text" },
      { key: "offers.box1.buttonLink", label: "Button link", type: "text" },
    ],
  },
  {
    id: "box2",
    label: "Offer Box 2",
    hint: "The right offer card.",
    fields: [
      { key: "offers.box2.eyebrow", label: "Eyebrow", type: "text" },
      { key: "offers.box2.titleLine1", label: "Title line 1", type: "text" },
      { key: "offers.box2.titleLine2Italic", label: "Title line 2 (italic)", type: "text" },
      { key: "offers.box2.note", label: "Note", type: "textarea", wide: true },
      { key: "offers.box2.code", label: "Discount code", type: "text" },
      { key: "offers.box2.buttonText", label: "Button text", type: "text" },
      { key: "offers.box2.buttonLink", label: "Button link", type: "text" },
    ],
  },
  {
    id: "paymentMethods",
    label: "Payment Methods",
    hint: "Shown in the footer strip and on every product page. Show/hide, reorder, add, or remove badges.",
    custom: true,
  },
];

let content = null;
let products = [];
let activeSectionId = SECTIONS[0].id;

function fieldHtml(field) {
  const value = getPath(content, field.key);
  const id = "hbf-" + field.key.replace(/\./g, "-");
  const wideCls = field.wide ? " wide" : "";

  if (field.type === "textarea") {
    return '<div class="hb-field' + wideCls + '"><label for="' + id + '">' + esc(field.label) + '</label>' +
      '<textarea id="' + id + '" data-key="' + field.key + '">' + esc(value || "") + "</textarea></div>";
  }

  if (field.type === "product") {
    let opts = '<option value="">— none —</option>';
    products.forEach((p) => {
      opts += '<option value="' + esc(p.slug) + '" ' + (p.slug === value ? "selected" : "") + ">" + esc(p.name) + "</option>";
    });
    return '<div class="hb-field' + wideCls + '"><label for="' + id + '">' + esc(field.label) + '</label>' +
      '<select id="' + id + '" data-key="' + field.key + '">' + opts + "</select></div>";
  }

  return '<div class="hb-field' + wideCls + '"><label for="' + id + '">' + esc(field.label) + '</label>' +
    '<input type="text" id="' + id + '" data-key="' + field.key + '" value="' + esc(value || "") + '"></div>';
}

function renderSidebar() {
  const nav = document.getElementById("hb-sidebar");
  nav.innerHTML = SECTIONS.map((s) =>
    '<div class="hb-nav-item' + (s.id === activeSectionId ? " active" : "") + '" data-section="' + s.id + '">' +
    '<span class="hb-nav-dot"></span>' + esc(s.label) + "</div>"
  ).join("");

  nav.querySelectorAll(".hb-nav-item").forEach((el) => {
    el.addEventListener("click", () => {
      activeSectionId = el.getAttribute("data-section");
      renderSidebar();
      renderPanel();
    });
  });
}

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
}

function paymentRowHtml(item, i, total) {
  const isSpecial = item.kind === "installments" || item.kind === "cod";
  return '<div class="hb-pm-row" data-index="' + i + '">' +
    '<label class="hb-pm-enabled"><input type="checkbox" class="hb-pm-toggle" ' + (item.enabled ? "checked" : "") + '></label>' +
    '<div class="hb-pm-fields">' +
      '<input type="text" class="hb-pm-label" placeholder="Label" value="' + esc(item.label || "") + '">' +
      (isSpecial
        ? '<span class="hb-pm-kind-tag">' + esc(item.kind) + "</span>"
        : '<input type="text" class="hb-pm-image" placeholder="Logo image URL" value="' + esc(item.imageUrl || "") + '">') +
    "</div>" +
    '<div class="hb-pm-actions">' +
      '<button type="button" class="hb-pm-up" ' + (i === 0 ? "disabled" : "") + ' title="Move up">&uarr;</button>' +
      '<button type="button" class="hb-pm-down" ' + (i === total - 1 ? "disabled" : "") + ' title="Move down">&darr;</button>' +
      '<button type="button" class="hb-pm-delete" title="Remove">&times;</button>' +
    "</div>" +
  "</div>";
}

function renderPaymentMethodsPanel(panel) {
  if (!content.paymentMethods) content.paymentMethods = { items: [] };
  const items = content.paymentMethods.items;

  panel.innerHTML =
    '<h2 class="hb-section-title">Payment Methods</h2>' +
    '<p class="hb-section-hint">Shown in the footer strip and on every product page. Show/hide, reorder, add, or remove badges.</p>' +
    '<div class="hb-pm-list">' + items.map((item, i) => paymentRowHtml(item, i, items.length)).join("") + "</div>" +
    '<button type="button" id="hb-pm-add" class="btn" style="margin-top:14px;background:var(--card);border:1px solid var(--accent);color:var(--accent);">+ Add Payment Method</button>';

  panel.querySelectorAll(".hb-pm-row").forEach((row) => {
    const i = Number(row.getAttribute("data-index"));

    row.querySelector(".hb-pm-toggle").addEventListener("change", (e) => {
      items[i].enabled = e.target.checked;
    });
    row.querySelector(".hb-pm-label").addEventListener("input", (e) => {
      items[i].label = e.target.value;
    });
    const imageInput = row.querySelector(".hb-pm-image");
    if (imageInput) {
      imageInput.addEventListener("input", (e) => {
        items[i].imageUrl = e.target.value;
      });
    }
    row.querySelector(".hb-pm-up").addEventListener("click", () => {
      if (i === 0) return;
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
      renderPaymentMethodsPanel(panel);
    });
    row.querySelector(".hb-pm-down").addEventListener("click", () => {
      if (i === items.length - 1) return;
      [items[i + 1], items[i]] = [items[i], items[i + 1]];
      renderPaymentMethodsPanel(panel);
    });
    row.querySelector(".hb-pm-delete").addEventListener("click", () => {
      items.splice(i, 1);
      renderPaymentMethodsPanel(panel);
    });
  });

  panel.querySelector("#hb-pm-add").addEventListener("click", () => {
    items.push({ id: slugify("method-" + Date.now()), kind: "logo", enabled: true, label: "New Method", imageUrl: "" });
    renderPaymentMethodsPanel(panel);
  });
}

function renderPanel() {
  const panel = document.getElementById("hb-panel");
  const section = SECTIONS.find((s) => s.id === activeSectionId);

  if (section.custom === true && section.id === "paymentMethods") {
    renderPaymentMethodsPanel(panel);
    return;
  }

  panel.innerHTML =
    '<h2 class="hb-section-title">' + esc(section.label) + "</h2>" +
    '<p class="hb-section-hint">' + esc(section.hint) + "</p>" +
    '<div class="hb-fields">' + section.fields.map(fieldHtml).join("") + "</div>";

  panel.querySelectorAll("[data-key]").forEach((el) => {
    el.addEventListener("input", () => {
      setPath(content, el.getAttribute("data-key"), el.value);
    });
    el.addEventListener("change", () => {
      setPath(content, el.getAttribute("data-key"), el.value);
    });
  });
}

function save() {
  const msg = document.getElementById("hb-msg");
  const btn = document.getElementById("hb-save-btn");
  btn.disabled = true;
  msg.textContent = "Saving…";
  msg.className = "hb-msg";

  fetch("/api/admin/homepage-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
    .then((res) => res.json())
    .then((result) => {
      btn.disabled = false;
      if (result.success) {
        content = result.content;
        renderPanel();
        msg.textContent = "Saved.";
        msg.className = "hb-msg ok";
      } else {
        msg.textContent = result.error || "Failed to save.";
        msg.className = "hb-msg err";
      }
    })
    .catch(() => {
      btn.disabled = false;
      msg.textContent = "Failed to save.";
      msg.className = "hb-msg err";
    });
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
    .then((me) => {
      if (!me || !me.success) return;
      if (me.role !== "owner") {
        document.getElementById("hb-panel").innerHTML = '<p class="empty">Only owners can edit homepage content.</p>';
        return;
      }

      return Promise.all([
        fetch("/api/admin/homepage-content", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/products?limit=200", { cache: "no-store" }).then((r) => r.json()),
      ]).then(([contentData, productsData]) => {
        if (!contentData.success) {
          document.getElementById("hb-panel").innerHTML = '<p class="empty">Failed to load homepage content.</p>';
          return;
        }
        content = contentData.content;
        products = (productsData.data || productsData || []).map((p) => ({ slug: p.slug, name: p.name }));
        renderSidebar();
        renderPanel();
        document.getElementById("hb-save-btn").addEventListener("click", save);
      });
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("hb-panel").innerHTML = '<div class="error">Failed to load.</div>';
    });
}

init();
