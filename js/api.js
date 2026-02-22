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

async function apiGet(pathWithQuery, opts = {}) {
  const baseUrl = window.API_CONFIG?.baseUrl;
  const baseHeaders = window.API_CONFIG?.headers;

  const retries = Number.isFinite(opts.retries) ? opts.retries : 3;
  const delays = Array.isArray(opts.delays) ? opts.delays : [400, 900, 1600];

  const url = `${baseUrl}${pathWithQuery}`;

  const h = new Headers(baseHeaders || {});
  const token = localStorage.getItem("CR_TOKEN");
  if (token) h.set("Authorization", `Bearer ${token}`);

  let last = null;

  // id richiesta (per loader)
  const reqId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // ✅ Loader start (UI) — ma SOLO qui, una volta
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

        if (!shouldRetry(out, pathWithQuery)) return out;
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
    // ✅ Loader stop SEMPRE (anche su return dentro al try)
    window.dispatchEvent(
      new CustomEvent("cr:loading", { detail: { on: false, url, reqId } })
    );
  }
}
