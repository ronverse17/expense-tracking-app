import { api } from "./api.js";
import { clearCategoryFilter, previewDonutCategory, renderDashboard, toggleCategoryFilter, updateSelects } from "./render.js";
import { money, monthLabel } from "./format.js";

const $ = (selector) => document.querySelector(selector);
const monthInput = $("#month-picker");
const palettes = ["#ffb86b", "#66d9c2", "#bd9aff", "#73a7ff", "#ff7f9c", "#9bdb7c", "#f1d26a", "#a9aebb"];
let selectedColor = palettes[2];
const today = new Date();
let currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
let dashboard = null;
let categories = [];
let entryKind = "expense";
let toastTimer;
let refreshSequence = 0;

monthInput.value = currentMonth;

const navLinks = [...document.querySelectorAll(".nav-item")];
const navSections = navLinks
  .map((link) => ({ link, section: document.querySelector(link.getAttribute("href")) }))
  .filter(({ section }) => section);

function updateActiveNavigation() {
  const marker = window.scrollY + Math.min(window.innerHeight * 0.35, 220);
  let current = navSections[0];
  for (const item of navSections) {
    if (item.section.getBoundingClientRect().top + window.scrollY <= marker) current = item;
  }
  const atPageBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 3;
  if (atPageBottom) current = navSections[navSections.length - 1];

  navSections.forEach(({ link }) => {
    const active = link === current?.link;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  if (current) {
    const icon = current.link.querySelector(".nav-icon")?.textContent || "";
    $("#breadcrumb-current").textContent = current.link.textContent.replace(icon, "").trim();
  }
}

let navFramePending = false;
function scheduleNavigationUpdate() {
  if (navFramePending) return;
  navFramePending = true;
  requestAnimationFrame(() => {
    navFramePending = false;
    updateActiveNavigation();
  });
}

window.addEventListener("scroll", scheduleNavigationUpdate, { passive: true });
window.addEventListener("resize", scheduleNavigationUpdate);
document.querySelector(".nav-list").addEventListener("click", (event) => {
  const clickedLink = event.target.closest(".nav-item");
  const clickedSection = navSections.find(({ link }) => link === clickedLink);
  if (clickedSection) {
    navSections.forEach(({ link }) => {
      const active = link === clickedSection.link;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    $("#breadcrumb-current").textContent = clickedLink.textContent.replace(clickedLink.querySelector(".nav-icon")?.textContent || "", "").trim();
  }
});
updateActiveNavigation();

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2500);
}

function setMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  currentMonth = month;
  monthInput.value = month;
  clearCategoryFilter();
  refresh();
}

async function refresh() {
  const sequence = ++refreshSequence;
  const requestedMonth = currentMonth;
  try {
    const [data, allCategories] = await Promise.all([api.dashboard(requestedMonth), api.categories()]);
    if (sequence !== refreshSequence || requestedMonth !== currentMonth) return;
    dashboard = data;
    categories = allCategories;
    renderDashboard(data);
    updateSelects(categories);
    $("#overview-month-label").innerHTML = `${monthLabel(requestedMonth)} <span>⌄</span>`;
    $("#statement-marker").value = data.statement_marker || "";
  } catch (error) {
    if (sequence !== refreshSequence) return;
    toast(error.message);
  }
}

function categoryIdFromDonutEvent(event) {
  const path = event.target.closest("[data-category-id]");
  return path ? Number(path.dataset.categoryId) : null;
}

$("#spending-donut").addEventListener("pointermove", (event) => {
  previewDonutCategory(categoryIdFromDonutEvent(event));
});
$("#spending-donut").addEventListener("pointerleave", () => previewDonutCategory(null));
$("#spending-donut").addEventListener("click", (event) => {
  const categoryId = categoryIdFromDonutEvent(event);
  if (categoryId) toggleCategoryFilter(categoryId);
});
$("#spending-donut").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const categoryId = categoryIdFromDonutEvent(event);
  if (!categoryId) return;
  event.preventDefault();
  toggleCategoryFilter(categoryId);
});
$("#category-legend").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category-id]");
  if (button) toggleCategoryFilter(Number(button.dataset.categoryId));
});
$("#category-legend").addEventListener("pointerover", (event) => {
  const button = event.target.closest("[data-category-id]");
  if (button) previewDonutCategory(Number(button.dataset.categoryId));
});
$("#category-legend").addEventListener("pointerleave", () => previewDonutCategory(null));
$("#clear-category-filter").addEventListener("click", clearCategoryFilter);

function openEntry(entry = null) {
  const form = $("#entry-form");
  form.reset();
  $("#entry-error").textContent = "";
  $("#editing-entry-id").value = entry?.id || "";
  entryKind = entry?.kind || "expense";
  updateKindTabs();
  updateSelects(categories, entry?.category_id || null);
  if (entry) {
    $("#entry-amount").value = (entry.amount_paise / 100).toFixed(2);
    $("#entry-note").value = entry.note || "";
    if (entry.category_id && ![...$("#entry-category").options].some((o) => Number(o.value) === entry.category_id)) {
      const oldCategory = categories.find((c) => c.id === entry.category_id);
      if (oldCategory) {
        const option = document.createElement("option");
        option.value = oldCategory.id;
        option.textContent = `${oldCategory.name} · history`;
        option.selected = true;
        $("#entry-category").append(option);
      }
    }
    $("#entry-category").value = entry.category_id || "";
    $("#entry-dialog h2").textContent = "Edit entry";
    $("#entry-form .button-primary").innerHTML = "Save changes <span>→</span>";
  } else {
    $("#entry-dialog h2").textContent = "Add an entry";
    $("#entry-form .button-primary").innerHTML = "Save entry <span>→</span>";
  }
  $("#entry-dialog").showModal();
  setTimeout(() => $("#entry-amount").focus(), 50);
}

function updateKindTabs() {
  document.querySelectorAll("#entry-kind-tabs button").forEach((button) => button.classList.toggle("selected", button.dataset.kind === entryKind));
  const isExpense = entryKind === "expense";
  $("#entry-category").closest(".select-row").style.display = isExpense ? "flex" : "none";
  $("#entry-category").closest(".field-label")?.remove();
  $("#negative-hint").style.display = isExpense ? "block" : "none";
  const label = [...$("#entry-form").querySelectorAll(".field-label")].find((el) => el.htmlFor === "entry-category");
  if (label) label.style.display = isExpense ? "block" : "none";
}

document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
$("#entry-kind-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-kind]");
  if (!button) return;
  entryKind = button.dataset.kind;
  updateKindTabs();
});

$("#entry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#editing-entry-id").value;
  const body = {
    kind: entryKind,
    amount: Number($("#entry-amount").value),
    category_id: entryKind === "expense" ? Number($("#entry-category").value) : null,
    note: $("#entry-note").value,
    month: currentMonth,
  };
  try {
    if (id) await api.updateEntry(id, body); else await api.addEntry(body);
    $("#entry-dialog").close();
    toast(id ? "Entry updated" : "Entry added");
    refresh();
  } catch (error) {
    $("#entry-error").textContent = error.message;
  }
});

function openCategory() {
  $("#category-name").value = "";
  $("#category-error").textContent = "";
  selectedColor = palettes[2];
  $("#category-colors").innerHTML = palettes.map((color, i) => `<button type="button" class="color-swatch ${i === 2 ? "selected" : ""}" style="background:${color}" data-color="${color}" aria-label="Choose category color"></button>`).join("");
  $("#category-dialog").showModal();
}

$("#category-colors").addEventListener("click", (event) => {
  const swatch = event.target.closest("[data-color]");
  if (!swatch) return;
  selectedColor = swatch.dataset.color;
  document.querySelectorAll(".color-swatch").forEach((el) => el.classList.toggle("selected", el === swatch));
});
$("#category-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const category = await api.addCategory({ name: $("#category-name").value, color: selectedColor });
    $("#category-dialog").close();
    await refresh();
    $("#entry-category").value = category.id;
    toast("Category created");
    if (!$("#entry-dialog").open) openEntry();
    $("#entry-category").value = category.id;
  } catch (error) {
    $("#category-error").textContent = error.message;
  }
});

$("#add-entry-open").addEventListener("click", () => openEntry());
$("#add-category-open").addEventListener("click", openCategory);
$("#inline-category").addEventListener("click", openCategory);
$("#entry-list").addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-entry]");
  const deleteButton = event.target.closest("[data-delete-entry]");
  if (editButton) {
    const entry = dashboard?.entries.find((item) => item.id === Number(editButton.dataset.editEntry));
    if (entry) openEntry(entry);
  }
  if (deleteButton) {
    if (!window.confirm("Delete this entry? Monthly totals and budgets will be updated.")) return;
    try {
      await api.deleteEntry(deleteButton.dataset.deleteEntry);
      toast("Entry deleted");
      refresh();
    } catch (error) { toast(error.message); }
  }
});

$("#category-manage-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-archive-category]");
  if (!button) return;
  if (currentMonth !== `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`) {
    toast("Categories can only be removed while viewing the current month");
    return;
  }
  const category = categories.find((c) => c.id === Number(button.dataset.archiveCategory));
  if (!window.confirm(`Remove “${category?.name}” from active categories? Previous month history will be kept.`)) return;
  try {
    await api.archiveCategory(button.dataset.archiveCategory, currentMonth);
    toast("Category moved to history");
    refresh();
  } catch (error) { toast(error.message); }
});

function openBudget() {
  $("#budget-error").textContent = "";
  $("#budget-amount").value = dashboard?.monthly_budget ? (dashboard.monthly_budget / 100).toFixed(2) : "";
  $("#budget-dialog").showModal();
}
$("#add-budget").addEventListener("click", openBudget);
$("#budget-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api.saveBudget({ month: currentMonth, amount: Number($("#budget-amount").value) });
    $("#budget-dialog").close();
    toast("Budget saved");
    refresh();
  } catch (error) { $("#budget-error").textContent = error.message; }
});

$("#set-savings-target").addEventListener("click", () => {
  $("#savings-error").textContent = "";
  $("#savings-target").value = dashboard?.monthly_savings_target ? (dashboard.monthly_savings_target / 100).toFixed(2) : "";
  $("#savings-dialog").showModal();
});
$("#savings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api.savePreferences({ month: currentMonth, savings_target: Number($("#savings-target").value) });
    $("#savings-dialog").close();
    toast("Savings target saved");
    refresh();
  } catch (error) { $("#savings-error").textContent = error.message; }
});

$("#save-marker").addEventListener("click", async () => {
  try {
    await api.savePreferences({ statement_marker: $("#statement-marker").value.trim() });
    toast("Statement checkpoint saved");
  } catch (error) { toast(error.message); }
});

$("#export-btn").addEventListener("click", () => { window.location.href = `/api/export.csv?month=${encodeURIComponent(currentMonth)}`; });
monthInput.addEventListener("change", () => setMonth(monthInput.value));
$("#prev-month").addEventListener("click", () => {
  const [year, month] = currentMonth.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
});
$("#next-month").addEventListener("click", () => {
  const [year, month] = currentMonth.split("-").map(Number);
  const date = new Date(year, month, 1);
  setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
});
$("#overview-month-label").addEventListener("click", () => monthInput.showPicker?.());

refresh();
