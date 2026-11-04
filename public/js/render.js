import { money, escapeHTML, createdLabel } from "./format.js";

let currentCategories = [];
let currentEntries = [];
let categoryFilterId = null;
let hoveredCategoryId = null;

const KIND = {
  expense: { label: "Expense", symbol: "↗", className: "expense" },
  income: { label: "Income", symbol: "↓", className: "income" },
  savings: { label: "Savings", symbol: "✳", className: "savings" },
};

export function renderDashboard(data) {
  hoveredCategoryId = null;
  currentCategories = data.categories || [];
  currentEntries = data.entries || [];
  if (categoryFilterId && !currentCategories.some((category) => category.id === categoryFilterId && Number(category.total) > 0)) {
    categoryFilterId = null;
  }
  const expense = Number(data.expenses || 0);
  const income = Number(data.income || 0);
  const savings = Number(data.savings || 0);
  document.querySelector("#cash-flow").textContent = money(income - expense - savings);
  document.querySelector("#income-total").textContent = money(income);
  document.querySelector("#expense-total").textContent = money(expense);
  document.querySelector("#savings-total").textContent = money(savings);
  const target = Number(data.monthly_savings_target || 0);
  const percent = target > 0 ? Math.min(100, Math.max(0, savings / target * 100)) : 0;
  document.querySelector("#savings-progress-fill").style.width = `${percent}%`;
  document.querySelector("#savings-progress-label").textContent = target ? `${money(savings)} of ${money(target)} goal` : "Set a monthly target";

  renderCategories(currentCategories);
  renderBudget(data);
  renderEntries(currentEntries);
}

function renderCategories(categories) {
  currentCategories = categories;
  const positive = categories.filter((c) => Number(c.total) > 0);
  const total = positive.reduce((sum, c) => sum + Number(c.total), 0);
  const donut = document.querySelector("#spending-donut");
  drawDonutSegments(positive, total);
  donut.classList.toggle("has-selection", Boolean(categoryFilterId));
  const legend = document.querySelector("#category-legend");
  legend.innerHTML = positive.length ? positive.map((c) => `<button type="button" class="legend-row${categoryFilterId === c.id ? " selected" : ""}" data-category-id="${c.id}" aria-pressed="${categoryFilterId === c.id}" title="Show ${escapeHTML(c.name)} activity"><i class="legend-dot" style="background:${escapeHTML(c.color)}"></i><span class="legend-name">${escapeHTML(c.name)}</span><strong class="legend-value">${money(c.total, true)}</strong></button>`).join("") : `<div class="legend-empty">Your category breakdown will show here.</div>`;
  const selected = categories.find((category) => category.id === categoryFilterId);
  document.querySelector("#chart-note-text").textContent = selected ? `Activity filtered to ${selected.name}` : "Category breakdown · choose a category to filter activity";
  document.querySelector("#clear-category-filter").classList.toggle("hidden", !selected);
  renderDonutCenter(total, positive);
  document.querySelector("#category-manage-list").innerHTML = categories.map((c) => `<div class="manage-row"><i class="manage-dot" style="background:${escapeHTML(c.color)}"></i><span>${escapeHTML(c.name)}</span>${c.active ? `<button data-category-active="false" data-category-id="${c.id}" title="${c.has_history ? "Move to History" : "Delete category"}" aria-label="${c.has_history ? "Move to History" : "Delete"} ${escapeHTML(c.name)}">&#215;</button>` : `<span class="archived-label">History</span><button data-category-active="true" data-category-id="${c.id}" title="Restore category" aria-label="Restore ${escapeHTML(c.name)}">&#8634;</button>`}</div>`).join("") || `<span class="legend-empty">Create your first category.</span>`;
}

function pointAt(cx, cy, radius, angle, verticalScale = 0.7, depth = 0) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius * verticalScale + depth,
  };
}

function annularPath(start, end) {
  const outerStart = pointAt(150, 96, 96, start, 0.7);
  const outerEnd = pointAt(150, 96, 96, end, 0.7);
  const innerEnd = pointAt(150, 96, 43, end, 0.7);
  const innerStart = pointAt(150, 96, 43, start, 0.7);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A 96 67.2 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A 43 30.1 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)} Z`,
  ].join(" ");
}

function visibleSidePath(start, end, radius, depth) {
  const fragments = [];
  for (let turn = -1; turn <= 1; turn += 1) {
    const frontStart = turn * Math.PI * 2;
    const frontEnd = frontStart + Math.PI;
    const a = Math.max(start, frontStart);
    const b = Math.min(end, frontEnd);
    if (b - a < 0.005) continue;
    const topA = pointAt(150, 96, radius, a, 0.7);
    const topB = pointAt(150, 96, radius, b, 0.7);
    const bottomA = pointAt(150, 96, radius, a, 0.7, depth);
    const bottomB = pointAt(150, 96, radius, b, 0.7, depth);
    const ry = radius * 0.7;
    const largeArc = b - a > Math.PI ? 1 : 0;
    fragments.push([
      `M ${topA.x.toFixed(2)} ${topA.y.toFixed(2)} L ${bottomA.x.toFixed(2)} ${bottomA.y.toFixed(2)}`,
      `A ${radius} ${ry} 0 ${largeArc} 1 ${bottomB.x.toFixed(2)} ${bottomB.y.toFixed(2)}`,
      `L ${topB.x.toFixed(2)} ${topB.y.toFixed(2)}`,
      `A ${radius} ${ry} 0 ${largeArc} 0 ${topA.x.toFixed(2)} ${topA.y.toFixed(2)} Z`,
    ].join(" "));
  }
  return fragments.join(" ");
}

function darken(hex, factor) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
  if (!match) return "#554b77";
  return `#${match.slice(1).map((part) => Math.round(parseInt(part, 16) * factor).toString(16).padStart(2, "0")).join("")}`;
}

function drawDonutSegments(categories, total) {
  const sides = document.querySelector("#donut-sides");
  const segments = document.querySelector("#donut-segments");
  const labels = document.querySelector("#donut-labels");
  if (!categories.length || !total) {
    sides.innerHTML = "";
    segments.innerHTML = "";
    labels.innerHTML = "";
    return;
  }

  let cursor = -Math.PI / 2;
  const sidePaths = [];
  const topPaths = [];
  const percentLabels = [];
  categories.forEach((category) => {
    const sweep = Number(category.total) / total * Math.PI * 2;
    const gap = Math.min(0.045, sweep * 0.15);
    const start = cursor + gap / 2;
    const end = cursor + sweep - gap / 2;
    const mutedClass = categoryFilterId && category.id !== categoryFilterId ? " muted" : "";
    const fill = escapeHTML(category.color || "#9b8cff");
    const sideAttrs = `data-category-id="${category.id}" style="fill:${darken(category.color, 0.64)}"`;
    const outerSide = visibleSidePath(start, end, 96, 22);
    const innerSide = visibleSidePath(start, end, 43, 22);
    if (outerSide) sidePaths.push(`<path class="donut-side${mutedClass}" d="${outerSide}" ${sideAttrs}></path>`);
    if (innerSide) sidePaths.push(`<path class="donut-inner-side${mutedClass}" d="${innerSide}" style="fill:${darken(category.color, 0.48)}" data-category-id="${category.id}"></path>`);
    topPaths.push(`<path class="donut-segment${mutedClass}" d="${annularPath(start, end)}" fill="${fill}" data-category-id="${category.id}" tabindex="0" role="button" aria-pressed="${categoryFilterId === category.id}" aria-label="${escapeHTML(category.name)}: ${money(category.total)} (${Math.round(Number(category.total) / total * 100)} percent)"></path>`);

    const share = Number(category.total) / total;
    if (share >= 0.07) {
      const middle = (start + end) / 2;
      const labelPoint = pointAt(150, 96, 69.5, middle, 0.7);
      percentLabels.push(`<text class="donut-percent-label" x="${labelPoint.x.toFixed(2)}" y="${labelPoint.y.toFixed(2)}">${Math.round(share * 100)}%</text>`);
    }
    cursor += sweep;
  });
  sides.innerHTML = sidePaths.join("");
  segments.innerHTML = topPaths.join("");
  labels.innerHTML = percentLabels.join("");
}

function renderDonutCenter(total, positive = currentCategories.filter((category) => Number(category.total) > 0)) {
  const category = positive.find((item) => item.id === (hoveredCategoryId || categoryFilterId));
  if (!category) {
    document.querySelector("#donut-total").textContent = money(total, true);
    document.querySelector("#donut-caption").textContent = "net spending";
    return;
  }
  const share = total ? Math.round(Number(category.total) / total * 100) : 0;
  document.querySelector("#donut-total").textContent = money(category.total, true);
  document.querySelector("#donut-caption").textContent = `${category.name} · ${share}%`;
}

export function previewDonutCategory(categoryId) {
  hoveredCategoryId = categoryId;
  const positive = currentCategories.filter((category) => Number(category.total) > 0);
  const total = positive.reduce((sum, category) => sum + Number(category.total), 0);
  renderDonutCenter(total, positive);
}

export function toggleCategoryFilter(categoryId) {
  categoryFilterId = categoryFilterId === categoryId ? null : categoryId;
  hoveredCategoryId = null;
  renderCategories(currentCategories);
  renderEntries(currentEntries);
}

export function clearCategoryFilter() {
  if (!categoryFilterId) return;
  categoryFilterId = null;
  hoveredCategoryId = null;
  renderCategories(currentCategories);
  renderEntries(currentEntries);
}

function renderBudget(data) {
  const list = document.querySelector("#budget-list");
  const budget = Number(data.monthly_budget || 0);
  const spent = Number(data.expenses || 0);
  if (!budget) {
    list.innerHTML = `<div class="budget-empty">No monthly budget set. Add one limit to track your overall spending this month.</div>`;
    return;
  }
  const actual = Math.max(0, spent);
  const percent = Math.min(100, actual / budget * 100);
  const color = actual > budget ? "#ff8f9f" : "#9f8aff";
  const remaining = budget - actual;
  const status = remaining >= 0 ? `${money(remaining)} remaining` : `${money(Math.abs(remaining))} over budget`;
  list.innerHTML = `<div class="budget-row"><div class="budget-row-top"><span class="budget-name"><i style="background:${color}"></i>All categories</span><span class="budget-amount"><strong>${money(actual)}</strong> spent of ${money(budget)} · ${status}</span></div><div class="budget-track"><span style="width:${percent}%;--bar-color:${color}"></span></div></div>`;
}

function renderEntries(entries) {
  const list = document.querySelector("#entry-list");
  const empty = document.querySelector("#entry-empty");
  const visibleEntries = categoryFilterId ? entries.filter((entry) => entry.kind === "expense" && entry.category_id === categoryFilterId) : entries;
  empty.classList.toggle("hidden", visibleEntries.length > 0);
  document.querySelector("#entry-empty-title").textContent = categoryFilterId ? "No entries in this category" : "No entries yet";
  document.querySelector("#entry-empty-copy").textContent = categoryFilterId ? "Try another category or clear the filter." : "Add your first income, expense, or savings entry.";
  list.innerHTML = visibleEntries.map((entry) => {
    const kind = KIND[entry.kind];
    const amountClass = entry.kind === "expense" && entry.amount_paise < 0 ? " negative" : "";
    const amountPrefix = entry.kind === "expense" ? (entry.amount_paise < 0 ? "−" : "") : "+";
    const title = entry.note?.trim() || (entry.kind === "expense" ? "Expense entry" : `${kind.label} entry`);
    const category = entry.category_name ? `<span class="entry-category"><i style="background:${escapeHTML(entry.category_color || "#9b8cff")}"></i>${escapeHTML(entry.category_name)}</span>` : "—";
    return `<tr><td><div class="entry-main"><span class="entry-symbol symbol-${kind.className}">${kind.symbol}</span><div><div class="entry-name">${escapeHTML(title)}</div><div class="entry-date">${createdLabel(entry.created_at)}</div></div></div></td><td><span class="type-pill type-${kind.className}">${kind.label}</span></td><td>${category}</td><td class="entry-amount${amountClass}">${amountPrefix}${money(Math.abs(entry.amount_paise))}</td><td><div class="row-actions"><button class="row-action" data-edit-entry="${entry.id}" title="Edit entry">✎</button><button class="row-action" data-delete-entry="${entry.id}" title="Delete entry">×</button></div></td></tr>`;
  }).join("");
}

export function updateSelects(categories, activeCategoryId = null) {
  const active = categories.filter((c) => c.active);
  const options = active.map((c) => `<option value="${c.id}" ${String(c.id) === String(activeCategoryId) ? "selected" : ""}>${escapeHTML(c.name)}</option>`).join("");
  document.querySelector("#entry-category").innerHTML = options || `<option value="">Create a category first</option>`;
}
