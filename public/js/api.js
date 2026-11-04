const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || "Something went wrong. Please try again.");
  return payload;
};

export const api = {
  dashboard: (month) => request(`/api/dashboard?month=${encodeURIComponent(month)}`),
  categories: () => request("/api/categories"),
  addCategory: (body) => request("/api/categories", { method: "POST", body: JSON.stringify(body) }),
  addEntry: (body) => request("/api/entries", { method: "POST", body: JSON.stringify(body) }),
  updateEntry: (id, body) => request(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEntry: (id) => request(`/api/entries/${id}`, { method: "DELETE" }),
  setCategoryActive: (id, active, month) => request(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify({ active, month }) }),
  saveBudget: (body) => request("/api/budgets", { method: "POST", body: JSON.stringify(body) }),
  savePreferences: (body) => request("/api/preferences", { method: "POST", body: JSON.stringify(body) }),
};
