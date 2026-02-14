// js/api.js

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldRetry({ ok, status, errors, arr }, pathWithQuery) {
  // retry su problemi classici
  if (!ok) return true;

  // retry su rate limit o errori server temporanei
  if (status === 429) return true;
  if (status >= 500) return true;

  // retry se l'API segnala errors
  if (errors) return true;

  // caso specifico che ti sta dando fastidio:
  // /fixtures/statistics a volte arriva "vuoto" anche se i dati esistono
  // quindi se è statistics e response è vuota, ritentiamo
  if (
    pathWithQuery.includes("/fixtures/statistics") &&
    (!arr || arr.length === 0)
  ) {
    return true;
  }

  return false;
}

async function apiGet(pathWithQuery, opts = {}) {
  const baseUrl = window.API_CONFIG?.baseUrl;
  const headers = window.API_CONFIG?.headers;

  // retry “moderato”: aspetta e riprova poche volte (non infinito)
  const retries = Number.isFinite(opts.retries) ? opts.retries : 3;
  const delays = Array.isArray(opts.delays) ? opts.delays : [400, 900, 1600];

  const url = `${baseUrl}${pathWithQuery}`;

  let last = null;
  const h = new Headers(headers || {});
  const token = localStorage.getItem("CR_TOKEN");
  if (token) h.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { method: "GET", headers: h });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { method: "GET", headers });
      const json = await res.json().catch(() => ({}));
      const arr = Array.isArray(json.response) ? json.response : [];
      const errors =
        json.errors && Object.keys(json.errors).length > 0 ? json.errors : null;

      const out = { ok: res.ok, status: res.status, json, arr, errors, url };
      last = out;

      // se va bene e non è vuoto “strano”, stop
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

    // se non è l'ultimo tentativo, aspetta e riprova
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
}
