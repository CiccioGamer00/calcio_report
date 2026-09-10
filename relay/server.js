import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = String(process.env.APISPORTS_KEY || "").trim();
const RELAY_SECRET = String(process.env.CR_RELAY_SECRET || "").trim();
const API_BASE = "https://v3.football.api-sports.io";

const MAX_CLOCK_SKEW_MS = 30_000;
const MIN_UPSTREAM_GAP_MS = 250; // max ~4 req/s, sotto il limite PRO di 5 req/s
const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_INFLIGHT_KEYS = 200;

const ALLOWED_ROOTS = new Set([
  "countries",
  "leagues",
  "teams",
  "standings",
  "fixtures",
  "injuries",
  "players",
  "coachs",
  "sidelined",
  "predictions",
  "odds",
]);

let nextUpstreamSlot = 0;
const inflight = new Map();

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function safeEqualHex(a, b) {
  if (!a || !b) return false;
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;

  const aa = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function signatureFor(timestamp, method, pathWithQuery) {
  const canonical = `${timestamp}\n${method.toUpperCase()}\n${pathWithQuery}`;
  return crypto.createHmac("sha256", RELAY_SECRET).update(canonical).digest("hex");
}

function validateSignature(req, pathWithQuery) {
  const timestamp = String(req.headers["x-cr-timestamp"] || "").trim();
  const signature = String(req.headers["x-cr-signature"] || "").trim().toLowerCase();

  if (!timestamp || !signature) return { ok: false, reason: "missing_signature" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid_timestamp" };
  if (Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "expired_signature" };
  }

  const expected = signatureFor(timestamp, req.method || "GET", pathWithQuery);
  if (!safeEqualHex(signature, expected)) return { ok: false, reason: "bad_signature" };

  return { ok: true };
}

function isAllowedPath(pathname) {
  const root = pathname.split("/").filter(Boolean)[0] || "";
  return ALLOWED_ROOTS.has(root);
}

async function waitForRateSlot() {
  const now = Date.now();
  const slot = Math.max(now, nextUpstreamSlot);
  nextUpstreamSlot = slot + MIN_UPSTREAM_GAP_MS;

  const wait = slot - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

function pickForwardHeaders(headers) {
  const out = {};
  const names = [
    "content-type",
    "x-ratelimit-requests-limit",
    "x-ratelimit-requests-remaining",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
  ];

  for (const name of names) {
    const value = headers.get(name);
    if (value != null) out[name] = value;
  }

  out["cache-control"] = "no-store";
  return out;
}

async function fetchUpstream(pathWithQuery) {
  await waitForRateSlot();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${API_BASE}${pathWithQuery}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-apisports-key": API_KEY,
      },
      signal: controller.signal,
    });

    const body = await upstream.text();

    return {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: pickForwardHeaders(upstream.headers),
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getCoalesced(pathWithQuery) {
  const existing = inflight.get(pathWithQuery);
  if (existing) return existing;

  if (inflight.size >= MAX_INFLIGHT_KEYS) {
    throw new Error("relay_overloaded");
  }

  const promise = fetchUpstream(pathWithQuery).finally(() => {
    if (inflight.get(pathWithQuery) === promise) inflight.delete(pathWithQuery);
  });

  inflight.set(pathWithQuery, promise);
  return promise;
}

function configurationError() {
  const missing = [];
  if (!API_KEY) missing.push("APISPORTS_KEY");
  if (!RELAY_SECRET) missing.push("CR_RELAY_SECRET");
  return missing;
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const missing = configurationError();
    return json(res, missing.length ? 503 : 200, {
      ok: missing.length === 0,
      service: "calcio-report-relay",
      missing,
    });
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "METHOD_NOT_ALLOWED" }, { allow: "GET" });
  }

  const missing = configurationError();
  if (missing.length) {
    return json(res, 503, { error: "RELAY_NOT_CONFIGURED", missing });
  }

  if (!isAllowedPath(url.pathname)) {
    return json(res, 404, { error: "ENDPOINT_NOT_ALLOWED" });
  }

  const pathWithQuery = `${url.pathname}${url.search}`;
  const auth = validateSignature(req, pathWithQuery);
  if (!auth.ok) {
    return json(res, 401, { error: "RELAY_AUTH", reason: auth.reason });
  }

  try {
    const result = await getCoalesced(pathWithQuery);

    res.writeHead(result.status, {
      ...result.headers,
      "x-cr-relay": "1",
    });
    res.end(result.body);
  } catch (err) {
    const aborted = err?.name === "AbortError";
    const overloaded = String(err?.message || "") === "relay_overloaded";

    return json(
      res,
      overloaded ? 503 : 502,
      {
        error: overloaded ? "RELAY_OVERLOADED" : "UPSTREAM_NETWORK",
        message: aborted ? "API-Football timeout" : String(err?.message || err || "unknown"),
      },
      { "x-cr-relay": "1" },
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Calcio Report relay listening on http://${HOST}:${PORT}`);
});
