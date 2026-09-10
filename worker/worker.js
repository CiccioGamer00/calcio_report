export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    // ========== STRIPE WEBHOOK ==========
if (url.pathname === "/stripe/webhook" && request.method === "POST") {
  return handleStripeWebhook(request, env);
}

    // ========== AUTH ==========
    if (url.pathname === "/register" && request.method === "POST") {
      return handleRegister(request, env);
    }
    if (url.pathname === "/login" && request.method === "POST") {
      return handleLogin(request, env);
    }
    if (url.pathname === "/me" && request.method === "GET") {
      return handleMe(request, env);
    }

    // ========== TELEMETRY ==========
    if (url.pathname === "/telemetry/ping" && request.method === "POST") {
      return handleTelemetryPing(request, env);
    }

    // ========== LICENSE ==========
    if (url.pathname === "/license/redeem" && request.method === "POST") {
      return handleRedeem(request, env);
    }

    // ========== ADMIN ==========
    if (url.pathname === "/admin/users" && request.method === "GET") {
      return handleAdminUsers(request, env);
    }
    if (url.pathname === "/admin/users/grant" && request.method === "POST") {
      return handleAdminGrant(request, env);
    }

    // ========== PREDICTION ==========
    if (url.pathname === "/predict" && request.method === "GET") {
      const gate = await requireActiveUser(request, env);
      if (!gate.ok) return json(gate.body, gate.status);
      return handlePredict(request, env, ctx);
    }

    // ========== DEFAULT: API-FOOTBALL PROXY ==========
    const gate = await requireActiveUser(request, env);
    if (!gate.ok) return json(gate.body, gate.status);

    return proxyToApiSports(request, env, ctx);
  },
};

/* =========================
   Auth helpers
   ========================= */
async function handleRegister(request, env) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!email || !email.includes("@")) {
      return json({ error: "INVALID_EMAIL" }, 400);
    }
    if (password.length < 6) {
      return json({ error: "PASSWORD_TOO_SHORT" }, 400);
    }

    const exists = await env.DB.prepare("SELECT email FROM users WHERE email = ?")
      .bind(email)
      .first();
    if (exists) return json({ error: "EMAIL_EXISTS" }, 409);

    const salt = randomHex(16);
    const passHash = await hashPassword(password, salt);
    const now = new Date();
    const nowIso = now.toISOString();

    const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(
      `INSERT INTO users
        (email, pass_hash, salt, created_at, trial_ends_at, paid_until, disabled, token, paid_activated_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, NULL, ?)`
    )
      .bind(email, passHash, salt, nowIso, trialEnds, nowIso)
      .run();

    const token = await issueToken(env, email);
    return json({ ok: true, token }, 200);
  } catch (e) {
    return json({ error: "REGISTER_FAILED", message: String(e?.message || e) }, 500);
  }
}

async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    const u = await env.DB.prepare(
      `SELECT email, pass_hash, salt, disabled, trial_ends_at, paid_until
       FROM users WHERE email = ?`
    )
      .bind(email)
      .first();

    if (!u) return json({ error: "INVALID_CREDENTIALS" }, 401);
    if (Number(u.disabled) === 1) return json({ error: "ACCOUNT_DISABLED" }, 403);

    const passHash = await hashPassword(password, u.salt);
    if (passHash !== u.pass_hash) return json({ error: "INVALID_CREDENTIALS" }, 401);

    const token = await issueToken(env, email);
    return json({ ok: true, token }, 200);
  } catch (e) {
    return json({ error: "LOGIN_FAILED", message: String(e?.message || e) }, 500);
  }
}

async function handleMe(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return json(auth.body, auth.status);

  const access = accessState(auth.user);
  return json({
    ok: true,
    email: auth.user.email,
    trialEndsAt: auth.user.trial_ends_at,
    paidUntil: auth.user.paid_until,
    disabled: Number(auth.user.disabled) === 1,
    access,
  });
}

async function authenticateRequest(request, env) {
  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, status: 401, body: { error: "AUTH_REQUIRED", message: "Login necessario." } };

  const token = m[1].trim();
  if (!token) return { ok: false, status: 401, body: { error: "AUTH_REQUIRED", message: "Login necessario." } };

  const u = await env.DB.prepare(
    `SELECT email, disabled, trial_ends_at, paid_until, paid_activated_at, last_seen_at
     FROM users WHERE token = ?`
  )
    .bind(token)
    .first();

  if (!u) return { ok: false, status: 401, body: { error: "AUTH_INVALID", message: "Sessione non valida." } };
  if (Number(u.disabled) === 1)
    return { ok: false, status: 403, body: { error: "ACCOUNT_DISABLED", message: "Account disabilitato." } };

  return { ok: true, user: u };
}

async function requireActiveUser(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return auth;

  const access = accessState(auth.user);
  if (!access.active) {
    return {
      ok: false,
      status: 402,
      body: {
        error: "PAYWALL",
        message: "Periodo di prova scaduto. Attiva PRO per continuare.",
        access,
      },
    };
  }

  return auth;
}

function accessState(u) {
  const now = Date.now();
  const trial = u?.trial_ends_at ? Date.parse(u.trial_ends_at) : 0;
  const paid = u?.paid_until ? Date.parse(u.paid_until) : 0;

  const paidActive = Number.isFinite(paid) && paid > now;
  const trialActive = Number.isFinite(trial) && trial > now;

  return {
    active: paidActive || trialActive,
    mode: paidActive ? "PRO" : trialActive ? "TRIAL" : "EXPIRED",
    trialEndsAt: u?.trial_ends_at || null,
    paidUntil: u?.paid_until || null,
  };
}

async function issueToken(env, email) {
  const token = `${randomHex(24)}${randomHex(24)}`;
  await env.DB.prepare("UPDATE users SET token = ? WHERE email = ?")
    .bind(token, email)
    .run();
  return token;
}

/* =========================
   Telemetry
   ========================= */
async function handleTelemetryPing(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return json(auth.body, auth.status);

  const nowIso = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE email = ?")
    .bind(nowIso, auth.user.email)
    .run();

  return json({ ok: true });
}

/* =========================
   License
   ========================= */
async function handleRedeem(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return json(auth.body, auth.status);

  try {
    const body = await request.json();
    const code = String(body.code || "").trim();
    if (!code) return json({ error: "INVALID_CODE" }, 400);

    const license = await verifyLicenseCode(env, code);
    if (!license.ok) return json({ error: "INVALID_CODE" }, 400);

    const days = Math.max(1, Math.min(365, Number(license.days) || 30));
    const now = Date.now();
    const current = auth.user.paid_until ? Date.parse(auth.user.paid_until) : 0;
    const base = Number.isFinite(current) && current > now ? current : now;
    const paidUntil = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare("UPDATE users SET paid_until = ? WHERE email = ?")
      .bind(paidUntil, auth.user.email)
      .run();

    return json({ ok: true, paidUntil });
  } catch (e) {
    return json({ error: "REDEEM_FAILED", message: String(e?.message || e) }, 500);
  }
}

/* =========================
   Admin
   ========================= */
async function handleAdminUsers(request, env) {
  if (!isAdmin(request, env)) return json({ error: "FORBIDDEN" }, 403);

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 100)));

  const rows = await env.DB.prepare(
    `SELECT email, created_at, trial_ends_at, paid_until, disabled, paid_activated_at, last_seen_at, note
     FROM users
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(limit)
    .all();

  return json({ ok: true, users: rows.results || [] });
}

async function handleAdminGrant(request, env) {
  if (!isAdmin(request, env)) return json({ error: "FORBIDDEN" }, 403);

  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const days = Math.max(1, Math.min(3650, Number(body.days) || 30));

    if (!email) return json({ error: "INVALID_EMAIL" }, 400);

    const row = await env.DB.prepare("SELECT paid_until FROM users WHERE email = ?")
      .bind(email)
      .first();
    if (!row) return json({ error: "USER_NOT_FOUND" }, 404);

    const now = Date.now();
    const current = row.paid_until ? Date.parse(row.paid_until) : 0;
    const base = Number.isFinite(current) && current > now ? current : now;
    const paidUntil = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare("UPDATE users SET paid_until = ? WHERE email = ?")
      .bind(paidUntil, email)
      .run();

    return json({ ok: true, email, paidUntil });
  } catch (e) {
    return json({ error: "ADMIN_GRANT_FAILED", message: String(e?.message || e) }, 500);
  }
}

function isAdmin(request, env) {
  const k = request.headers.get("x-admin-key") || "";
  return k && env.ADMIN_KEY && k === env.ADMIN_KEY;
}

/* =========================
   Cache / API proxy
   ========================= */
function cacheTtlFor(pathname, searchParams) {
  if (pathname === "/fixtures/events") return 5 * 60;
  if (pathname === "/fixtures/statistics") return 10 * 60;

  if (pathname === "/fixtures") {
    if (searchParams?.get("id")) return 10 * 60;
    return 3 * 60;
  }

  if (pathname === "/injuries") return 10 * 60;
  if (pathname === "/players" || pathname === "/players/squads") return 30 * 60;
  if (pathname === "/teams") return 60 * 60;
  return 5 * 60;
}

function hasApiSportsErrors(payload) {
  if (!payload || typeof payload !== "object") return true;
  if (payload.error) return true;

  const errors = payload.errors;
  if (!errors) return false;
  if (typeof errors === "string") return errors.trim().length > 0;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(errors);
}

function makeCacheKey(requestUrl) {
  const src = new URL(requestUrl);
  const cacheUrl = new URL(src.origin);

  cacheUrl.pathname = `/__cr_cache_v2__${src.pathname}`;
  cacheUrl.search = "";

  const entries = [...src.searchParams.entries()].sort(([ak, av], [bk, bv]) => {
    if (ak !== bk) return ak.localeCompare(bk);
    return av.localeCompare(bv);
  });

  for (const [key, value] of entries) {
    cacheUrl.searchParams.append(key, value);
  }

  return new Request(cacheUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
}

async function proxyToApiSports(request, env, ctx) {
  const url = new URL(request.url);
  const cache = caches.default;
  const cacheKey = makeCacheKey(url.toString());

  let response = await cache.match(cacheKey);
  let cacheStatus = response ? "HIT" : "MISS";

  if (!response) {
    const upstreamUrl = `https://v3.football.api-sports.io${url.pathname}${url.search}`;
    const h = new Headers();
    h.set("x-apisports-key", env.APISPORTS_KEY);
    h.set("Accept", "application/json");

    let apiRes;
    try {
      apiRes = await fetch(upstreamUrl, { method: "GET", headers: h });
    } catch (err) {
      return json(
        {
          error: "UPSTREAM_NETWORK",
          message: String(err?.message || err || "API-Football non raggiungibile"),
        },
        502,
        {
          ...corsHeaders(),
          "Cache-Control": "no-store",
          "x-cr-cache": "MISS",
        },
      );
    }

    const bodyText = await apiRes.text();

    let parsed = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {}

    const semanticOk = apiRes.ok && parsed !== null && !hasApiSportsErrors(parsed);
    const responseHeaders = new Headers(apiRes.headers);

    if (semanticOk) {
      const ttl = cacheTtlFor(url.pathname, url.searchParams);
      responseHeaders.set("Cache-Control", ttl > 0 ? `public, s-maxage=${ttl}` : "no-store");

      response = new Response(bodyText, {
        status: apiRes.status,
        statusText: apiRes.statusText,
        headers: responseHeaders,
      });

      if (ttl > 0) {
        const putPromise = cache.put(cacheKey, response.clone());
        if (ctx?.waitUntil) ctx.waitUntil(putPromise);
        else await putPromise;
      }
    } else {
      responseHeaders.set("Cache-Control", "no-store");
      response = new Response(bodyText, {
        status: apiRes.status,
        statusText: apiRes.statusText,
        headers: responseHeaders,
      });
    }
  }

  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => newHeaders.set(k, v));
  newHeaders.set("x-cr-cache", cacheStatus);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/* =========================
   Prediction
   ========================= */
async function handlePredict(request, env, ctx) {
  const url = new URL(request.url);
  const fixtureId = Number(url.searchParams.get("fixture") || 0);
  if (!fixtureId) return json({ error: "INVALID_FIXTURE" }, 400);

  try {
    const fxRes = await af(env, ctx, `/fixtures?id=${fixtureId}`, 10 * 60);
    const fx = fxRes?.[0];
    if (!fx) return json({ error: "FIXTURE_NOT_FOUND" }, 404);

    const leagueId = fx?.league?.id;
    const season = fx?.league?.season;
    const homeId = fx?.teams?.home?.id;
    const awayId = fx?.teams?.away?.id;

    const homeName = fx?.teams?.home?.name || "Casa";
    const awayName = fx?.teams?.away?.name || "Trasferta";

    if (!leagueId || !season || !homeId || !awayId) {
      return json({ error: "FIXTURE_INCOMPLETE" }, 422);
    }

    const [homeRecent, awayRecent, standings] = await Promise.all([
      af(env, ctx, `/fixtures?team=${homeId}&last=8&status=FT&timezone=Europe/Rome`, 15 * 60),
      af(env, ctx, `/fixtures?team=${awayId}&last=8&status=FT&timezone=Europe/Rome`, 15 * 60),
      af(env, ctx, `/standings?league=${leagueId}&season=${season}`, 10 * 60),
    ]);

    const homeForm = computeForm(homeRecent, homeId);
    const awayForm = computeForm(awayRecent, awayId);
    const table = extractStandings(standings);
    const homeStanding = table.find((r) => r.teamId === homeId) || null;
    const awayStanding = table.find((r) => r.teamId === awayId) || null;

    const model = predictMatch({
      home: homeForm,
      away: awayForm,
      homeStanding,
      awayStanding,
    });

    return json({
      ok: true,
      fixture: fixtureId,
      generatedAt: new Date().toISOString(),
      teams: {
        home: { id: homeId, name: homeName, form: homeForm, standing: homeStanding },
        away: { id: awayId, name: awayName, form: awayForm, standing: awayStanding },
      },
      prediction: model,
    });
  } catch (e) {
    return json({ error: "PREDICTION_FAILED", message: String(e?.message || e) }, 500);
  }
}

async function af(env, ctx, pathWithQuery, ttl = 300) {
  const cache = caches.default;
  const publicKeyUrl = new URL(`https://cache.local${pathWithQuery}`);
  const cacheKey = new Request(publicKeyUrl.toString(), { method: "GET" });

  let cached = await cache.match(cacheKey);
  if (cached) {
    const payload = await cached.json();
    return Array.isArray(payload?.response) ? payload.response : [];
  }

  const h = new Headers();
  h.set("x-apisports-key", env.APISPORTS_KEY);
  h.set("Accept", "application/json");

  const res = await fetch(`https://v3.football.api-sports.io${pathWithQuery}`, {
    method: "GET",
    headers: h,
  });

  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {}

  if (!res.ok || parsed === null || hasApiSportsErrors(parsed)) {
    const msg = parsed?.errors || parsed?.error || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  const out = new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, s-maxage=${ttl}`,
    },
  });

  if (ttl > 0) {
    const putPromise = cache.put(cacheKey, out.clone());
    if (ctx?.waitUntil) ctx.waitUntil(putPromise);
    else await putPromise;
  }

  return Array.isArray(parsed?.response) ? parsed.response : [];
}

function computeForm(fixtures, teamId) {
  const rows = [];
  for (const fx of Array.isArray(fixtures) ? fixtures : []) {
    const h = fx?.teams?.home?.id;
    const a = fx?.teams?.away?.id;
    const gh = Number(fx?.goals?.home);
    const ga = Number(fx?.goals?.away);
    if (!Number.isFinite(gh) || !Number.isFinite(ga)) continue;

    const isHome = h === teamId;
    const gf = isHome ? gh : ga;
    const gc = isHome ? ga : gh;
    const pts = gf > gc ? 3 : gf === gc ? 1 : 0;

    rows.push({ gf, gc, pts });
  }

  const n = rows.length;
  const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  return {
    matches: n,
    points: sum("pts"),
    pointsPerGame: n ? round(sum("pts") / n, 2) : 0,
    goalsForAvg: n ? round(sum("gf") / n, 2) : 0,
    goalsAgainstAvg: n ? round(sum("gc") / n, 2) : 0,
  };
}

function extractStandings(payloadRows) {
  const league = payloadRows?.[0]?.league;
  const group = league?.standings?.[0];
  if (!Array.isArray(group)) return [];

  return group.map((r) => ({
    rank: r?.rank ?? null,
    points: r?.points ?? null,
    teamId: r?.team?.id ?? null,
    teamName: r?.team?.name ?? "",
    played: r?.all?.played ?? null,
    win: r?.all?.win ?? null,
    draw: r?.all?.draw ?? null,
    lose: r?.all?.lose ?? null,
    goalsFor: r?.all?.goals?.for ?? null,
    goalsAgainst: r?.all?.goals?.against ?? null,
  }));
}

function predictMatch({ home, away, homeStanding, awayStanding }) {
  const homeAttack = Math.max(0.15, Number(home?.goalsForAvg || 0.9));
  const awayAttack = Math.max(0.15, Number(away?.goalsForAvg || 0.9));
  const homeDef = Math.max(0.15, Number(home?.goalsAgainstAvg || 1.1));
  const awayDef = Math.max(0.15, Number(away?.goalsAgainstAvg || 1.1));

  let lambdaHome = 0.55 * homeAttack + 0.45 * awayDef + 0.18;
  let lambdaAway = 0.55 * awayAttack + 0.45 * homeDef;

  const hp = Number(home?.pointsPerGame || 0);
  const ap = Number(away?.pointsPerGame || 0);
  lambdaHome += clamp((hp - ap) * 0.12, -0.28, 0.28);
  lambdaAway += clamp((ap - hp) * 0.10, -0.24, 0.24);

  if (homeStanding?.rank && awayStanding?.rank) {
    const delta = Number(awayStanding.rank) - Number(homeStanding.rank);
    lambdaHome += clamp(delta * 0.025, -0.20, 0.20);
    lambdaAway -= clamp(delta * 0.020, -0.16, 0.16);
  }

  lambdaHome = clamp(lambdaHome, 0.15, 3.5);
  lambdaAway = clamp(lambdaAway, 0.15, 3.5);

  const maxGoals = 7;
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pOver25 = 0;
  let pBtts = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = poisson(i, lambdaHome) * poisson(j, lambdaAway);
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
      if (i + j >= 3) pOver25 += p;
      if (i >= 1 && j >= 1) pBtts += p;
    }
  }

  const total = pHome + pDraw + pAway || 1;
  pHome /= total;
  pDraw /= total;
  pAway /= total;

  const pick = [
    { key: "1", value: pHome },
    { key: "X", value: pDraw },
    { key: "2", value: pAway },
  ].sort((a, b) => b.value - a.value)[0];

  return {
    expectedGoals: {
      home: round(lambdaHome, 2),
      away: round(lambdaAway, 2),
      total: round(lambdaHome + lambdaAway, 2),
    },
    probabilities: {
      homeWin: percent(pHome),
      draw: percent(pDraw),
      awayWin: percent(pAway),
      over25: percent(pOver25),
      btts: percent(pBtts),
    },
    pick: {
      market: "1X2",
      selection: pick.key,
      confidence: percent(pick.value),
    },
  };
}

function poisson(k, lambda) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function percent(v) {
  return round(clamp(v, 0, 1) * 100, 1);
}

function round(v, d = 2) {
  const p = Math.pow(10, d);
  return Math.round((Number(v) + Number.EPSILON) * p) / p;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, Number(v)));
}

/* =========================
   License helpers
   ========================= */
async function verifyLicenseCode(env, code) {
  try {
    const raw = base64UrlDecode(code);
    const parsed = JSON.parse(raw);
    const body = String(parsed.body || "");
    const sig = String(parsed.sig || "");
    if (!body || !sig) return { ok: false };

    const expected = await hmacSha256(env.LICENSE_SECRET, body);
    if (!timingSafeEqual(sig, expected)) return { ok: false };

    const payload = JSON.parse(body);
    if (!payload?.days) return { ok: false };
    return { ok: true, days: Number(payload.days) || 30 };
  } catch {
    return { ok: false };
  }
}

async function createLicenseCode(env, days = 30) {
  const body = JSON.stringify({ days, issuedAt: new Date().toISOString(), nonce: randomHex(8) });
  const sig = await hmacSha256(env.LICENSE_SECRET, body);
  return base64UrlEncode(JSON.stringify({ body, sig }));
}

/* =========================
   Stripe webhook
   ========================= */
async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: "STRIPE_NOT_CONFIGURED" }, 500);
  }

  const sig = request.headers.get("stripe-signature") || "";
  const rawBody = await request.text();

  const ok = await verifyStripeSignature(sig, rawBody, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: "INVALID_SIGNATURE" }, 400);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  if (event?.type === "checkout.session.completed") {
    const session = event?.data?.object || {};
    const email = normalizeEmail(
      session?.customer_details?.email || session?.customer_email || ""
    );

    if (email) {
      const row = await env.DB.prepare("SELECT paid_until FROM users WHERE email = ?")
        .bind(email)
        .first();

      if (row) {
        const now = Date.now();
        const current = row.paid_until ? Date.parse(row.paid_until) : 0;
        const base = Number.isFinite(current) && current > now ? current : now;
        const paidUntil = new Date(base + 30 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
          "UPDATE users SET paid_until = ?, paid_activated_at = COALESCE(paid_activated_at, ?) WHERE email = ?"
        )
          .bind(paidUntil, new Date().toISOString(), email)
          .run();
      }
    }
  }

  return json({ received: true });
}

async function verifyStripeSignature(sigHeader, payload, webhookSecret) {
  try {
    const parts = String(sigHeader || "").split(",");
    let timestamp = "";
    const signatures = [];

    for (const part of parts) {
      const [k, v] = part.split("=");
      if (k === "t") timestamp = v;
      if (k === "v1") signatures.push(v);
    }

    if (!timestamp || !signatures.length) return false;

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) return false;

    const expected = await hmacSha256Hex(webhookSecret, `${timestamp}.${payload}`);
    return signatures.some((s) => timingSafeEqual(s, expected));
  } catch {
    return false;
  }
}

/* =========================
   Crypto / misc
   ========================= */
function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key",
    "Access-Control-Expose-Headers": "x-cr-cache",
  };
}

function base64UrlEncode(s) {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(s) {
  let x = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (x.length % 4) x += "=";
  return decodeURIComponent(escape(atob(x)));
}

async function hmacSha256(secret, message) {
  return hmacSha256Hex(secret, message);
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(sigBuf));
}

function timingSafeEqual(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
