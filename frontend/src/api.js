const API_BASE = import.meta.env.VITE_API_BASE || '';

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json();
}

export const api = {
  pcAcs: (pcId) => get(`/api/pc/${pcId}/acs`),
  children: (unitId) => get(`/api/admin-units/${unitId}/children`),
  results: (unitId) => get(`/api/admin-units/${unitId}/results`),
  trend: (unitId) => get(`/api/admin-units/${unitId}/trend`),
  demographics: (unitId) => get(`/api/admin-units/${unitId}/demographics`),
  resolve: (name, level) => get(`/api/admin-units?name=${encodeURIComponent(name)}${level ? `&level=${level}` : ''}`),
  listByLevel: (level) => get(`/api/admin-units?level=${level}`),
  stateSummary: () => get(`/api/state-summary`),
  districtSummary: (districtId) => get(`/api/districts/${districtId}/summary`),
};
