// js/api.js
// CALCIO REPORT CORE V2
// Client API retrocompatibile con apiGet(), ma con esito tipizzato e diagnostica.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const __API_FRONTEND_CACHE__ = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

function getFromLocalCache(url) {
  const hit = __API_FRONTEND_CACHE__.get(url);
  if (!hit) return null;
  if (Date.now() - hit.ts >= CACHE_TTL_MS) {
    __API_FRONTEND_CACHE__.delete(url);
    return null;
  }
  return hit.data;
}

function setInLocalCache(url, data) {
  // Solo successi semantici reali. Mai empty/error/auth/paywall/rate-limit.
  if (data?.kind === "success" && data.ok && !data.errors) {
    __API_FRONTEND_CACHE__.set(url, { ts: Date.now(), data });
  }
}

function hasApiErrors(json) {
  if (!json || typeof json !== "object") return false;
  if (json.error) return true;
  const errors = json.errors;
  if (!errors) return false;
  if (typeof errors === "string") return errors.trim().length > 0;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(errors);
}

function hasRateLimitError(json) {
  if (!json || typeof json !== "object") return false;

  const candidates = [json.error, json.message, json.errors]
    .filter(Boolean)
    .map((value) => {
      try {
        return typeof value === "string" ? value : JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ")
    .toLowerCase();

  return (
    candidates.includes("ratelimit") ||
    candidates.includes("rate limit") ||
    candidates.includes("too many requests") ||
    candidates.includes("requests per minute")
  );
}

function classifyResult({ status, ok, json, parseError, aborted, networkError }) {
  if (aborted) return "aborted";
  if (networkError) return "network_error";

  // Prima il contratto HTTP: anche se un 401/500 non contiene JSON valido,
  // deve restare un errore auth/server e non diventare un falso parse_error.
  if (status === 401) return "auth";
  if (status === 402) return "paywall";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limit";
  if (!ok) return status >= 500 ? "server_error" : "http_error";

  if (parseError) return "parse_error";

  // API-Football può restituire HTTP 200 e mettere il rate-limit dentro `errors`.
  if (hasRateLimitError(json)) return "rate_limit";
  if (hasApiErrors(json)) return "api_error";

  const response = json?.response;
  if (Array.isArray(response) && response.length === 0) return "empty";
  if (response == null && Object.prototype.hasOwnProperty.call(json || {}, "response")) {
    return "empty";
  }
  return "success";
}

function shouldRetryV2(result) {
  // Retry solo per problemi di rete/5xx realmente transitori.
  // Un rate-limit per minuto non va martellato con un secondo tentativo immediato.
  return ["network_error", "server_error"].includes(result?.kind);
}

function buildErrors(json, fallback = null) {
  if (json?.error) {
    return { worker: json.error, message: json.message || "" };
  }
  if (hasApiErrors(json)) return json.errors;
  return fallback;
}

function requestId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function dispatchApiEvent(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
}

async function apiGetV2(pathWithQuery, opts = {}) {
  const baseUrl = window.API_CONFIG?.baseUrl || "";
  const baseHeaders = window.API_CONFIG?.headers || {};
  const retries = Number.isFinite(opts.retries) ? Math.max(0, opts.retries) : 1;
  const delays = Array.isArray(opts.delays) ? opts.delays : [400];
  const searchId = Number.isFinite(opts.searchId) ? opts.searchId : null;
  const signal = opts.signal || null;
  const useFrontendCache = opts.cache !== false;

  const url = `${baseUrl}${pathWithQuery}`;
  const reqId = requestId();

  if (!baseUrl) {
    return {
      kind: "config_error",
      ok: false,
      status: 0,
      json: {},
      response: null,
      arr: [],
      errors: { config: "API_CONFIG.baseUrl missing" },
      url,
      reqId,
      searchId,
      cache: "NONE",
      relay: "NONE",
    };
  }

  if (useFrontendCache) {
    const cached = getFromLocalCache(url);
    if (cached) {
      return { ...cached, reqId, searchId, frontendCache: "HIT" };
    }
  }

  const headers = new Headers(baseHeaders);
  const token = localStorage.getItem("CR_TOKEN");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  dispatchApiEvent("cr:loading", { on: true, url, reqId, searchId });

  let last = null;

  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers,
          signal,
        });

        let json = {};
        let parseError = null;
        try {
          json = await res.json();
        } catch (err) {
          parseError = String(err?.message || err || "invalid json");
        }

        const kind = classifyResult({
          status: res.status,
          ok: res.ok,
          json,
          parseError,
        });

        const response = Object.prototype.hasOwnProperty.call(json || {}, "response")
          ? json.response
          : null;
        const arr = Array.isArray(response) ? response : [];
        const cacheHeader = res.headers.get("x-cr-cache") || "NONE";
        const relayHeader = res.headers.get("x-cr-relay") || "NONE";

        const out = {
          kind,
          ok: kind === "success" || kind === "empty",
          httpOk: res.ok,
          status: res.status,
          json,
          response,
          arr,
          errors: buildErrors(json, parseError ? { parse: parseError } : null),
          url,
          reqId,
          searchId,
          attempt,
          cache: cacheHeader,
          relay: relayHeader,
          frontendCache: "MISS",
        };

        last = out;

        if (kind === "auth") dispatchApiEvent("cr:auth", out);
        if (kind === "paywall") dispatchApiEvent("cr:paywall", out);

        if (!shouldRetryV2(out) || attempt >= retries) {
          if (useFrontendCache) setInLocalCache(url, out);
          return out;
        }
      } catch (err) {
        const aborted = err?.name === "AbortError";
        const out = {
          kind: aborted ? "aborted" : "network_error",
          ok: false,
          httpOk: false,
          status: 0,
          json: {},
          response: null,
          arr: [],
          errors: aborted
            ? { aborted: true }
            : { network: String(err?.message || err || "network error") },
          url,
          reqId,
          searchId,
          attempt,
          cache: "NONE",
          relay: "NONE",
          frontendCache: "MISS",
        };

        last = out;
        if (aborted || attempt >= retries) return out;
      }

      const wait = delays[Math.min(attempt, delays.length - 1)] ?? 400;
      await sleep(wait);
    }

    return last;
  } finally {
    dispatchApiEvent("cr:loading", { on: false, url, reqId, searchId });
  }
}

// Compatibilità con tutto il codice esistente.
// Il vecchio codice continua a usare r.ok / r.arr / r.errors / r.status,
// mentre il nuovo Core V2 può usare r.kind / r.response / r.cache / r.searchId.
async function apiGet(pathWithQuery, opts = {}) {
  return apiGetV2(pathWithQuery, opts);
}

window.apiGetV2 = apiGetV2;
window.apiGet = apiGet;
