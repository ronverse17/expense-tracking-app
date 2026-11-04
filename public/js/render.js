import { money, escapeHTML, createdLabel } from "./format.js";

const KIND = {
  expense: { label: "Expense", symbol: "↗", className: "expense" },
  income: { label: "Income", symbol: "↓", className: "income" },
  savings: { label: "Savings", symbol: "✳", className: "savings" },
};

export function renderDashboard(data) {
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

  renderCategories(data.categories || []);
  renderBudget(data);
  renderEntries(data.entries || []);
}

function renderCategories(categories) {
  const positive = categories.filter((c) => Number(c.total) > 0);
  const total = positive.reduce((sum, c) => sum + Number(c.total), 0);
  document.querySelector("#donut-total").textContent = money(total, true);
  const segments = [];
  let cursor = 0;
  positive.forEach((c) => {
    const sweep = total ? Number(c.total) / total * 360 : 0;
    segments.push(`${c.color} ${cursor}deg ${cursor + sweep}deg`);
    cursor += sweep;
  });
  document.querySelector("#spending-donut").style.background = segments.length ? `conic-gradient(${segments.join(",")})` : "conic-gradient(#303541 0deg 360deg)";
  const legend = document.querySelector("#category-legend");
  legend.innerHTML = positive.length ? positive.slice(0, 5).map((c) => `<div class="legend-row"><i class="legend-dot" style="background:${escapeHTML(c.color)}"></i><span class="legend-name">${escapeHTML(c.name)}</span><strong class="legend-value">${money(c.total, true)}</strong></div>`).join("") : `<div class="legend-empty">Your category breakdown will show here.</div>`;
  document.querySelector("#category-manage-list").innerHTML = categories.map((c) => `<div class="manage-row"><i class="manage-dot" style="background:${escapeHTML(c.color)}"></i><span>${escapeHTML(c.name)}</span>${c.active ? `<button data-archive-category="${c.id}" title="Remove from active categories">×</button>` : `<span class="archived-label">History</span>`}</div>`).join("") || `<span class="legend-empty">Create your first category.</span>`;
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
  empty.classList.toggle("hidden", entries.length > 0);
  list.innerHTML = entries.map((entry) => {
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
