// js/api.js

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isCriticalLookup(pathWithQuery) {
  const p = String(pathWithQuery || "");
  return (
    p.includes("/teams?search=") ||
    (p.includes("/fixtures?") && p.includes("team=") && (p.includes("next=") || p.includes("last=")))
  );
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
// MEMORY CACHE FRONTEND
// ==========================================
const __API_FRONTEND_CACHE__ = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

function getFromLocalCache(url) {
  const hit = __API_FRONTEND_CACHE__.get(url);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return hit.data;
  }
  return null;
}

function setInLocalCache(url, pathWithQuery, data) {
  if (!data?.ok || data?.errors) return;

  // Non conserviamo in RAM risposte vuote delle ricerche critiche.
  // Un HTTP 200 con response:[] può essere temporaneo e non deve bloccare
  // la stessa ricerca per i successivi 3 minuti.
  if (isCriticalLookup(pathWithQuery) && (!data.arr || data.arr.length === 0)) return;

  __API_FRONTEND_CACHE__.set(url, { ts: Date.now(), data });
}

// ==========================================
// TRAFFIC SHAPER
// ==========================================
// API-Football applica limiti anche ai piani a pagamento.
// Manteniamo le richieste del singolo browser ben distanziate per evitare burst.
let __CR_NEXT_FETCH_SLOT__ = 0;
const __CR_MIN_FETCH_GAP_MS__ = 280;

async function crFetch(url, options) {
  const now = Date.now();
  const slot = Math.max(now, __CR_NEXT_FETCH_SLOT__);
  const wait = Math.max(0, slot - now);
  __CR_NEXT_FETCH_SLOT__ = slot + __CR_MIN_FETCH_GAP_MS__;
  if (wait > 0) await sleep(wait);
  return fetch(url, options);
}

// Ultime risposte utili per diagnosi da console, senza token o API key.
window.__CR_API_DIAG__ = window.__CR_API_DIAG__ || [];

function pushApiDiag(out, pathWithQuery, attempt) {
  const entry = {
    ts: new Date().toISOString(),
    path: pathWithQuery,
    status: out?.status ?? 0,
    results: Array.isArray(out?.arr) ? out.arr.length : 0,
    errors: out?.errors || null,
    cache: out?.cache || "",
    rateRemaining: out?.rateRemaining || "",
    rateLimit: out?.rateLimit || "",
    attempt,
  };

  window.__CR_API_DIAG__.push(entry);
  if (window.__CR_API_DIAG__.length > 80) window.__CR_API_DIAG__.shift();

  if (entry.errors || (isCriticalLookup(pathWithQuery) && entry.results === 0)) {
    console.warn("[Calcio Report API]", entry);
  }
}

async function apiGet(pathWithQuery, opts = {}) {
  const baseUrl = window.API_CONFIG?.baseUrl;
  const baseHeaders = window.API_CONFIG?.headers;

  const retries = Number.isFinite(opts.retries) ? opts.retries : 3;
  const delays = Array.isArray(opts.delays) ? opts.delays : [400, 900, 1600];

  const url = `${baseUrl}${pathWithQuery}`;

  const cachedData = getFromLocalCache(url);
  if (cachedData) return cachedData;

  const h = new Headers(baseHeaders || {});
  const token = localStorage.getItem("CR_TOKEN");
  if (token) h.set("Authorization", `Bearer ${token}`);

  let last = null;
  const reqId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  window.dispatchEvent(
    new CustomEvent("cr:loading", { detail: { on: true, url, reqId } }),
  );

  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await crFetch(url, { method: "GET", headers: h });
        const json = await res.json().catch(() => ({}));
        const arr = Array.isArray(json.response) ? json.response : [];

        const workerErr = json?.error
          ? { worker: json.error, message: json.message }
          : null;

        const errors =
          workerErr ||
          (json.errors && Object.keys(json.errors).length > 0 ? json.errors : null);

        const out = {
          ok: res.ok,
          status: res.status,
          json,
          arr,
          errors,
          url,
          cache: res.headers.get("x-cr-cache") || "",
          rateRemaining: res.headers.get("X-RateLimit-Remaining") || "",
          rateLimit: res.headers.get("X-RateLimit-Limit") || "",
        };
        last = out;
        pushApiDiag(out, pathWithQuery, attempt + 1);

        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("cr:auth", { detail: out }));
        }
        if (res.status === 402) {
          window.dispatchEvent(new CustomEvent("cr:paywall", { detail: out }));
        }

        if (!shouldRetry(out, pathWithQuery)) {
          setInLocalCache(url, pathWithQuery, out);
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
          cache: "",
          rateRemaining: "",
          rateLimit: "",
        };
        pushApiDiag(last, pathWithQuery, attempt + 1);
      }

      if (attempt < retries) {
        let wait = delays[Math.min(attempt, delays.length - 1)] ?? 800;
        if (last?.status === 429 || last?.errors?.rateLimit) {
          wait = Math.max(wait, 1400 * (attempt + 1));
        }
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
        cache: "",
        rateRemaining: "",
        rateLimit: "",
      }
    );
  } finally {
    window.dispatchEvent(
      new CustomEvent("cr:loading", { detail: { on: false, url, reqId } }),
    );
  }
}

window.apiGet = apiGet;
