export const money = (paise, compact = false) => {
  const amount = Number(paise || 0) / 100;
  if (compact && Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (compact && Math.abs(amount) >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
};

export const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export const monthLabel = (month, options = { month: "long", year: "numeric" }) => {
  if (!month) return "";
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", options).format(new Date(year, number - 1, 1));
};

export const createdLabel = (timestamp) => {
  const date = new Date(`${String(timestamp).replace(" ", "T")}Z`);
  if (Number.isNaN(date.valueOf())) return "Added recently";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
};
