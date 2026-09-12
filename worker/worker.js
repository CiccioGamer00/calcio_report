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

    // ========== AUTH / LICENSE ROUTES ==========
    if (url.pathname === "/auth/register" && request.method === "POST")
      return handleRegister(request, env);
    if (url.pathname === "/auth/login" && request.method === "POST")
      return handleLogin(request, env);
    if (url.pathname === "/auth/me" && request.method === "GET")
      return handleMe(request, env);
    if (url.pathname === "/license/redeem" && request.method === "POST")
      return handleRedeem(request, env);

    // ========== ADMIN ROUTES ==========
    if (url.pathname === "/admin/mint" && request.method === "GET")
      return handleAdminMint(request, env);
    if (url.pathname === "/admin/users" && request.method === "GET")
      return handleAdminUsers(request, env);
    if (url.pathname === "/admin/note" && request.method === "POST")
      return handleAdminNote(request, env);
    if (url.pathname === "/admin/grant" && request.method === "POST")
      return handleAdminGrant(request, env);
    if (url.pathname === "/admin/adjust" && request.method === "POST")
      return handleAdminAdjust(request, env);
    if (url.pathname === "/admin/disable" && request.method === "POST")
      return handleAdminDisable(request, env);
    if (url.pathname === "/admin/stats" && request.method === "GET")
      return handleAdminStats(request, env);


    // ========== TELEMETRY ==========
    if (url.pathname === "/telemetry/ping" && request.method === "POST")
      return handleTelemetryPing(request, env);

    // ✅ ROUTE: /predict (Il cuore del tuo algoritmo)
    if (url.pathname === "/predict") {
      const gate = await requireActiveUser(request, env); // Aggiungi questo
      if (!gate.ok) return gate.res;
      return handlePredict(request, env);
    }

    // ========== DEFAULT PROXY: API-Football con Paywall ==========
    const gate = await requireActiveUser(request, env);
    if (!gate.ok) return gate.res;

    return proxyToApiSports(request, env, ctx);
  },
};

/* =========================
   AUTH: register/login/me
   ========================= */
async function handleRegister(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const password = String(body.password || "");

  if (!email || password.length < 6) {
    return json(
      {
        error: "BAD_INPUT",
        message: "Email valida e password min 6 caratteri.",
      },
      400,
      corsHeaders(),
    );
  }

  const exists = await env.DB.prepare("SELECT email FROM users WHERE email = ?")
    .bind(email)
    .first();

  if (exists) {
    return json(
      { error: "EMAIL_EXISTS", message: "Email già registrata. Fai login." },
      409,
      corsHeaders(),
    );
  }

  

  const now = Date.now();
  const trialEndsAt = now + 7 * 24 * 60 * 60 * 1000; // 7 giorni
  const passHash = await sha256(password);

  await env.DB.prepare(
    "INSERT INTO users (id, email, pass_hash, trial_ends_at, paid_until, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), email, passHash, trialEndsAt, 0, now)
    .run();

  const token = await signToken(env, { email, iat: now });

  return json(
    {
      ok: true,
      token,
      trialEndsAt,
      paidUntil: 0,
    },
    200,
    corsHeaders(),
  );
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const password = String(body.password || "");

  if (!email || !password) {
    return json(
      { error: "BAD_INPUT", message: "Email e password richieste." },
      400,
      corsHeaders(),
    );
  }

  const u = await env.DB.prepare(
    "SELECT email, pass_hash, trial_ends_at, paid_until FROM users WHERE email = ?",
  )
    .bind(email)
    .first();

  if (!u) {
    return json(
      { error: "LOGIN_FAILED", message: "Credenziali errate." },
      401,
      corsHeaders(),
    );
  }
  if (Number(u.disabled || 0) === 1) {
  return json(
    { error: "ACCOUNT_DISABLED", message: "Account disabilitato." },
    403,
    corsHeaders(),
  );
}

  const passHash = await sha256(password);
  if (passHash !== u.pass_hash) {
    return json(
      { error: "LOGIN_FAILED", message: "Credenziali errate." },
      401,
      corsHeaders(),
    );
  }

  const token = await signToken(env, { email, iat: Date.now() });

  return json(
    {
      ok: true,
      token,
      trialEndsAt: Number(u.trial_ends_at || 0),
      paidUntil: Number(u.paid_until || 0),
    },
    200,
    corsHeaders(),
  );
}

async function handleMe(request, env) {
  const token = readBearer(request);
  if (!token) return json({ ok: false }, 200, corsHeaders());

  const sess = await verifySignedToken(env, token);
  if (!sess?.email) return json({ ok: false }, 200, corsHeaders());

  const u = await env.DB.prepare(
    "SELECT email, trial_ends_at, paid_until FROM users WHERE email = ?",
  )
    .bind(sess.email)
    .first();

  if (!u) return json({ ok: false }, 200, corsHeaders());

  return json(
    {
      ok: true,
      email: u.email,
      trialEndsAt: Number(u.trial_ends_at || 0),
      paidUntil: Number(u.paid_until || 0),
      now: Date.now(),
    },
    200,
    corsHeaders(),
  );
}

/* =========================
   LICENSE: redeem (utente)
   =========================
   L'utente incolla un codice che TU gli dai dopo pagamento.
   Il codice è firmato con LICENSE_SECRET e contiene email + exp.
*/
async function handleRedeem(request, env) {
  const token = readBearer(request);
  if (!token) {
    return json({ error: "AUTH_REQUIRED" }, 401, corsHeaders());
  }
  const sess = await verifySignedToken(env, token);
  if (!sess?.email) {
    return json({ error: "AUTH_INVALID" }, 401, corsHeaders());
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  if (!code)
    return json(
      { error: "BAD_INPUT", message: "Codice mancante." },
      400,
      corsHeaders(),
    );

  const payload = await verifyLicenseCode(env, code);
  if (!payload?.email || !payload?.exp) {
    return json(
      { error: "CODE_INVALID", message: "Codice non valido." },
      400,
      corsHeaders(),
    );
  }
  if (normEmail(payload.email) !== normEmail(sess.email)) {
    return json(
      { error: "CODE_EMAIL_MISMATCH", message: "Codice non per questa email." },
      400,
      corsHeaders(),
    );
  }
  if (Date.now() > Number(payload.exp)) {
    return json(
      { error: "CODE_EXPIRED", message: "Codice scaduto." },
      400,
      corsHeaders(),
    );
  }

  // Attiva 30 giorni da adesso (o estendi se già attivo)
  const u = await env.DB.prepare("SELECT paid_until FROM users WHERE email = ?")
    .bind(sess.email)
    .first();

  const now = Date.now();
  const currentPaid = Number(u?.paid_until || 0);
  const base = Math.max(now, currentPaid);
  const newPaidUntil = base + 30 * 24 * 60 * 60 * 1000;

  await env.DB.prepare("UPDATE users SET paid_until = ? WHERE email = ?")
    .bind(newPaidUntil, sess.email)
    .run();

  return json({ ok: true, paidUntil: newPaidUntil, now }, 200, corsHeaders());
}

/* =========================
   ADMIN: mint code (tu)
   =========================
   GET /admin/mint?email=...  header: x-admin-key
   Ritorna un codice da mandare all'utente.
*/
async function handleAdminMint(request, env) {
  if (!isAdmin(request, env))
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());

  const url = new URL(request.url);
  const email = normEmail(url.searchParams.get("email"));
  if (!email)
    return json(
      { error: "BAD_INPUT", message: "email mancante" },
      400,
      corsHeaders(),
    );

  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // il codice vale 7 giorni (tempo per inserirlo)
  const code = await makeLicenseCode(env, { email, exp });

  return json({ ok: true, email, exp, code }, 200, corsHeaders());
}
async function handleAdminUsers(request, env) {
  if (!isAdmin(request, env)) {
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());
  }

  const rows = await env.DB.prepare(
    `
    SELECT email, trial_ends_at, paid_until, created_at, note,
           COALESCE(last_seen_at, 0) as last_seen_at,
           COALESCE(paid_activated_at, 0) as paid_activated_at,
           COALESCE(disabled, 0) as disabled
    FROM users
    WHERE COALESCE(disabled, 0) = 0
    ORDER BY COALESCE(last_seen_at, 0) DESC, created_at DESC
  `,
  ).all();

  const now = Date.now();

  const users = (rows.results || []).map((u) => {
    const trialEndsAt = Number(u.trial_ends_at || 0);
    const paidUntil = Number(u.paid_until || 0);

    let status = "SCADUTO";
    if (now < paidUntil) status = "PRO";
    else if (now < trialEndsAt) status = "TRIAL";

    return {
      email: u.email,
      trialEndsAt,
      paidUntil,
      createdAt: u.created_at,
      status,
      note: u.note || "",
      lastSeenAt: Number(u.last_seen_at || 0),
      paidActivatedAt: Number(u.paid_activated_at || 0),
    };
  });

  return json({ ok: true, users }, 200, corsHeaders());
}
async function handleAdminNote(request, env) {
  if (!isAdmin(request, env)) {
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());
  }

  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const note = String(body.note || "");

  if (!email) {
    return json(
      { error: "BAD_INPUT", message: "email mancante" },
      400,
      corsHeaders(),
    );
  }

  await env.DB.prepare("UPDATE users SET note = ? WHERE email = ?")
    .bind(note, email)
    .run();

  return json({ ok: true }, 200, corsHeaders());
}

/* =========================
   ADMIN: grant 30d (tu)
   =========================
   POST /admin/grant {email}  header: x-admin-key
*/
async function handleAdminGrant(request, env) {
  if (!isAdmin(request, env))
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());

  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  if (!email)
    return json(
      { error: "BAD_INPUT", message: "email mancante" },
      400,
      corsHeaders(),
    );

  const u = await env.DB.prepare("SELECT paid_until FROM users WHERE email = ?")
    .bind(email)
    .first();

  const now = Date.now();
  const currentPaid = Number(u?.paid_until || 0);
  const base = Math.max(now, currentPaid);
  const newPaidUntil = base + 30 * 24 * 60 * 60 * 1000;

  await env.DB.prepare("UPDATE users SET paid_until = ?, paid_activated_at = ? WHERE email = ?")
    .bind(newPaidUntil, Date.now(), email)
    .run();

  return json({ ok: true, email, paidUntil: newPaidUntil }, 200, corsHeaders());
}
async function handleAdminAdjust(request, env) {
  if (!isAdmin(request, env)) {
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());
  }

  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const deltaDays = parseInt(body.deltaDays, 10);

  if (!email || !Number.isFinite(deltaDays)) {
    return json(
      { error: "BAD_INPUT", message: "email e deltaDays richiesti" },
      400,
      corsHeaders(),
    );
  }

  // Limite di sicurezza: max +/- 365 giorni
  if (deltaDays < -365 || deltaDays > 365) {
    return json(
      { error: "BAD_INPUT", message: "deltaDays fuori limite (+/-365)" },
      400,
      corsHeaders(),
    );
  }

  const row = await env.DB.prepare(
    "SELECT paid_until FROM users WHERE email = ?",
  )
    .bind(email)
    .first();

  if (!row) {
    return json(
      { error: "NOT_FOUND", message: "Utente non trovato" },
      404,
      corsHeaders(),
    );
  }

  const now = Date.now();
  const currentPaid = Number(row.paid_until || 0);
  const wasPro = now < currentPaid;
  const deltaMs = deltaDays * 24 * 60 * 60 * 1000;

  let newPaidUntil;

  if (deltaDays >= 0) {
    // aggiunta: estende da adesso o da fine attuale
    const base = Math.max(now, currentPaid);
    newPaidUntil = base + deltaMs;
  } else {
    // rimozione: toglie dalla scadenza attuale (anche se va sotto "now")
    newPaidUntil = Math.max(0, currentPaid + deltaMs);
  }

  // Se stiamo attivando PRO (prima non pro, ora aggiungiamo giorni), salviamo timestamp
  const shouldSetActivated = deltaDays > 0 && !wasPro;
  if (shouldSetActivated) {
    await env.DB.prepare("UPDATE users SET paid_activated_at = ? WHERE email = ?")
      .bind(now, email)
      .run();
  }

  await env.DB.prepare("UPDATE users SET paid_until = ? WHERE email = ?")
    .bind(newPaidUntil, email)
    .run();

  return json({ ok: true, email, paidUntil: newPaidUntil }, 200, corsHeaders());
}

/* =========================
   ADMIN: disable/enable user (soft delete)
   POST /admin/disable {email, disabled:1|0}  header: x-admin-key
   ========================= */
async function handleAdminDisable(request, env) {
  if (!isAdmin(request, env)) {
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());
  }

  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const disabled = body.disabled ? 1 : 0;

  if (!email) {
    return json(
      { error: "BAD_INPUT", message: "email mancante" },
      400,
      corsHeaders(),
    );
  }

  await env.DB.prepare("UPDATE users SET disabled = ? WHERE email = ?")
    .bind(disabled, email)
    .run();

  return json({ ok: true, email, disabled }, 200, corsHeaders());
}

/* =========================
   ADMIN: stats dashboard
   GET /admin/stats  header: x-admin-key
   ========================= */
async function handleAdminStats(request, env) {
  if (!isAdmin(request, env)) {
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());
  }

  const now = Date.now();
  const onlineCutoff = now - 5 * 60 * 1000; // 5 minuti
  const dayCutoff = now - 24 * 60 * 60 * 1000;
  const weekCutoff = now - 7 * 24 * 60 * 60 * 1000;

  const onlineRow = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE COALESCE(disabled,0)=0 AND COALESCE(last_seen_at,0) >= ?",
  )
    .bind(onlineCutoff)
    .first();

  const active24Row = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE COALESCE(disabled,0)=0 AND COALESCE(last_seen_at,0) >= ?",
  )
    .bind(dayCutoff)
    .first();

  const active7dRow = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE COALESCE(disabled,0)=0 AND COALESCE(last_seen_at,0) >= ?",
  )
    .bind(weekCutoff)
    .first();

  const newPro24Row = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE COALESCE(disabled,0)=0 AND COALESCE(paid_activated_at,0) >= ?",
  )
    .bind(dayCutoff)
    .first();

  return json(
    {
      ok: true,
      now,
      online5m: Number(onlineRow?.c || 0),
      active24h: Number(active24Row?.c || 0),
      active7d: Number(active7dRow?.c || 0),
      newPro24h: Number(newPro24Row?.c || 0),
    },
    200,
    corsHeaders(),
  );
}

/* =========================
   TELEMETRY: ping (online)
   POST /telemetry/ping   Authorization: Bearer <token>
   ========================= */
async function handleTelemetryPing(request, env) {
  const gate = await requireActiveUser(request, env);
  if (!gate.ok) return gate.res;

  const now = Date.now();
  await env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE email = ?")
    .bind(now, gate.email)
    .run();

  return json({ ok: true, ts: now }, 200, corsHeaders());
}


function isAdmin(request, env) {
  const k = request.headers.get("x-admin-key") || "";
  return k && env.ADMIN_KEY && k === env.ADMIN_KEY;
}

/* =========================
   /predict handler (TUO, INVARIATO)
   ========================= */

async function handlePredict(request, env) {
  const url = new URL(request.url);

  const fixtureId = url.searchParams.get("fixture");
  const nRaw = url.searchParams.get("n");
  let n = parseInt(nRaw || "10", 10);

  // Dixon–Coles rho (default -0.10). Clamp per evitare valori assurdi.
  let rho = parseFloat(url.searchParams.get("rho") || "-0.10");
  if (!Number.isFinite(rho)) rho = -0.1;
  rho = Math.max(-0.3, Math.min(0.3, rho));

  if (!Number.isFinite(n) || n < 5) n = 10;
  if (n > 20) n = 20;

  if (!fixtureId) {
    return json(
      { response: null, errors: { fixture: "missing" } },
      400,
      corsHeaders(),
    );
  }

  // CACHE helper condiviso con il proxy pubblico.
  async function af(pathWithQuery, ttlSeconds = 0) {
    const apiUrl = new URL(pathWithQuery, request.url);
    const { response: res } = await fetchApiFootballCached(
      apiUrl,
      env,
      ttlSeconds,
    );
    const j = await res.json().catch(() => null);

    if (!res.ok) throw new Error(`API HTTP ${res.status}`);
    if (hasApiSportsErrors(j)) throw new Error("API errors");

    return Array.isArray(j.response) ? j.response : [];
  }

  function goalsForAgainst(teamId, fx) {
    const hId = fx?.teams?.home?.id ?? null;
    const aId = fx?.teams?.away?.id ?? null;
    const gh = Number(fx?.goals?.home ?? 0);
    const ga = Number(fx?.goals?.away ?? 0);

    if (teamId === hId) return { gf: gh, ga: ga, isHome: true };
    if (teamId === aId) return { gf: ga, ga: gh, isHome: false };
    return { gf: 0, ga: 0, isHome: null };
  }

  function avg(nums) {
    const arr = (nums || []).filter((x) => Number.isFinite(x));
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function poissonPmf(k, lambda) {
    const L = Math.max(0, Number(lambda) || 0);
    const e = Math.exp(-L);
    let fact = 1;
    for (let i = 2; i <= k; i++) fact *= i;
    return (e * Math.pow(L, k)) / fact;
  }

  function clamp(x, a, b) {
    const nn = Number(x) || 0;
    return Math.max(a, Math.min(b, nn));
  }

  function nOr0(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : 0;
  }

  function tauDC(i, j, lambdaH, lambdaA, rho) {
    // Standard Dixon–Coles low-score adjustment
    if (i === 0 && j === 0) return 1 - lambdaH * lambdaA * rho;
    if (i === 0 && j === 1) return 1 + lambdaH * rho;
    if (i === 1 && j === 0) return 1 + lambdaA * rho;
    if (i === 1 && j === 1) return 1 - rho;
    return 1;
  }

  try {
    // TTL consigliati (come avevamo detto)
    const TTL_STATS = 6 * 3600;
    const TTL_LEAGUE50 = 30 * 60;
    const TTL_TEAM_LAST = 10 * 60;
    const TTL_FIXTURE = 30 * 60;

    // 1) fixture details
    const fxArr = await af(
      `/fixtures?id=${encodeURIComponent(fixtureId)}&timezone=Europe/Rome`,
      TTL_FIXTURE,
    );

    if (!fxArr.length) {
      return json(
        { response: null, errors: { fixture: "not_found" } },
        404,
        corsHeaders(),
      );
    }

    const fx = fxArr[0];
    const homeId = fx?.teams?.home?.id ?? null;
    const awayId = fx?.teams?.away?.id ?? null;
    const leagueId = fx?.league?.id ?? null;
    const season = fx?.league?.season ?? null;

    if (!homeId || !awayId || !leagueId || !season) {
      return json(
        { response: null, errors: { fixture: "missing_fields" } },
        422,
        corsHeaders(),
      );
    }

    // 2) stats stagione (cache 6 ore)
    const [homeSeasonArr, awaySeasonArr] = await Promise.all([
      af(
        `/teams/statistics?team=${homeId}&league=${leagueId}&season=${season}`,
        TTL_STATS,
      ),
      af(
        `/teams/statistics?team=${awayId}&league=${leagueId}&season=${season}`,
        TTL_STATS,
      ),
    ]);

    const homeSeason = homeSeasonArr?.[0] || null;
    const awaySeason = awaySeasonArr?.[0] || null;

    // 3) ultime N (cache 10 min)
    const [homeLast, awayLast] = await Promise.all([
      af(
        `/fixtures?team=${homeId}&league=${leagueId}&season=${season}&last=${n}&status=FT&timezone=Europe/Rome`,
        TTL_TEAM_LAST,
      ),
      af(
        `/fixtures?team=${awayId}&league=${leagueId}&season=${season}&last=${n}&status=FT&timezone=Europe/Rome`,
        TTL_TEAM_LAST,
      ),
    ]);

    const homeCtx = homeLast.filter(
      (m) => (m?.teams?.home?.id ?? null) === homeId,
    );
    const awayCtx = awayLast.filter(
      (m) => (m?.teams?.away?.id ?? null) === awayId,
    );

    const homeUse = homeCtx.length >= 3 ? homeCtx : homeLast;
    const awayUse = awayCtx.length >= 3 ? awayCtx : awayLast;

    const homeGF = homeUse.map((m) => goalsForAgainst(homeId, m).gf);
    const homeGA = homeUse.map((m) => goalsForAgainst(homeId, m).ga);
    const awayGF = awayUse.map((m) => goalsForAgainst(awayId, m).gf);
    const awayGA = awayUse.map((m) => goalsForAgainst(awayId, m).ga);

    const recentHomeGF = avg(homeGF);
    const recentHomeGA = avg(homeGA);
    const recentAwayGF = avg(awayGF);
    const recentAwayGA = avg(awayGA);

    // 4) medie lega ultime 50 (cache 30 min)
    let leagueHomeGoals = 1.25;
    let leagueAwayGoals = 1.05;
    try {
      const leagueLast = await af(
        `/fixtures?league=${leagueId}&season=${season}&last=50&status=FT&timezone=Europe/Rome`,
        TTL_LEAGUE50,
      );
      if (leagueLast && leagueLast.length) {
        leagueHomeGoals = avg(
          leagueLast.map((m) => Number(m?.goals?.home ?? 0)),
        );
        leagueAwayGoals = avg(
          leagueLast.map((m) => Number(m?.goals?.away ?? 0)),
        );
      }
    } catch (_) {}

    // medie stagione contestuali
    const seasonHomeGF = nOr0(homeSeason?.goals?.for?.average?.home);
    const seasonHomeGA = nOr0(homeSeason?.goals?.against?.average?.home);
    const seasonAwayGF = nOr0(awaySeason?.goals?.for?.average?.away);
    const seasonAwayGA = nOr0(awaySeason?.goals?.against?.average?.away);

    const safeSeasonHomeGF = seasonHomeGF > 0 ? seasonHomeGF : recentHomeGF;
    const safeSeasonHomeGA = seasonHomeGA > 0 ? seasonHomeGA : recentHomeGA;
    const safeSeasonAwayGF = seasonAwayGF > 0 ? seasonAwayGF : recentAwayGF;
    const safeSeasonAwayGA = seasonAwayGA > 0 ? seasonAwayGA : recentAwayGA;

    const W_SEASON = 0.7;
    const W_RECENT = 0.3;

    const blendHomeGF = W_SEASON * safeSeasonHomeGF + W_RECENT * recentHomeGF;
    const blendHomeGA = W_SEASON * safeSeasonHomeGA + W_RECENT * recentHomeGA;
    const blendAwayGF = W_SEASON * safeSeasonAwayGF + W_RECENT * recentAwayGF;
    const blendAwayGA = W_SEASON * safeSeasonAwayGA + W_RECENT * recentAwayGA;

    const attHome = leagueHomeGoals > 0 ? blendHomeGF / leagueHomeGoals : 1;
    const defAway = leagueHomeGoals > 0 ? blendAwayGA / leagueHomeGoals : 1;
    const attAway = leagueAwayGoals > 0 ? blendAwayGF / leagueAwayGoals : 1;
    const defHome = leagueAwayGoals > 0 ? blendHomeGA / leagueAwayGoals : 1;

    const HOME_ADV = 1.07;

    let lambdaHome = leagueHomeGoals * attHome * defAway * HOME_ADV;
    let lambdaAway = leagueAwayGoals * attAway * defHome;

    lambdaHome = clamp(lambdaHome, 0.2, 3.2);
    lambdaAway = clamp(lambdaAway, 0.2, 3.2);

    // 5) matrice 0..5 + Dixon–Coles
    const maxG = 5;
    const ph = Array.from({ length: maxG + 1 }, (_, k) =>
      poissonPmf(k, lambdaHome),
    );
    const pa = Array.from({ length: maxG + 1 }, (_, k) =>
      poissonPmf(k, lambdaAway),
    );

    let homeWinRaw = 0,
      drawRaw = 0,
      awayWinRaw = 0;
    let over25Raw = 0,
      bttsYesRaw = 0;

    const scorelines = [];
    let sumMatrix = 0;

    for (let i = 0; i <= maxG; i++) {
      for (let j = 0; j <= maxG; j++) {
        let p = ph[i] * pa[j];

        const t = tauDC(i, j, lambdaHome, lambdaAway, rho);
        p = p * t;
        if (p < 0) p = 0;

        sumMatrix += p;

        if (i > j) homeWinRaw += p;
        else if (i === j) drawRaw += p;
        else awayWinRaw += p;

        if (i + j >= 3) over25Raw += p;
        if (i >= 1 && j >= 1) bttsYesRaw += p;

        scorelines.push({ score: `${i}-${j}`, p });
      }
    }

    const denom = sumMatrix > 0 ? sumMatrix : 1;

    const homeWin = homeWinRaw / denom;
    const draw = drawRaw / denom;
    const awayWin = awayWinRaw / denom;
    // ===== Confidence / Risk (bookmaker-style) =====
    // Basato su EDGE: differenza tra 1° e 2° esito 1X2.
    // Più edge = più confidence (più "bookmaker").
    function clamp01(x) {
      return Math.max(0, Math.min(1, x));
    }

    const probs = [
      Number(homeWin) || 0,
      Number(draw) || 0,
      Number(awayWin) || 0,
    ].sort((a, b) => b - a);

    const pMax = probs[0] || 0;
    const pSecond = probs[1] || 0;

    const edge = Math.max(0, pMax - pSecond); // 0..1

    // Mapping semplice e leggibile:
    // edge 0.00 -> 0
    // edge 0.10 -> 25
    // edge 0.20 -> 50
    // edge 0.30 -> 75
    // edge 0.40+ -> 100
    const scoreRaw = (edge / 0.4) * 100;
    const confidenceScore = Math.round(clamp01(scoreRaw / 100) * 100);

    // Labels
    let confidenceLabel = "Media";
    let riskLabel = "Medio";
    if (confidenceScore >= 75) {
      confidenceLabel = "Alta";
      riskLabel = "Basso";
    } else if (confidenceScore >= 55) {
      confidenceLabel = "Medio-Alta";
      riskLabel = "Medio-Basso";
    } else if (confidenceScore >= 35) {
      confidenceLabel = "Media";
      riskLabel = "Medio";
    } else {
      confidenceLabel = "Bassa";
      riskLabel = "Alto";
    }

    // Nota breve
    const edgePct = Math.round(edge * 100);
    const confidenceNote =
      confidenceScore >= 75
        ? `Esito principale abbastanza favorito (edge ${edgePct}%).`
        : confidenceScore <= 35
          ? `Quote vicine: partita più incerta (edge ${edgePct}%).`
          : `Vantaggio moderato per l’esito principale (edge ${edgePct}%).`;
    // extras normalizzati su denom
    const over25 = over25Raw / denom;
    const bttsYes = bttsYesRaw / denom;

    // top scorelines normalizzate su denom
    scorelines.sort((a, b) => b.p - a.p);
    const topScorelines = scorelines.slice(0, 3).map((x) => ({
      score: x.score,
      p: x.p / denom,
    }));

    // drivers (lasciati come prima, ma puliti)
    function pushDriver(list, factor, impact, note) {
      list.push({ factor, impact, note });
    }

    const drivers = [];
    const sumLambda = (Number(lambdaHome) || 0) + (Number(lambdaAway) || 0);
    if (sumLambda >= 3.0)
      pushDriver(
        drivers,
        "Totale gol atteso alto",
        "+",
        "Modello vede gara aperta (probabilità Over/BTTS cresce).",
      );
    else if (sumLambda <= 2.1)
      pushDriver(
        drivers,
        "Totale gol atteso basso",
        "-",
        "Modello vede gara chiusa (crescono 0-0 / 1-0 / 0-1).",
      );

    pushDriver(
      drivers,
      "Fattore campo",
      "+",
      `Home advantage applicato: x${HOME_ADV}`,
    );
    pushDriver(
      drivers,
      "Dixon–Coles",
      "+",
      `Correzione low-score attiva (rho=${rho}).`,
    );

    return json(
      {
        response: {
          model: {
            name: "poisson_v1_3_dc_cached",
            maxGoals: maxG,
            nUsed: n,
            wSeason: 0.7,
            wRecent: 0.3,
            rho,
          },

          confidence: {
            score: confidenceScore,
            level: confidenceLabel,
            risk: riskLabel,
            note: confidenceNote,
          },

          expectedGoals: { home: lambdaHome, away: lambdaAway },
          probabilities: { homeWin, draw, awayWin },
          topScorelines,
          extras: { over25, bttsYes },
          drivers,
        },
        errors: null,
      },
      200,
      corsHeaders(),
    );
  } catch (e) {
    return json(
      { response: null, errors: { predict: String(e.message || e) } },
      500,
      corsHeaders(),
    );
  }
}
// =========================
// CACHE POLICY (edge cache)
// =========================

// TTL in secondi in base alla rotta (conservativi ma efficaci)
function cacheTtlFor(pathname, searchParams) {
  if (pathname === "/standings") return 60 * 10; // 10 min
  // NON cacheare mai rotte auth/admin (non passano qui, ma per sicurezza)
  if (pathname.startsWith("/auth/") || pathname.startsWith("/admin/")) return 0;

  // Endpoint super-ripetuti e costosi (gold)
  if (pathname === "/fixtures/events") return 60 * 5; // 5 min
  if (pathname === "/fixtures/statistics") return 60 * 10; // 10 min

  // Fixture details: cambia poco, ottimo per cache
  if (pathname === "/fixtures") {
    // se è per id singolo, cache più lunga
    if (searchParams.has("id") || searchParams.has("fixture")) return 60 * 10; // 10 min
    // liste fixtures (team/last/next): più breve
    return 60 * 3; // 3 min
  }

  // Injuries / players sono pesanti: cache media
  if (pathname === "/injuries") return 60 * 10; // 10 min
  if (pathname === "/players") return 60 * 30; // 30 min

  // Teams search: molto ripetuto
  if (pathname === "/teams") return 60 * 60; // 60 min

  // Default: niente cache
  return 0;
}

// Rileva errori semantici API-Football anche quando l'HTTP è 200.
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

// Cache key V2:
// - condivisa tra utenti (Authorization esclusa)
// - query string canonica
// - namespace relay dedicato, così il primo test non può usare risposte create
//   dal vecchio trasporto diretto.
function makeCacheKey(requestUrl) {
  const src = new URL(requestUrl);
  const cacheUrl = new URL(src.origin);

  cacheUrl.pathname = `/__cr_cache_relay_v1__${src.pathname}`;
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

// Unico trasporto ammesso dal Worker verso API-Football:
// cache Cloudflare -> relay OVH firmato HMAC -> API-Football.
async function fetchRelay(pathWithQuery, env) {
  const relayBase = String(env.CR_RELAY_URL || "").trim();
  const relaySecret = String(env.CR_RELAY_SECRET || "").trim();

  if (!relayBase || !relaySecret) {
    throw new Error("Relay non configurato");
  }

  const relayOrigin = new URL(relayBase);
  const relayUrl = new URL(pathWithQuery, relayOrigin.origin);
  const signedPath = `${relayUrl.pathname}${relayUrl.search}`;
  const timestamp = String(Date.now());
  const canonical = `${timestamp}\nGET\n${signedPath}`;
  const signature = await hmacSha256Hex(relaySecret, canonical);

  return fetch(relayUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-cr-timestamp": timestamp,
      "x-cr-signature": signature,
    },
  });
}

async function fetchApiFootballCached(requestUrl, env, ttlSeconds = 0, ctx) {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  const cache = caches.default;
  const cacheKey = makeCacheKey(url.toString());

  if (ttlSeconds > 0) {
    const cached = await cache.match(cacheKey);
    if (cached) return { response: cached, cacheStatus: "HIT" };
  }

  const pathWithQuery = `${url.pathname}${url.search}`;
  const relayRes = await fetchRelay(pathWithQuery, env);
  const bodyText = await relayRes.text();

  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {}

  const semanticOk =
    relayRes.ok && parsed !== null && !hasApiSportsErrors(parsed);
  const responseHeaders = new Headers(relayRes.headers);
  responseHeaders.set(
    "x-cr-relay",
    relayRes.headers.get("x-cr-relay") || "missing",
  );

  if (semanticOk && ttlSeconds > 0) {
    responseHeaders.set("Cache-Control", `public, s-maxage=${ttlSeconds}`);
  } else {
    responseHeaders.set("Cache-Control", "no-store");
  }

  const response = new Response(bodyText, {
    status: relayRes.status,
    statusText: relayRes.statusText,
    headers: responseHeaders,
  });

  if (semanticOk && ttlSeconds > 0) {
    const putPromise = cache.put(cacheKey, response.clone());
    if (ctx?.waitUntil) ctx.waitUntil(putPromise);
    else await putPromise;
  }

  return { response, cacheStatus: "MISS" };
}

/* =========================
   Proxy default (con gate)
   ========================= */
async function proxyToApiSports(request, env, ctx) {
  const url = new URL(request.url);
  const ttl = cacheTtlFor(url.pathname, url.searchParams);

  let response;
  let cacheStatus = "MISS";
  try {
    ({ response, cacheStatus } = await fetchApiFootballCached(
      url,
      env,
      ttl,
      ctx,
    ));
  } catch (err) {
    return json(
      {
        error: "UPSTREAM_NETWORK",
        message: String(err?.message || err || "Relay non raggiungibile"),
      },
      502,
      {
        ...corsHeaders(),
        "Cache-Control": "no-store",
        "x-cr-cache": "MISS",
        "x-cr-relay": "0",
      },
    );
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

// helper: evita crash se waitUntil non esiste (dipende dal runtime)
function eventWaitUntilSafe(promise) {
  try {
    // in Cloudflare Workers fetch handler non abbiamo accesso diretto a ctx qui,
    // quindi best-effort senza bloccare la response.
    promise.catch(() => {});
  } catch {}
}

/* =========================
   Token signing (semplice)
   ========================= */
async function signToken(env, payload) {
  const body = base64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256(env.LICENSE_SECRET, body);
  return `${body}.${sig}`;
}

async function verifySignedToken(env, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmacSha256(env.LICENSE_SECRET, body);
  if (!timingSafeEq(sig, expected)) return null;
  try {
    return JSON.parse(base64urlDecode(body));
  } catch {
    return null;
  }
}

/* =========================
   License code (email+exp)
   ========================= */
async function makeLicenseCode(env, payload) {
  const body = base64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256(env.LICENSE_SECRET, body);
  return `${body}.${sig}`;
}

async function verifyLicenseCode(env, code) {
  const parts = String(code || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmacSha256(env.LICENSE_SECRET, body);
  if (!timingSafeEq(sig, expected)) return null;
  try {
    return JSON.parse(base64urlDecode(body));
  } catch {
    return null;
  }
}

/* =========================
   Helpers
   ========================= */
function readBearer(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function normEmail(s) {
  const e = String(s || "")
    .trim()
    .toLowerCase();
  return e.includes("@") ? e : "";
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(hash);
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return base64urlFromBytes(new Uint8Array(sigBuf));
}

function bufToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function base64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  return base64urlFromBytes(bytes);
}

function base64urlDecode(s) {
  const b64 =
    String(s).replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEq(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key",
    "Access-Control-Expose-Headers": "x-cr-cache, x-cr-relay",
  };
}

function json(obj, status = 200, extraHeaders = {}) {
  const h = new Headers({ "content-type": "application/json; charset=utf-8" });
  for (const [k, v] of Object.entries(extraHeaders || {})) h.set(k, v);
  return new Response(JSON.stringify(obj), { status, headers: h });
}
async function requireActiveUser(request, env) {
  const token = readBearer(request);
  if (!token) {
    return {
      ok: false,
      res: json(
        { error: "AUTH_REQUIRED", message: "Login necessario." },
        401,
        corsHeaders(),
      ),
    };
  }

  const sess = await verifySignedToken(env, token);
  if (!sess?.email) {
    return {
      ok: false,
      res: json(
        { error: "AUTH_INVALID", message: "Sessione scaduta o non valida." },
        401,
        corsHeaders(),
      ),
    };
  }

  const u = await env.DB.prepare(
    "SELECT trial_ends_at, paid_until, COALESCE(disabled,0) as disabled FROM users WHERE email = ?",
  )
    .bind(sess.email)
    .first();

  if (!u) {
    return {
      ok: false,
      res: json({ error: "USER_NOT_FOUND" }, 404, corsHeaders()),
    };
  }

  const now = Date.now();
  const trialEnds = Number(u.trial_ends_at || 0);
  const paidUntil = Number(u.paid_until || 0);

  if (now > trialEnds && now > paidUntil) {
    return {
      ok: false,
      res: json(
        {
          error: "PAYWALL",
          message: "Periodo di prova scaduto e nessun abbonamento attivo.",
          trialEndsAt: trialEnds,
          paidUntil: paidUntil,
        },
        402,
        corsHeaders(),
      ),
    };
  }

  return { ok: true, email: sess.email };
}
/* =========================
   STRIPE WEBHOOK: attiva PRO automatico
   Env: STRIPE_WEBHOOK_SECRET = whsec_...
   Event: checkout.session.completed
   ========================= */

async function handleStripeWebhook(request, env) {
  const sig = request.headers.get("stripe-signature") || "";
  const rawBody = await request.text();

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Missing STRIPE_WEBHOOK_SECRET", { status: 500 });
  }

  const ok = await verifyStripeSignature(sig, rawBody, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response("Invalid signature", { status: 400 });

  let evt;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const type = String(evt?.type || "");
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return new Response("Ignored", { status: 200 });
  }

  const session = evt?.data?.object || {};
  const email = normEmail(session?.customer_details?.email || session?.customer_email || "");
  if (!email) return new Response("No email", { status: 200 });

  // Estendi di 30 giorni (se già PRO, estende da fine)
  const row = await env.DB.prepare("SELECT paid_until FROM users WHERE email = ?")
    .bind(email)
    .first();

  const now = Date.now();
  const currentPaid = Number(row?.paid_until || 0);
  const base = Math.max(now, currentPaid);
  const newPaidUntil = base + 30 * 24 * 60 * 60 * 1000;

  if (!row) {
    // Se l’utente non è ancora registrato, lo creiamo “vuoto”:
    // così quando si registra con la stessa email risulta già PRO.
    await env.DB.prepare(
      "INSERT INTO users (id, email, pass_hash, trial_ends_at, paid_until, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(crypto.randomUUID(), email, "", 0, newPaidUntil, now)
      .run();
  } else {
    await env.DB.prepare("UPDATE users SET paid_until = ? WHERE email = ?")
      .bind(newPaidUntil, email)
      .run();
  }

  return new Response("OK", { status: 200 });
}

async function verifyStripeSignature(sigHeader, payload, webhookSecret) {
  // Stripe-Signature: t=timestamp,v1=hexsignature,...
  const parts = String(sigHeader || "").split(",").map(s => s.trim());
  const tPart = parts.find(p => p.startsWith("t=")) || "";
  const v1Part = parts.find(p => p.startsWith("v1=")) || "";

  const t = tPart.split("=")[1];
  const v1 = v1Part.split("=")[1];
  if (!t || !v1) return false;

  // anti-replay: 5 minuti
  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const signed = `${t}.${payload}`;
  const expectedHex = await hmacSha256Hex(webhookSecret, signed);

  return timingSafeEq(v1, expectedHex);
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
  const bytes = new Uint8Array(sigBuf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
  

