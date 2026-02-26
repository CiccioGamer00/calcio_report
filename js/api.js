// js/api.js

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldRetry({ ok, status, errors, arr }, pathWithQuery) {
  if (!ok && (status === 401 || status === 402 || status === 403)) return false;
  if (!ok) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  if (errors) return true;

  if (pathWithQuery.includes("/fixtures/statistics") && (!arr || arr.length === 0)) {
    return true;
  }
  return false;
}

// ==========================================
// NUOVA MEMORY CACHE (FRONTEND)
// ==========================================
const __API_FRONTEND_CACHE__ = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minuti di default per tutto

function getFromLocalCache(url) {
  const hit = __API_FRONTEND_CACHE__.get(url);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return hit.data;
  }
  return null;
}

function setInLocalCache(url, data) {
  // Non cachiamo errori
  if (data.ok && !data.errors) {
    __API_FRONTEND_CACHE__.set(url, { ts: Date.now(), data });
  }
}
// ==========================================

async function apiGet(pathWithQuery, opts = {}) {
  const baseUrl = window.API_CONFIG?.baseUrl;
  const baseHeaders = window.API_CONFIG?.headers;

  const retries = Number.isFinite(opts.retries) ? opts.retries : 3;
  const delays = Array.isArray(opts.delays) ? opts.delays : [400, 900, 1600];

  const url = `${baseUrl}${pathWithQuery}`;

  // 1. Controllo immediato nella cache del browser (RAM)
  const cachedData = getFromLocalCache(url);
  if (cachedData) {
    // Risoluzione istantanea senza rete
    return cachedData;
  }

  const h = new Headers(baseHeaders || {});
  const token = localStorage.getItem("CR_TOKEN");
  if (token) h.set("Authorization", `Bearer ${token}`);

  let last = null;

  // id richiesta (per loader)
  const reqId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // Loader start (UI)
  window.dispatchEvent(
    new CustomEvent("cr:loading", { detail: { on: true, url, reqId } })
  );

  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { method: "GET", headers: h });
        const json = await res.json().catch(() => ({}));
        const arr = Array.isArray(json.response) ? json.response : [];

        const workerErr = json?.error
          ? { worker: json.error, message: json.message }
          : null;

        const errors =
          workerErr ||
          (json.errors && Object.keys(json.errors).length > 0 ? json.errors : null);

        const out = { ok: res.ok, status: res.status, json, arr, errors, url };
        last = out;

        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("cr:auth", { detail: out }));
        }
        if (res.status === 402) {
          window.dispatchEvent(new CustomEvent("cr:paywall", { detail: out }));
        }

        if (!shouldRetry(out, pathWithQuery)) {
          // 2. Salvataggio in cache prima di restituire i dati
          setInLocalCache(url, out);
          return out;
        }
      } catch (e) {
        last = {
          ok: false,
          status: 0,
          json: {},
          arr: [],
          errors: { network: String(e.message || e) },
          url,
        };
      }

      if (attempt < retries) {
        const wait = delays[Math.min(attempt, delays.length - 1)] ?? 800;
        await sleep(wait);
      }
    }

    return (
      last || {
        ok: false,
        status: 0,
        json: {},
        arr: [],
        errors: { network: "unknown" },
        url,
      }
    );
  } finally {
    // Loader stop
    window.dispatchEvent(
      new CustomEvent("cr:loading", { detail: { on: false, url, reqId } })
    );
  }
}
