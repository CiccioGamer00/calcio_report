// js/api.js

async function apiGet(pathWithQuery) {
  const baseUrl = window.API_CONFIG?.baseUrl;
  const headers = window.API_CONFIG?.headers;

  const url = `${baseUrl}${pathWithQuery}`;
  try {
    const res = await fetch(url, { method: "GET", headers });
    const json = await res.json().catch(() => ({}));
    const arr = Array.isArray(json.response) ? json.response : [];
    const errors =
      json.errors && Object.keys(json.errors).length > 0 ? json.errors : null;
    return { ok: res.ok, status: res.status, json, arr, errors, url };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      json: {},
      arr: [],
      errors: { network: String(e.message || e) },
      url,
    };
  }
}