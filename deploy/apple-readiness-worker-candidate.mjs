// worker/worker.js
var worker_default = {
  // Internal adapter used only by the separate Apple test entry point.
  // This does not expose a route or bypass expired-session/password checks.
  async authenticatePurchaseAccount(request, env) {
    const token = readBearer(request);
    if (!token) return null;
    const sess = await verifySignedToken(env, token);
    if (!sess?.email) return null;
    const u = await env.DB.prepare(
      "SELECT id, created_at, pass_hash, COALESCE(disabled,0) as disabled FROM users WHERE email = ?"
    ).bind(sess.email).first();
    if (!u || Number(u.disabled) !== 0 || !sessionBelongsToAccount(sess, u) || !await sessionPasswordVersionMatches(env, sess, u.pass_hash)) return null;
    return { id: u.id, createdAt: u.created_at };
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (url.pathname === "/stripe/webhook" && request.method === "POST") {
      return handleStripeWebhook(request, env);
    }
    if (url.pathname === "/auth/register" && request.method === "POST")
      return handleRegister(request, env);
    if (url.pathname === "/auth/login" && request.method === "POST")
      return handleLogin(request, env);
    if (url.pathname === "/auth/forgot" && request.method === "POST")
      return handleForgotPassword(request, env, ctx);
    if (url.pathname === "/auth/reset" && request.method === "POST")
      return handleResetPassword(request, env);
    if (url.pathname === "/auth/delete" && request.method === "POST")
      return handleDeleteAccount(request, env);
    if (url.pathname === "/auth/me" && request.method === "GET")
      return handleMe(request, env);
    if (url.pathname === "/license/redeem" && request.method === "POST")
      return handleRedeem(request, env);
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
    if (url.pathname === "/telemetry/ping" && request.method === "POST")
      return handleTelemetryPing(request, env);
    if (url.pathname === "/predict") {
      const gate2 = await requireActiveUser(request, env);
      if (!gate2.ok) return gate2.res;
      return handlePredict(request, env);
    }
    const gate = await requireActiveUser(request, env);
    if (!gate.ok) return gate.res;
    return proxyToApiSports(request, env, ctx);
  }
};
var AUTH_SESSION_MS = 6 * 60 * 60 * 1e3;
var PASSWORD_RESET_TTL_MS = 20 * 60 * 1e3;
var PASSWORD_RESET_TOKEN_SCOPE = "password-reset-v1";
var SESSION_PASSWORD_VERSION_SCOPE = "session-password-version-v1";
var RESET_PASSWORD_VERSION_SCOPE = "reset-password-version-v1";
var PASSWORD_RESET_GENERIC_MESSAGE = "Se l'email \xE8 registrata, riceverai un link per reimpostare la password.";
var PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
var PASSWORD_PBKDF2_ITERATIONS = 2e4;
var PASSWORD_SALT_BYTES = 16;
var PASSWORD_HASH_BYTES = 32;
async function handleRegister(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const password = String(body.password || "");
  if (!email || password.length < 6) {
    return json(
      {
        error: "BAD_INPUT",
        message: "Email valida e password min 6 caratteri."
      },
      400,
      corsHeaders()
    );
  }
  const exists = await env.DB.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (exists) {
    return json(
      { error: "EMAIL_EXISTS", message: "Email gi\xE0 registrata. Fai login." },
      409,
      corsHeaders()
    );
  }
  const now = Date.now();
  const accountId = crypto.randomUUID();
  const trialEndsAt = now + 7 * 24 * 60 * 60 * 1e3;
  const passHash = passwordV2Enabled(env) ? await hashPassword(password) : await sha256(password);
  await env.DB.prepare(
    "INSERT INTO users (id, email, pass_hash, trial_ends_at, paid_until, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(accountId, email, passHash, trialEndsAt, 0, now).run();
  const token = await makeSessionToken(env, email, passHash, now, accountId);
  return json(
    {
      ok: true,
      token,
      trialEndsAt,
      paidUntil: 0
    },
    200,
    corsHeaders()
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
      corsHeaders()
    );
  }
  const u = await env.DB.prepare(
    "SELECT id, created_at, email, pass_hash, trial_ends_at, paid_until, COALESCE(disabled,0) as disabled FROM users WHERE email = ?"
  ).bind(email).first();
  if (!u) {
    return json(
      { error: "LOGIN_FAILED", message: "Credenziali errate." },
      401,
      corsHeaders()
    );
  }
  if (Number(u.disabled || 0) === 1) {
    return json(
      { error: "ACCOUNT_DISABLED", message: "Account disabilitato." },
      403,
      corsHeaders()
    );
  }
  const passwordCheck = await verifyPasswordHash(password, u.pass_hash);
  if (!passwordCheck.ok) {
    return json(
      { error: "LOGIN_FAILED", message: "Credenziali errate." },
      401,
      corsHeaders()
    );
  }
  const now = Date.now();
  const token = await makeSessionToken(env, email, u.pass_hash, now, u.id);
  return json(
    {
      ok: true,
      token,
      trialEndsAt: Number(u.trial_ends_at || 0),
      paidUntil: Number(u.paid_until || 0)
    },
    200,
    corsHeaders()
  );
}
async function handleForgotPassword(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  if (email) {
    const u = await env.DB.prepare(
      "SELECT id, created_at, pass_hash, COALESCE(disabled,0) as disabled FROM users WHERE email = ?"
    ).bind(email).first();
    if (u?.pass_hash && Number(u.disabled || 0) !== 1) {
      const resetToken = await makePasswordResetToken(
        env,
        email,
        u.pass_hash,
        Date.now(),
        u.id
      );
      const appOrigin = passwordResetAppOrigin(env);
      const resetUrl = `${appOrigin}/#reset=${encodeURIComponent(resetToken)}`;
      const delivery = sendPasswordResetEmail(env, email, resetUrl).catch(
        (err) => {
          console.error(
            "password reset email delivery failed",
            String(err?.message || err || "unknown error")
          );
        }
      );
      if (ctx?.waitUntil) ctx.waitUntil(delivery);
      else await delivery;
    }
  }
  return json(
    { ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE },
    200,
    corsHeaders()
  );
}
async function handleResetPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  const password = String(body.password || "");
  if (!token || password.length < 6) {
    return json(
      {
        error: "BAD_INPUT",
        message: "Link non valido o password inferiore a 6 caratteri."
      },
      400,
      corsHeaders()
    );
  }
  const payload = await verifyPasswordResetTokenEnvelope(env, token);
  const email = normEmail(payload?.email);
  const exp = Number(payload?.exp || 0);
  if (!email || !payload?.pv || !Number.isFinite(exp) || exp <= Date.now()) {
    return json(
      {
        error: "RESET_INVALID",
        message: "Link di recupero non valido o scaduto."
      },
      400,
      corsHeaders()
    );
  }
  const u = await env.DB.prepare(
    "SELECT id, created_at, pass_hash, COALESCE(disabled,0) as disabled FROM users WHERE email = ?"
  ).bind(email).first();
  if (!u?.pass_hash || Number(u.disabled || 0) === 1 || payload.uid && payload.uid !== u.id || Number(u.created_at || 0) > Number(payload.iat || exp - PASSWORD_RESET_TTL_MS)) {
    return json(
      {
        error: "RESET_INVALID",
        message: "Link di recupero non valido o scaduto."
      },
      400,
      corsHeaders()
    );
  }
  const expectedVersion = await passwordVersion(
    env,
    RESET_PASSWORD_VERSION_SCOPE,
    u.pass_hash
  );
  if (!timingSafeEq(String(payload.pv), expectedVersion)) {
    return json(
      {
        error: "RESET_INVALID",
        message: "Link di recupero non valido o gi\xE0 utilizzato."
      },
      400,
      corsHeaders()
    );
  }
  const newHash = passwordV2Enabled(env) ? await hashPassword(password) : await sha256(password);
  const update = await env.DB.prepare(
    "UPDATE users SET pass_hash = ? WHERE email = ? AND pass_hash = ? AND id = ?"
  ).bind(newHash, email, u.pass_hash, u.id).run();
  if (Number(update?.meta?.changes || 0) !== 1) {
    return json(
      {
        error: "RESET_INVALID",
        message: "Link di recupero non valido o gi\xE0 utilizzato."
      },
      400,
      corsHeaders()
    );
  }
  return json(
    {
      ok: true,
      message: "Password aggiornata. Ora puoi effettuare il login."
    },
    200,
    corsHeaders()
  );
}
function accountDeletionEnabled(env) {
  return String(env.ACCOUNT_DELETION_ENABLED || "") === "1";
}
function sessionBelongsToAccount(session, user) {
  if (session.uid) return session.uid === user.id;
  return Number(session.iat || 0) >= Number(user.created_at || 0);
}
async function handleDeleteAccount(request, env) {
  const headers4 = { ...corsHeaders(), "Cache-Control": "no-store" };
  if (!accountDeletionEnabled(env)) {
    return json({ error: "DELETION_UNAVAILABLE", message: "Cancellazione account non ancora disponibile." }, 503, headers4);
  }
  const session = await verifySignedToken(env, readBearer(request));
  if (!session?.email) return json({ error: "AUTH_INVALID", message: "Effettua nuovamente il login." }, 401, headers4);
  const user = await env.DB.prepare("SELECT id, created_at, pass_hash FROM users WHERE email = ?").bind(session.email).first();
  if (!user || !sessionBelongsToAccount(session, user) || !await sessionPasswordVersionMatches(env, session, user.pass_hash)) {
    return json({ error: "AUTH_INVALID", message: "Effettua nuovamente il login." }, 401, headers4);
  }
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== "ELIMINA" || typeof body?.password !== "string" || !body.password || body.password.length > 1024) {
    return json({ error: "BAD_INPUT", message: "Inserisci la password e scrivi ELIMINA per confermare." }, 400, headers4);
  }
  if (!(await verifyPasswordHash(body.password, user.pass_hash)).ok) {
    return json({ error: "PASSWORD_INVALID", message: "Password non corretta. Account non cancellato." }, 403, headers4);
  }
  try {
    const results2 = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM trial_search_log WHERE email = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND email = ? AND pass_hash = ?)"
      ).bind(session.email, user.id, session.email, user.pass_hash),
      env.DB.prepare(
        "DELETE FROM trial_usage WHERE email = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND email = ? AND pass_hash = ?)"
      ).bind(session.email, user.id, session.email, user.pass_hash),
      env.DB.prepare("DELETE FROM users WHERE id = ? AND email = ? AND pass_hash = ?").bind(user.id, session.email, user.pass_hash)
    ]);
    const result = results2[2];
    if (Number(result?.meta?.changes || 0) !== 1) {
      return json({ error: "ACCOUNT_CHANGED", message: "Account modificato. Effettua nuovamente il login prima di riprovare." }, 409, headers4);
    }
    return json({ ok: true, message: "Account cancellato definitivamente." }, 200, headers4);
  } catch {
    return json({ error: "DELETION_FAILED", message: "Cancellazione non completata. Riprova pi\xF9 tardi." }, 503, headers4);
  }
}
async function handleMe(request, env) {
  const token = readBearer(request);
  if (!token) return json({ ok: false }, 200, corsHeaders());
  const sess = await verifySignedToken(env, token);
  if (!sess?.email) return json({ ok: false }, 200, corsHeaders());
  const u = await env.DB.prepare(
    "SELECT id, created_at, email, pass_hash, trial_ends_at, paid_until, COALESCE(disabled,0) as disabled FROM users WHERE email = ?"
  ).bind(sess.email).first();
  if (!u) return json({ ok: false }, 200, corsHeaders());
  if (!sessionBelongsToAccount(sess, u) || !await sessionPasswordVersionMatches(env, sess, u.pass_hash)) {
    return json({ ok: false, error: "AUTH_INVALID" }, 200, corsHeaders());
  }
  if (Number(u.disabled || 0) === 1) {
    return json({ ok: false, error: "ACCOUNT_DISABLED" }, 200, corsHeaders());
  }
  return json(
    {
      ok: true,
      email: u.email,
      accountDeletionAvailable: accountDeletionEnabled(env),
      trialEndsAt: Number(u.trial_ends_at || 0),
      paidUntil: Number(u.paid_until || 0),
      now: Date.now()
    },
    200,
    corsHeaders()
  );
}
async function handleRedeem(request, env) {
  const token = readBearer(request);
  if (!token) {
    return json({ error: "AUTH_REQUIRED" }, 401, corsHeaders());
  }
  const sess = await verifySignedToken(env, token);
  if (!sess?.email) {
    return json({ error: "AUTH_INVALID" }, 401, corsHeaders());
  }
  const u = await env.DB.prepare(
    "SELECT id, created_at, paid_until, pass_hash, COALESCE(disabled,0) as disabled FROM users WHERE email = ?"
  ).bind(sess.email).first();
  if (!u || !sessionBelongsToAccount(sess, u) || !await sessionPasswordVersionMatches(env, sess, u.pass_hash)) {
    return json({ error: "AUTH_INVALID" }, 401, corsHeaders());
  }
  if (Number(u.disabled || 0) === 1) {
    return json({ error: "ACCOUNT_DISABLED" }, 403, corsHeaders());
  }
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  if (!code)
    return json(
      { error: "BAD_INPUT", message: "Codice mancante." },
      400,
      corsHeaders()
    );
  const payload = await verifyLicenseCode(env, code);
  if (!payload?.email || !payload?.exp) {
    return json(
      { error: "CODE_INVALID", message: "Codice non valido." },
      400,
      corsHeaders()
    );
  }
  if (normEmail(payload.email) !== normEmail(sess.email)) {
    return json(
      { error: "CODE_EMAIL_MISMATCH", message: "Codice non per questa email." },
      400,
      corsHeaders()
    );
  }
  if (Date.now() > Number(payload.exp)) {
    return json(
      { error: "CODE_EXPIRED", message: "Codice scaduto." },
      400,
      corsHeaders()
    );
  }
  if (env.PRO_PAYMENTS) {
    try {
      const outcome = await env.PRO_PAYMENTS.redeem(u, payload, Date.now());
      return json({ ok: true, ...outcome, now: Date.now() }, 200, corsHeaders());
    } catch (error) {
      return paymentDeliveryError(error);
    }
  }
  const now = Date.now();
  const currentPaid = Number(u?.paid_until || 0);
  const base = Math.max(now, currentPaid);
  const newPaidUntil = base + 30 * 24 * 60 * 60 * 1e3;
  await env.DB.prepare("UPDATE users SET paid_until = ? WHERE email = ?").bind(newPaidUntil, sess.email).run();
  return json({ ok: true, paidUntil: newPaidUntil, now }, 200, corsHeaders());
}
async function handleAdminMint(request, env) {
  if (!isAdmin(request, env))
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());
  const url = new URL(request.url);
  const email = normEmail(url.searchParams.get("email"));
  if (!email)
    return json(
      { error: "BAD_INPUT", message: "email mancante" },
      400,
      corsHeaders()
    );
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1e3;
  let payload = { email, exp };
  if (env.PRO_PAYMENTS) {
    const account = await env.DB.prepare("SELECT id, created_at, COALESCE(disabled,0) AS disabled FROM users WHERE email = ?").bind(email).first();
    if (!account || Number(account.disabled) !== 0) return json({ error: "NOT_FOUND" }, 404, corsHeaders());
    payload = { ...payload, v: 2, id: crypto.randomUUID(), accountId: account.id, issuedAt: Date.now() };
  }
  const code = await makeLicenseCode(env, payload);
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
  `
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
      paidActivatedAt: Number(u.paid_activated_at || 0)
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
      corsHeaders()
    );
  }
  await env.DB.prepare("UPDATE users SET note = ? WHERE email = ?").bind(note, email).run();
  return json({ ok: true }, 200, corsHeaders());
}
async function handleAdminGrant(request, env) {
  if (!isAdmin(request, env))
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  if (!email)
    return json(
      { error: "BAD_INPUT", message: "email mancante" },
      400,
      corsHeaders()
    );
  const u = await env.DB.prepare("SELECT id, created_at, paid_until, COALESCE(disabled,0) AS disabled FROM users WHERE email = ?").bind(email).first();
  if (env.PRO_PAYMENTS) {
    if (!u) return json({ error: "NOT_FOUND" }, 404, corsHeaders());
    try {
      const operationId = request.headers.get("Idempotency-Key") || body.requestId || crypto.randomUUID();
      const outcome = await env.PRO_PAYMENTS.admin(u, 30, operationId, Date.now());
      return json({ ok: true, email, ...outcome }, 200, corsHeaders());
    } catch (error) {
      return paymentDeliveryError(error);
    }
  }
  const now = Date.now();
  const currentPaid = Number(u?.paid_until || 0);
  const base = Math.max(now, currentPaid);
  const newPaidUntil = base + 30 * 24 * 60 * 60 * 1e3;
  await env.DB.prepare("UPDATE users SET paid_until = ?, paid_activated_at = ? WHERE email = ?").bind(newPaidUntil, Date.now(), email).run();
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
      corsHeaders()
    );
  }
  if (deltaDays < -365 || deltaDays > 365) {
    return json(
      { error: "BAD_INPUT", message: "deltaDays fuori limite (+/-365)" },
      400,
      corsHeaders()
    );
  }
  const row = await env.DB.prepare(
    "SELECT id, created_at, paid_until, COALESCE(disabled,0) AS disabled FROM users WHERE email = ?"
  ).bind(email).first();
  if (!row) {
    return json(
      { error: "NOT_FOUND", message: "Utente non trovato" },
      404,
      corsHeaders()
    );
  }
  if (env.PRO_PAYMENTS) {
    try {
      const exactDays = Number(body.deltaDays);
      if (!Number.isSafeInteger(exactDays) || String(body.deltaDays).trim() === "") return json({ error: "BAD_INPUT" }, 400, corsHeaders());
      const operationId = request.headers.get("Idempotency-Key") || body.requestId || crypto.randomUUID();
      const outcome = await env.PRO_PAYMENTS.admin(row, exactDays, operationId, Date.now());
      return json({ ok: true, email, ...outcome }, 200, corsHeaders());
    } catch (error) {
      return paymentDeliveryError(error);
    }
  }
  const now = Date.now();
  const currentPaid = Number(row.paid_until || 0);
  const wasPro = now < currentPaid;
  const deltaMs = deltaDays * 24 * 60 * 60 * 1e3;
  let newPaidUntil;
  if (deltaDays >= 0) {
    const base = Math.max(now, currentPaid);
    newPaidUntil = base + deltaMs;
  } else {
    newPaidUntil = Math.max(0, currentPaid + deltaMs);
  }
  const shouldSetActivated = deltaDays > 0 && !wasPro;
  if (shouldSetActivated) {
    await env.DB.prepare("UPDATE users SET paid_activated_at = ? WHERE email = ?").bind(now, email).run();
  }
  await env.DB.prepare("UPDATE users SET paid_until = ? WHERE email = ?").bind(newPaidUntil, email).run();
  return json({ ok: true, email, paidUntil: newPaidUntil }, 200, corsHeaders());
}
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
      corsHeaders()
    );
  }
  await env.DB.prepare("UPDATE users SET disabled = ? WHERE email = ?").bind(disabled, email).run();
  return json({ ok: true, email, disabled }, 200, corsHeaders());
}
async function handleAdminStats(request, env) {
  if (!isAdmin(request, env)) {
    return json({ error: "FORBIDDEN" }, 403, corsHeaders());
  }
  const now = Date.now();
  const onlineCutoff = now - 5 * 60 * 1e3;
  const dayCutoff = now - 24 * 60 * 60 * 1e3;
  const weekCutoff = now - 7 * 24 * 60 * 60 * 1e3;
  const onlineRow = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE COALESCE(disabled,0)=0 AND COALESCE(last_seen_at,0) >= ?"
  ).bind(onlineCutoff).first();
  const active24Row = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE COALESCE(disabled,0)=0 AND COALESCE(last_seen_at,0) >= ?"
  ).bind(dayCutoff).first();
  const active7dRow = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE COALESCE(disabled,0)=0 AND COALESCE(last_seen_at,0) >= ?"
  ).bind(weekCutoff).first();
  const newPro24Row = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE COALESCE(disabled,0)=0 AND COALESCE(paid_activated_at,0) >= ?"
  ).bind(dayCutoff).first();
  return json(
    {
      ok: true,
      now,
      online5m: Number(onlineRow?.c || 0),
      active24h: Number(active24Row?.c || 0),
      active7d: Number(active7dRow?.c || 0),
      newPro24h: Number(newPro24Row?.c || 0)
    },
    200,
    corsHeaders()
  );
}
async function handleTelemetryPing(request, env) {
  const gate = await requireActiveUser(request, env);
  if (!gate.ok) return gate.res;
  const now = Date.now();
  await env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE email = ?").bind(now, gate.email).run();
  return json({ ok: true, ts: now }, 200, corsHeaders());
}
function isAdmin(request, env) {
  const k = request.headers.get("x-admin-key") || "";
  return k && env.ADMIN_KEY && k === env.ADMIN_KEY;
}
var DYNAMIC_SERIE_A_LEAGUE_ID = 135;
var DYNAMIC_STRENGTH_SETTINGS = Object.freeze({
  learningRate: 0.075,
  seasonCarry: 0.65,
  ratingShrinkage: 2e-3,
  residualCap: 2.5,
  maxLogStrength: 0.8,
  fallbackHomeGoals: 1.25,
  fallbackAwayGoals: 1.05
});
var DYNAMIC_SIGNAL_COVERAGE = Object.freeze({
  minimumCurrentTeamMatches: 3,
  minimumLeagueMatches: 8,
  establishedPreviousTeamMatches: 10,
  currentMatchesWithoutPreviousHistory: 8,
  reducedHistoryScoreCap: 45
});
function dynamicClamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
function dynamicAverage(values, fallback) {
  const finite = (values || []).filter(Number.isFinite);
  if (!finite.length) return fallback;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}
function normalizeCompletedFixtures(fixtures, beforeTimestamp = Infinity) {
  return (Array.isArray(fixtures) ? fixtures : []).map((fixture, sourceIndex) => ({
    id: fixture?.fixture?.id ?? null,
    sourceIndex,
    timestamp: Date.parse(fixture?.fixture?.date || ""),
    homeTeamKey: String(fixture?.teams?.home?.id ?? ""),
    awayTeamKey: String(fixture?.teams?.away?.id ?? ""),
    homeGoals: fixture?.goals?.home == null ? NaN : Number(fixture.goals.home),
    awayGoals: fixture?.goals?.away == null ? NaN : Number(fixture.goals.away)
  })).filter(
    (fixture) => Number.isFinite(fixture.timestamp) && fixture.timestamp < beforeTimestamp && fixture.homeTeamKey && fixture.awayTeamKey && fixture.homeTeamKey !== fixture.awayTeamKey && Number.isInteger(fixture.homeGoals) && fixture.homeGoals >= 0 && Number.isInteger(fixture.awayGoals) && fixture.awayGoals >= 0
  ).sort(
    (left, right) => left.timestamp - right.timestamp || Number(left.id || left.sourceIndex) - Number(right.id || right.sourceIndex)
  );
}
function dynamicTeamFor(state, teamKey) {
  if (!state.teams.has(teamKey)) {
    state.teams.set(teamKey, { attack: 0, defence: 0 });
  }
  return state.teams.get(teamKey);
}
function dynamicLeagueBase(currentHistory, previousHistory, settings) {
  const current = currentHistory.slice(-50);
  const previous = previousHistory.slice(-50);
  const combinedHome = [
    ...current.map((fixture) => fixture.homeGoals),
    ...previous.map((fixture) => fixture.homeGoals)
  ];
  const combinedAway = [
    ...current.map((fixture) => fixture.awayGoals),
    ...previous.map((fixture) => fixture.awayGoals)
  ];
  return {
    home: dynamicAverage(combinedHome, settings.fallbackHomeGoals),
    away: dynamicAverage(combinedAway, settings.fallbackAwayGoals)
  };
}
function dynamicExpectedGoals(state, fixture, base, settings) {
  const home = dynamicTeamFor(state, fixture.homeTeamKey);
  const away = dynamicTeamFor(state, fixture.awayTeamKey);
  return {
    home: dynamicClamp(
      base.home * Math.exp(home.attack + away.defence),
      0.2,
      3.2
    ),
    away: dynamicClamp(
      base.away * Math.exp(away.attack + home.defence),
      0.2,
      3.2
    ),
    strengths: {
      homeAttack: home.attack,
      homeDefence: home.defence,
      awayAttack: away.attack,
      awayDefence: away.defence
    }
  };
}
function dynamicRecenter(state, settings) {
  const teams = [...state.teams.values()];
  if (!teams.length) return;
  const meanAttack = dynamicAverage(teams.map((team) => team.attack), 0);
  const meanDefence = dynamicAverage(teams.map((team) => team.defence), 0);
  for (const team of teams) {
    team.attack = dynamicClamp(
      team.attack - meanAttack,
      -settings.maxLogStrength,
      settings.maxLogStrength
    );
    team.defence = dynamicClamp(
      team.defence - meanDefence,
      -settings.maxLogStrength,
      settings.maxLogStrength
    );
  }
}
function dynamicUpdateBatch(state, fixtures, base, settings) {
  const changes = /* @__PURE__ */ new Map();
  const changeFor = (teamKey) => {
    if (!changes.has(teamKey)) {
      changes.set(teamKey, { attack: 0, defence: 0 });
    }
    return changes.get(teamKey);
  };
  for (const fixture of fixtures) {
    const expected = dynamicExpectedGoals(state, fixture, base, settings);
    const homeResidual = dynamicClamp(
      fixture.homeGoals - expected.home,
      -settings.residualCap,
      settings.residualCap
    );
    const awayResidual = dynamicClamp(
      fixture.awayGoals - expected.away,
      -settings.residualCap,
      settings.residualCap
    );
    changeFor(fixture.homeTeamKey).attack += homeResidual;
    changeFor(fixture.awayTeamKey).defence += homeResidual;
    changeFor(fixture.awayTeamKey).attack += awayResidual;
    changeFor(fixture.homeTeamKey).defence += awayResidual;
  }
  for (const team of state.teams.values()) {
    team.attack *= 1 - settings.ratingShrinkage;
    team.defence *= 1 - settings.ratingShrinkage;
  }
  for (const [teamKey, change] of changes) {
    const team = dynamicTeamFor(state, teamKey);
    team.attack += settings.learningRate * change.attack;
    team.defence += settings.learningRate * change.defence;
  }
  dynamicRecenter(state, settings);
}
function dynamicBatches(fixtures) {
  const batches = [];
  for (let index = 0; index < fixtures.length; ) {
    const timestamp3 = fixtures[index].timestamp;
    const batch = [];
    while (index < fixtures.length && fixtures[index].timestamp === timestamp3) {
      batch.push(fixtures[index]);
      index += 1;
    }
    batches.push(batch);
  }
  return batches;
}
function countTeamMatches(fixtures, teamKey) {
  return fixtures.filter(
    (fixture) => fixture.homeTeamKey === teamKey || fixture.awayTeamKey === teamKey
  ).length;
}
function calculateDynamicSerieAPrediction({
  previousFixtures,
  currentFixtures,
  targetTimestamp,
  homeTeamId,
  awayTeamId
}) {
  const settings = DYNAMIC_STRENGTH_SETTINGS;
  const previous = normalizeCompletedFixtures(
    previousFixtures,
    targetTimestamp
  );
  const current = normalizeCompletedFixtures(
    currentFixtures,
    targetTimestamp
  );
  const state = { teams: /* @__PURE__ */ new Map() };
  const priorHistory = [];
  for (const batch of dynamicBatches(previous)) {
    const base2 = dynamicLeagueBase(priorHistory, [], settings);
    dynamicUpdateBatch(state, batch, base2, settings);
    priorHistory.push(...batch);
  }
  for (const team of state.teams.values()) {
    team.attack *= settings.seasonCarry;
    team.defence *= settings.seasonCarry;
  }
  const currentHistory = [];
  for (const batch of dynamicBatches(current)) {
    const base2 = dynamicLeagueBase(currentHistory, previous, settings);
    dynamicUpdateBatch(state, batch, base2, settings);
    currentHistory.push(...batch);
  }
  const target = {
    homeTeamKey: String(homeTeamId),
    awayTeamKey: String(awayTeamId)
  };
  const base = dynamicLeagueBase(currentHistory, previous, settings);
  const prediction = dynamicExpectedGoals(state, target, base, settings);
  const homeMatches = countTeamMatches(current, target.homeTeamKey);
  const awayMatches = countTeamMatches(current, target.awayTeamKey);
  const previousHomeMatches = countTeamMatches(
    previous,
    target.homeTeamKey
  );
  const previousAwayMatches = countTeamMatches(
    previous,
    target.awayTeamKey
  );
  const leagueMatches = current.length;
  const homeHistoryLimited = previousHomeMatches < DYNAMIC_SIGNAL_COVERAGE.establishedPreviousTeamMatches && homeMatches < DYNAMIC_SIGNAL_COVERAGE.currentMatchesWithoutPreviousHistory;
  const awayHistoryLimited = previousAwayMatches < DYNAMIC_SIGNAL_COVERAGE.establishedPreviousTeamMatches && awayMatches < DYNAMIC_SIGNAL_COVERAGE.currentMatchesWithoutPreviousHistory;
  return {
    expectedGoals: { home: prediction.home, away: prediction.away },
    strengths: prediction.strengths,
    base,
    coverage: {
      homeMatches,
      awayMatches,
      leagueMatches,
      previousHomeMatches,
      previousAwayMatches,
      trainingMatches: previous.length + current.length,
      currentLeagueMatches: current.length,
      previousLeagueMatches: previous.length,
      minimumTeamMatches: DYNAMIC_SIGNAL_COVERAGE.minimumCurrentTeamMatches,
      minimumLeagueMatches: DYNAMIC_SIGNAL_COVERAGE.minimumLeagueMatches,
      historyLimited: homeHistoryLimited || awayHistoryLimited,
      historyLimitedSides: {
        home: homeHistoryLimited,
        away: awayHistoryLimited
      },
      sufficient: homeMatches >= DYNAMIC_SIGNAL_COVERAGE.minimumCurrentTeamMatches && awayMatches >= DYNAMIC_SIGNAL_COVERAGE.minimumCurrentTeamMatches && leagueMatches >= DYNAMIC_SIGNAL_COVERAGE.minimumLeagueMatches
    }
  };
}
function dynamicSignalAssessment(coverage, rawSignalScore) {
  const normalizedRawScore = Math.round(
    dynamicClamp(rawSignalScore, 0, 100)
  );
  const signalScore = coverage?.historyLimited ? Math.min(
    normalizedRawScore,
    DYNAMIC_SIGNAL_COVERAGE.reducedHistoryScoreCap
  ) : normalizedRawScore;
  return {
    score: coverage?.sufficient ? signalScore : null,
    signalScore,
    rawSignalScore: normalizedRawScore,
    level: !coverage?.sufficient ? "Non valutabile" : coverage?.historyLimited ? "Da confermare" : "Valutabile"
  };
}
async function handlePredict(request, env) {
  const url = new URL(request.url);
  const fixtureId = url.searchParams.get("fixture");
  const nRaw = url.searchParams.get("n");
  let n = parseInt(nRaw || "10", 10);
  let rho = parseFloat(url.searchParams.get("rho") || "-0.10");
  if (!Number.isFinite(rho)) rho = -0.1;
  rho = Math.max(-0.3, Math.min(0.3, rho));
  if (!Number.isFinite(n) || n < 5) n = 10;
  if (n > 20) n = 20;
  if (!fixtureId) {
    return json(
      { response: null, errors: { fixture: "missing" } },
      400,
      corsHeaders()
    );
  }
  async function af(pathWithQuery, ttlSeconds = 0) {
    const apiUrl = new URL(pathWithQuery, request.url);
    const { response: res } = await fetchApiFootballCached(
      apiUrl,
      env,
      ttlSeconds
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
    if (teamId === hId) return { gf: gh, ga, isHome: true };
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
    return e * Math.pow(L, k) / fact;
  }
  function clamp(x, a, b) {
    const nn = Number(x) || 0;
    return Math.max(a, Math.min(b, nn));
  }
  function nOr0(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : 0;
  }
  function tauDC(i, j, lambdaH, lambdaA, rho2) {
    if (i === 0 && j === 0) return 1 - lambdaH * lambdaA * rho2;
    if (i === 0 && j === 1) return 1 + lambdaH * rho2;
    if (i === 1 && j === 0) return 1 + lambdaA * rho2;
    if (i === 1 && j === 1) return 1 - rho2;
    return 1;
  }
  function dynamicPredictionPayload({
    fx,
    result,
    rho: rho2,
    previousSeason,
    currentSeason
  }) {
    const lambdaHome = result.expectedGoals.home;
    const lambdaAway = result.expectedGoals.away;
    const maxG = 5;
    const ph = Array.from(
      { length: maxG + 1 },
      (_, k) => poissonPmf(k, lambdaHome)
    );
    const pa = Array.from(
      { length: maxG + 1 },
      (_, k) => poissonPmf(k, lambdaAway)
    );
    let homeWinRaw = 0;
    let drawRaw = 0;
    let awayWinRaw = 0;
    let over25Raw = 0;
    let bttsYesRaw = 0;
    let sumMatrix = 0;
    const scorelines = [];
    for (let i = 0; i <= maxG; i += 1) {
      for (let j = 0; j <= maxG; j += 1) {
        const raw = ph[i] * pa[j] * tauDC(i, j, lambdaHome, lambdaAway, rho2);
        const probability = Math.max(0, raw);
        sumMatrix += probability;
        if (i > j) homeWinRaw += probability;
        else if (i === j) drawRaw += probability;
        else awayWinRaw += probability;
        if (i + j >= 3) over25Raw += probability;
        if (i >= 1 && j >= 1) bttsYesRaw += probability;
        scorelines.push({ score: `${i}-${j}`, p: probability });
      }
    }
    const denominator = sumMatrix > 0 ? sumMatrix : 1;
    const probabilities = {
      homeWin: homeWinRaw / denominator,
      draw: drawRaw / denominator,
      awayWin: awayWinRaw / denominator
    };
    const ordered = Object.values(probabilities).sort((a, b) => b - a);
    const edge = Math.max(0, (ordered[0] || 0) - (ordered[1] || 0));
    const rawSignalScore = Math.round(
      Math.max(0, Math.min(1, edge / 0.4)) * 100
    );
    const edgePct = Math.round(edge * 100);
    const coverage = result.coverage;
    const signal = dynamicSignalAssessment(coverage, rawSignalScore);
    const homeName = fx?.teams?.home?.name || "Casa";
    const awayName = fx?.teams?.away?.name || "Trasferta";
    const historySummary = `${homeName} ${coverage.homeMatches} correnti/${coverage.previousHomeMatches} precedenti, ${awayName} ${coverage.awayMatches} correnti/${coverage.previousAwayMatches} precedenti`;
    const note = !coverage.sufficient ? `Storico insufficiente nella competizione: ${homeName} ${coverage.homeMatches}/${coverage.minimumTeamMatches}, ${awayName} ${coverage.awayMatches}/${coverage.minimumTeamMatches}, lega ${coverage.leagueMatches}/${coverage.minimumLeagueMatches}. Le probabilit\xE0 sono un fallback matematico.` : coverage.historyLimited ? `Segnale da confermare per storico squadra ridotto: ${historySummary}. Il distacco 1X2 va interpretato con cautela.` : `Distacco tra primo e secondo esito: ${edgePct} punti. Non \xE8 una probabilit\xE0 di successo.`;
    scorelines.sort((a, b) => b.p - a.p);
    const drivers = [];
    const sumLambda = lambdaHome + lambdaAway;
    if (sumLambda >= 3) {
      drivers.push({
        factor: "Totale gol atteso alto",
        impact: "+",
        note: "Modello vede gara aperta (probabilit\xE0 Over/BTTS cresce)."
      });
    } else if (sumLambda <= 2.1) {
      drivers.push({
        factor: "Totale gol atteso basso",
        impact: "-",
        note: "Modello vede gara chiusa (crescono 0-0 / 1-0 / 0-1)."
      });
    }
    drivers.push({
      factor: "Forza avversari",
      impact: "+",
      note: `Attacco e difesa stimati cronologicamente sul campione di lega (${coverage.trainingMatches} partite); copertura squadre: ${historySummary}.`
    });
    if (coverage.historyLimited) {
      drivers.push({
        factor: "Storico squadra ridotto",
        impact: "!",
        note: "Una squadra non ha ancora uno storico sufficiente tra stagione precedente e stagione corrente: segnale 1X2 ridotto."
      });
    }
    drivers.push({
      factor: "Dixon\u2013Coles",
      impact: "+",
      note: `Correzione low-score attiva (rho=${rho2}).`
    });
    return {
      model: {
        name: "poisson_v1_6_dc_dynamic_team_strength",
        maxGoals: maxG,
        rho: rho2,
        learningRate: DYNAMIC_STRENGTH_SETTINGS.learningRate,
        blend: 1,
        previousSeason,
        currentSeason
      },
      confidence: {
        score: signal.score,
        signalScore: signal.signalScore,
        rawSignalScore: signal.rawSignalScore,
        edge: edgePct,
        level: signal.level,
        risk: null,
        note
      },
      coverage,
      expectedGoals: { home: lambdaHome, away: lambdaAway },
      probabilities,
      topScorelines: scorelines.slice(0, 3).map((item) => ({
        score: item.score,
        p: item.p / denominator
      })),
      extras: {
        over25: over25Raw / denominator,
        bttsYes: bttsYesRaw / denominator
      },
      drivers,
      diagnostics: {
        leagueBase: result.base,
        strengths: result.strengths
      }
    };
  }
  try {
    let clamp01 = function(x) {
      return Math.max(0, Math.min(1, x));
    }, pushDriver = function(list, factor, impact, note) {
      list.push({ factor, impact, note });
    };
    const TTL_STATS = 6 * 3600;
    const TTL_LEAGUE50 = 30 * 60;
    const TTL_TEAM_LAST = 10 * 60;
    const TTL_FIXTURE = 30 * 60;
    const fxArr = await af(
      `/fixtures?id=${encodeURIComponent(fixtureId)}&timezone=Europe/Rome`,
      TTL_FIXTURE
    );
    if (!fxArr.length) {
      return json(
        { response: null, errors: { fixture: "not_found" } },
        404,
        corsHeaders()
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
        corsHeaders()
      );
    }
    if (Number(leagueId) === DYNAMIC_SERIE_A_LEAGUE_ID) {
      const targetTimestamp = Date.parse(fx?.fixture?.date || "");
      if (!Number.isFinite(targetTimestamp)) {
        return json(
          { response: null, errors: { fixture: "invalid_date" } },
          422,
          corsHeaders()
        );
      }
      const previousSeason = Number(season) - 1;
      const TTL_PREVIOUS_SEASON = 7 * 24 * 3600;
      const TTL_CURRENT_SEASON = 10 * 60;
      const [previousFixtures, currentFixtures] = await Promise.all([
        af(
          `/fixtures?league=${leagueId}&season=${previousSeason}&status=FT&timezone=Europe/Rome`,
          TTL_PREVIOUS_SEASON
        ),
        af(
          `/fixtures?league=${leagueId}&season=${season}&status=FT&timezone=Europe/Rome`,
          TTL_CURRENT_SEASON
        )
      ]);
      const result = calculateDynamicSerieAPrediction({
        previousFixtures,
        currentFixtures,
        targetTimestamp,
        homeTeamId: homeId,
        awayTeamId: awayId
      });
      return json(
        {
          response: dynamicPredictionPayload({
            fx,
            result,
            rho,
            previousSeason,
            currentSeason: Number(season)
          }),
          errors: null
        },
        200,
        corsHeaders()
      );
    }
    const [homeSeasonArr, awaySeasonArr] = await Promise.all([
      af(
        `/teams/statistics?team=${homeId}&league=${leagueId}&season=${season}`,
        TTL_STATS
      ),
      af(
        `/teams/statistics?team=${awayId}&league=${leagueId}&season=${season}`,
        TTL_STATS
      )
    ]);
    const homeSeason = homeSeasonArr?.[0] || null;
    const awaySeason = awaySeasonArr?.[0] || null;
    const [homeLast, awayLast] = await Promise.all([
      af(
        `/fixtures?team=${homeId}&league=${leagueId}&season=${season}&last=${n}&status=FT&timezone=Europe/Rome`,
        TTL_TEAM_LAST
      ),
      af(
        `/fixtures?team=${awayId}&league=${leagueId}&season=${season}&last=${n}&status=FT&timezone=Europe/Rome`,
        TTL_TEAM_LAST
      )
    ]);
    const homeCtx = homeLast.filter(
      (m) => (m?.teams?.home?.id ?? null) === homeId
    );
    const awayCtx = awayLast.filter(
      (m) => (m?.teams?.away?.id ?? null) === awayId
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
    let leagueHomeGoals = 1.25;
    let leagueAwayGoals = 1.05;
    let leagueMatches = 0;
    try {
      const leagueLast = await af(
        `/fixtures?league=${leagueId}&season=${season}&last=50&status=FT&timezone=Europe/Rome`,
        TTL_LEAGUE50
      );
      leagueMatches = Array.isArray(leagueLast) ? leagueLast.length : 0;
      if (leagueMatches > 0) {
        leagueHomeGoals = avg(
          leagueLast.map((m) => Number(m?.goals?.home ?? 0))
        );
        leagueAwayGoals = avg(
          leagueLast.map((m) => Number(m?.goals?.away ?? 0))
        );
      }
    } catch (_) {
    }
    const MIN_TEAM_HISTORY = 3;
    const MIN_LEAGUE_HISTORY = 8;
    const coverage = {
      homeMatches: homeLast.length,
      awayMatches: awayLast.length,
      leagueMatches,
      minimumTeamMatches: MIN_TEAM_HISTORY,
      minimumLeagueMatches: MIN_LEAGUE_HISTORY,
      sufficient: homeLast.length >= MIN_TEAM_HISTORY && awayLast.length >= MIN_TEAM_HISTORY && leagueMatches >= MIN_LEAGUE_HISTORY
    };
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
    const maxG = 5;
    const ph = Array.from(
      { length: maxG + 1 },
      (_, k) => poissonPmf(k, lambdaHome)
    );
    const pa = Array.from(
      { length: maxG + 1 },
      (_, k) => poissonPmf(k, lambdaAway)
    );
    let homeWinRaw = 0, drawRaw = 0, awayWinRaw = 0;
    let over25Raw = 0, bttsYesRaw = 0;
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
    const probs = [
      Number(homeWin) || 0,
      Number(draw) || 0,
      Number(awayWin) || 0
    ].sort((a, b) => b - a);
    const pMax = probs[0] || 0;
    const pSecond = probs[1] || 0;
    const edge = Math.max(0, pMax - pSecond);
    const scoreRaw = edge / 0.4 * 100;
    const confidenceScore = Math.round(clamp01(scoreRaw / 100) * 100);
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
    const edgePct = Math.round(edge * 100);
    const homeName = fx?.teams?.home?.name || "Casa";
    const awayName = fx?.teams?.away?.name || "Trasferta";
    const confidenceNote = coverage.sufficient ? `Distacco tra primo e secondo esito: ${edgePct} punti. Non \xE8 una probabilit\xE0 di successo.` : `Storico insufficiente nella competizione: ${homeName} ${coverage.homeMatches}/${MIN_TEAM_HISTORY}, ${awayName} ${coverage.awayMatches}/${MIN_TEAM_HISTORY}, lega ${coverage.leagueMatches}/${MIN_LEAGUE_HISTORY}. Le probabilit\xE0 sono un fallback matematico.`;
    const over25 = over25Raw / denom;
    const bttsYes = bttsYesRaw / denom;
    scorelines.sort((a, b) => b.p - a.p);
    const topScorelines = scorelines.slice(0, 3).map((x) => ({
      score: x.score,
      p: x.p / denom
    }));
    const drivers = [];
    const sumLambda = (Number(lambdaHome) || 0) + (Number(lambdaAway) || 0);
    if (sumLambda >= 3)
      pushDriver(
        drivers,
        "Totale gol atteso alto",
        "+",
        "Modello vede gara aperta (probabilit\xE0 Over/BTTS cresce)."
      );
    else if (sumLambda <= 2.1)
      pushDriver(
        drivers,
        "Totale gol atteso basso",
        "-",
        "Modello vede gara chiusa (crescono 0-0 / 1-0 / 0-1)."
      );
    pushDriver(
      drivers,
      "Fattore campo",
      "+",
      `Home advantage applicato: x${HOME_ADV}`
    );
    pushDriver(
      drivers,
      "Dixon\u2013Coles",
      "+",
      `Correzione low-score attiva (rho=${rho}).`
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
            rho
          },
          confidence: {
            score: coverage.sufficient ? confidenceScore : null,
            signalScore: confidenceScore,
            edge: edgePct,
            level: coverage.sufficient ? confidenceLabel : "Non valutabile",
            risk: coverage.sufficient ? riskLabel : null,
            note: confidenceNote
          },
          coverage,
          expectedGoals: { home: lambdaHome, away: lambdaAway },
          probabilities: { homeWin, draw, awayWin },
          topScorelines,
          extras: { over25, bttsYes },
          drivers
        },
        errors: null
      },
      200,
      corsHeaders()
    );
  } catch (e) {
    return json(
      { response: null, errors: { predict: String(e.message || e) } },
      500,
      corsHeaders()
    );
  }
}
function cacheTtlFor(pathname, searchParams) {
  if (pathname === "/standings") return 60 * 10;
  if (pathname === "/fixtures/rounds") return 60 * 60 * 2;
  if (pathname.startsWith("/auth/") || pathname.startsWith("/admin/")) return 0;
  if (pathname === "/fixtures/events") return 60 * 5;
  if (pathname === "/fixtures/statistics") return 60 * 10;
  if (pathname === "/fixtures") {
    if (searchParams.has("round") && searchParams.has("league") && searchParams.has("season")) {
      return 60 * 60 * 24 * 30;
    }
    if (searchParams.has("id") || searchParams.has("fixture")) return 60 * 10;
    return 60 * 3;
  }
  if (pathname === "/injuries") return 60 * 10;
  if (pathname === "/players") return 60 * 30;
  if (pathname === "/teams") return 60 * 60;
  return 0;
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
    headers: { Accept: "application/json" }
  });
}
async function fetchRelay(pathWithQuery, env) {
  const relayBase = String(env.CR_RELAY_URL || "").trim();
  const relaySecret = String(env.CR_RELAY_SECRET || "").trim();
  if (!relayBase || !relaySecret) {
    throw new Error("Relay non configurato");
  }
  const relayOrigin = new URL(relayBase);
  const relayUrl = new URL(pathWithQuery, relayOrigin.origin);
  const signedPath = `${relayUrl.pathname}${relayUrl.search}`;
  const timestamp3 = String(Date.now());
  const canonical = `${timestamp3}
GET
${signedPath}`;
  const signature = await hmacSha256Hex(relaySecret, canonical);
  return fetch(relayUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-cr-timestamp": timestamp3,
      "x-cr-signature": signature
    }
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
  } catch {
  }
  const semanticOk = relayRes.ok && parsed !== null && !hasApiSportsErrors(parsed);
  const responseHeaders = new Headers(relayRes.headers);
  responseHeaders.set(
    "x-cr-relay",
    relayRes.headers.get("x-cr-relay") || "missing"
  );
  if (semanticOk && ttlSeconds > 0) {
    responseHeaders.set("Cache-Control", `public, s-maxage=${ttlSeconds}`);
  } else {
    responseHeaders.set("Cache-Control", "no-store");
  }
  const response = new Response(bodyText, {
    status: relayRes.status,
    statusText: relayRes.statusText,
    headers: responseHeaders
  });
  if (semanticOk && ttlSeconds > 0) {
    const putPromise = cache.put(cacheKey, response.clone());
    if (ctx?.waitUntil) ctx.waitUntil(putPromise);
    else await putPromise;
  }
  return { response, cacheStatus: "MISS" };
}
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
      ctx
    ));
  } catch (err) {
    return json(
      {
        error: "UPSTREAM_NETWORK",
        message: String(err?.message || err || "Relay non raggiungibile")
      },
      502,
      {
        ...corsHeaders(),
        "Cache-Control": "no-store",
        "x-cr-cache": "MISS",
        "x-cr-relay": "0"
      }
    );
  }
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => newHeaders.set(k, v));
  newHeaders.set("x-cr-cache", cacheStatus);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
async function signToken(env, payload) {
  const body = base64urlEncode(JSON.stringify(payload));
  const sig = await hmacSha256(env.LICENSE_SECRET, body);
  return `${body}.${sig}`;
}
async function makeSessionToken(env, email, passHash, now = Date.now(), accountId) {
  const av = await passwordVersion(
    env,
    SESSION_PASSWORD_VERSION_SCOPE,
    passHash
  );
  return signToken(env, {
    uid: accountId,
    kind: "session",
    email: normEmail(email),
    iat: now,
    exp: now + AUTH_SESSION_MS,
    av
  });
}
async function sessionPasswordVersionMatches(env, session, passHash) {
  if (!session?.av) return true;
  const expected = await passwordVersion(
    env,
    SESSION_PASSWORD_VERSION_SCOPE,
    passHash
  );
  return timingSafeEq(String(session.av), expected);
}
function isSessionPayloadCurrent(payload, now = Date.now()) {
  if (!payload?.email) return false;
  if (payload.kind && payload.kind !== "session") return false;
  const iat = Number(payload.iat || 0);
  if (!Number.isFinite(iat) || iat <= 0) return false;
  const exp = Number(payload.exp || 0);
  if (Number.isFinite(exp) && exp > 0) return now < exp;
  return now < iat + AUTH_SESSION_MS;
}
async function verifySignedToken(env, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmacSha256(env.LICENSE_SECRET, body);
  if (!timingSafeEq(sig, expected)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(body));
    return isSessionPayloadCurrent(payload) ? payload : null;
  } catch {
    return null;
  }
}
async function passwordVersion(env, scope, passHash) {
  return hmacSha256(
    env.LICENSE_SECRET,
    `${String(scope || "")}
${String(passHash || "")}`
  );
}
async function makePasswordResetToken(env, email, passHash, now = Date.now(), accountId) {
  const body = base64urlEncode(
    JSON.stringify({
      uid: accountId,
      email: normEmail(email),
      exp: now + PASSWORD_RESET_TTL_MS,
      pv: await passwordVersion(
        env,
        RESET_PASSWORD_VERSION_SCOPE,
        passHash
      ),
      iat: now,
      nonce: base64urlFromBytes(
        crypto.getRandomValues(new Uint8Array(16))
      )
    })
  );
  const sig = await hmacSha256(
    env.LICENSE_SECRET,
    `${PASSWORD_RESET_TOKEN_SCOPE}
${body}`
  );
  return `${body}.${sig}`;
}
async function verifyPasswordResetTokenEnvelope(env, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmacSha256(
    env.LICENSE_SECRET,
    `${PASSWORD_RESET_TOKEN_SCOPE}
${body}`
  );
  if (!timingSafeEq(sig, expected)) return null;
  try {
    return JSON.parse(base64urlDecode(body));
  } catch {
    return null;
  }
}
function passwordResetAppOrigin(env) {
  const configured = String(
    env.PASSWORD_RESET_APP_ORIGIN || "https://app.calcioreport.com"
  ).trim();
  return configured.replace(/\/+$/, "");
}
async function sendPasswordResetEmail(env, email, resetUrl) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("RESEND_API_KEY non configurata");
  const from = String(
    env.PASSWORD_RESET_FROM || "Calcio Report <noreply@mail.calcioreport.com>"
  ).trim();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reimposta la password di Calcio Report",
      text: `Hai richiesto di reimpostare la password di Calcio Report.

Apri questo link entro 20 minuti:
${resetUrl}

Se non hai richiesto tu il recupero, ignora questa email.`,
      html: `<p>Hai richiesto di reimpostare la password di Calcio Report.</p><p><a href="${resetUrl}">Reimposta password</a></p><p>Il link scade tra 20 minuti.</p><p>Se non hai richiesto tu il recupero, ignora questa email.</p>`
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Resend HTTP ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`
    );
  }
}
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
function readBearer(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}
function normEmail(s) {
  const e = String(s || "").trim().toLowerCase();
  return e.includes("@") ? e : "";
}
async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const hash2 = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(hash2);
}
function passwordV2Enabled(env) {
  return String(env?.AUTH_PASSWORD_V2 || "") === "1";
}
async function derivePasswordHash(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations
    },
    key,
    PASSWORD_HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const digest = await derivePasswordHash(
    password,
    salt,
    PASSWORD_PBKDF2_ITERATIONS
  );
  return [
    PASSWORD_HASH_PREFIX,
    String(PASSWORD_PBKDF2_ITERATIONS),
    base64urlFromBytes(salt),
    base64urlFromBytes(digest)
  ].join("$");
}
async function verifyPasswordHash(password, storedHash) {
  const stored = String(storedHash || "");
  if (stored.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    const parts = stored.split("$");
    if (parts.length !== 4) return { ok: false, needsUpgrade: false };
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1e7) {
      return { ok: false, needsUpgrade: false };
    }
    try {
      const salt = base64urlToBytes(parts[2]);
      const expected = base64urlToBytes(parts[3]);
      if (salt.length < PASSWORD_SALT_BYTES || expected.length !== PASSWORD_HASH_BYTES) {
        return { ok: false, needsUpgrade: false };
      }
      const actual = await derivePasswordHash(password, salt, iterations);
      const ok = timingSafeBytesEq(actual, expected);
      return {
        ok,
        needsUpgrade: ok && iterations < PASSWORD_PBKDF2_ITERATIONS
      };
    } catch {
      return { ok: false, needsUpgrade: false };
    }
  }
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const legacyHash = await sha256(password);
    const ok = timingSafeEq(legacyHash.toLowerCase(), stored.toLowerCase());
    return { ok, needsUpgrade: ok };
  }
  return { ok: false, needsUpgrade: false };
}
async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return base64urlFromBytes(new Uint8Array(sigBuf));
}
function bufToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex2 = "";
  for (const b of bytes) hex2 += b.toString(16).padStart(2, "0");
  return hex2;
}
function base64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  return base64urlFromBytes(bytes);
}
function base64urlDecode(s) {
  const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
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
function base64urlToBytes(value) {
  const s = String(value || "");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function timingSafeBytesEq(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
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
    "Access-Control-Expose-Headers": "x-cr-cache, x-cr-relay"
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
        corsHeaders()
      )
    };
  }
  const sess = await verifySignedToken(env, token);
  if (!sess?.email) {
    return {
      ok: false,
      res: json(
        { error: "AUTH_INVALID", message: "Sessione scaduta o non valida." },
        401,
        corsHeaders()
      )
    };
  }
  const u = await env.DB.prepare(
    "SELECT id, created_at, pass_hash, trial_ends_at, paid_until, COALESCE(disabled,0) as disabled FROM users WHERE email = ?"
  ).bind(sess.email).first();
  if (!u) {
    return {
      ok: false,
      res: json({ error: "USER_NOT_FOUND" }, 404, corsHeaders())
    };
  }
  if (!sessionBelongsToAccount(sess, u) || !await sessionPasswordVersionMatches(env, sess, u.pass_hash)) {
    return {
      ok: false,
      res: json(
        { error: "AUTH_INVALID", message: "Sessione scaduta o non valida." },
        401,
        corsHeaders()
      )
    };
  }
  if (Number(u.disabled || 0) === 1) {
    return {
      ok: false,
      res: json(
        { error: "ACCOUNT_DISABLED", message: "Account disabilitato." },
        403,
        corsHeaders()
      )
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
          paidUntil
        },
        402,
        corsHeaders()
      )
    };
  }
  return { ok: true, email: sess.email };
}
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
  const row = await env.DB.prepare("SELECT id, paid_until, created_at FROM users WHERE email = ?").bind(email).first();
  if (!row || !Number.isFinite(Number(session.created)) || Number(session.created) * 1e3 < Number(row.created_at || 0)) {
    console.warn("Stripe checkout ignored: missing account or checkout predates account");
    return new Response("Account unavailable for this checkout", { status: 200 });
  }
  if (env.PRO_PAYMENTS) {
    try {
      const outcome = await env.PRO_PAYMENTS.stripe(row, session, Date.now());
      return new Response(outcome.ignored ? "Ignored unpaid checkout" : "OK", { status: 200 });
    } catch (error) {
      return paymentDeliveryError(error);
    }
  }
  const now = Date.now();
  const currentPaid = Number(row?.paid_until || 0);
  const base = Math.max(now, currentPaid);
  const newPaidUntil = base + 30 * 24 * 60 * 60 * 1e3;
  await env.DB.prepare("UPDATE users SET paid_until = ? WHERE email = ? AND id = ?").bind(newPaidUntil, email, row.id).run();
  return new Response("OK", { status: 200 });
}
async function verifyStripeSignature(sigHeader, payload, webhookSecret) {
  const parts = String(sigHeader || "").split(",").map((s) => s.trim());
  const tPart = parts.find((p) => p.startsWith("t=")) || "";
  const v1Part = parts.find((p) => p.startsWith("v1=")) || "";
  const t = tPart.split("=")[1];
  const v1 = v1Part.split("=")[1];
  if (!t || !v1) return false;
  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1e3);
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
  let hex2 = "";
  for (const b of bytes) hex2 += b.toString(16).padStart(2, "0");
  return hex2;
}
function paymentDeliveryError(error) {
  if (error.message === "PRO_REDEEM_REISSUE_REQUIRED") {
    return json({ error: "CODE_REISSUE_REQUIRED", message: "Richiedi un nuovo codice di attivazione." }, 409, corsHeaders());
  }
  if (error.message === "PRO_ADMIN_OPERATION_INVALID") return json({ error: "BAD_INPUT" }, 400, corsHeaders());
  return json({ error: "PAYMENT_DELIVERY_UNAVAILABLE" }, 503, corsHeaders());
}

// worker/apple-verifier-client.mjs
var hex = (bytes) => [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, "0")).join("");
var encode = (text) => new TextEncoder().encode(text);
async function signedVerifierRequest(config, body, kind) {
  let url;
  try {
    url = new URL(config.url);
  } catch {
    throw Error("APPLE_VERIFIER_CONFIG_INVALID");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !/^[0-9a-f]{64}$/i.test(config.secret || "") || !["transaction", "notification"].includes(kind)) throw Error("APPLE_VERIFIER_CONFIG_INVALID");
  const path = `/v1/${kind}`;
  const timestamp3 = String(Date.now());
  const digest = hex(await crypto.subtle.digest("SHA-256", encode(body)));
  const key = await crypto.subtle.importKey("raw", encode(config.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = hex(await crypto.subtle.sign("HMAC", key, encode(`${timestamp3}
POST
${path}
${digest}`)));
  return fetch(new URL(path, url), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", "x-cr-timestamp": timestamp3, "x-cr-signature": signature },
    body,
    signal: AbortSignal.timeout(15e3)
  });
}
async function readVerifierJson(response, limit = 128 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("APPLE_VERIFIER_RESPONSE_INVALID");
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw Error("APPLE_VERIFIER_RESPONSE_INVALID");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  return JSON.parse(text);
}
async function fetchReconciledAppleTransaction(config, signedPayload, kind = "transaction") {
  if (typeof signedPayload !== "string" || encode(signedPayload).length > 128 * 1024) throw Error("APPLE_SIGNED_DATA_INVALID");
  const response = await signedVerifierRequest(config, JSON.stringify({ signedPayload }), kind);
  if (!response.ok) throw Error("APPLE_VERIFICATION_UNAVAILABLE");
  const result = await readVerifierJson(response);
  if (kind === "notification" && result?.ignored === true && result.transaction === null) return null;
  if (!result?.transaction || typeof result.transaction !== "object" || Array.isArray(result.transaction)) {
    throw Error("APPLE_VERIFIER_RESPONSE_INVALID");
  }
  return result.transaction;
}
async function probeAppleVerifier(config) {
  const response = await signedVerifierRequest(config, "{}", "transaction");
  const result = await readVerifierJson(response, 4096);
  return { ok: response.status === 400 && result?.error === "BAD_INPUT", upstreamStatus: response.status };
}

// worker/apple-readiness.mjs
var headers = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key"
};
var json2 = (body, status) => new Response(JSON.stringify(body), { status, headers });
function withAppleReadiness(handler) {
  return { async fetch(request, env, ctx) {
    if (new URL(request.url).pathname !== "/admin/apple-readiness") return handler.fetch(request, env, ctx);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const key = request.headers.get("x-admin-key");
    if (!key || !env.ADMIN_KEY || key !== env.ADMIN_KEY) return json2({ error: "FORBIDDEN" }, 403);
    if (request.method !== "POST") return json2({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (env.APPLE_DEPLOYMENT !== "production" || env.APPLE_ENVIRONMENT !== "Production" || env.APPLE_VERIFIER_URL !== "https://apple.calcioreport.com") {
      return json2({ ok: false, error: "APPLE_READINESS_CONFIG_INVALID" }, 503);
    }
    try {
      const result = await probeAppleVerifier({ url: env.APPLE_VERIFIER_URL, secret: env.APPLE_VERIFIER_SECRET });
      return json2({
        ok: result.ok,
        verifier: result.ok ? "HMAC_OK_BAD_INPUT" : "FAILED",
        upstreamStatus: result.upstreamStatus
      }, result.ok ? 200 : 503);
    } catch {
      return json2({ ok: false, error: "APPLE_READINESS_UNAVAILABLE" }, 503);
    }
  } };
}

// worker/community-interest.mjs
var headers2 = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key"
};
function withCommunityInterest(handler, core) {
  return { async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === "/community/interest" && request.method !== "OPTIONS") {
      if (request.method !== "POST") return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: { ...headers2, Allow: "POST" } });
      const result = await recordCommunityInterest(request, env, (req, e) => core.authenticatePurchaseAccount(req, e));
      return new Response(JSON.stringify(result.body), { status: result.status, headers: headers2 });
    }
    const response = await handler.fetch(request, env, ctx);
    if (path !== "/admin/stats" || request.method !== "GET" || !response.ok) return response;
    const body = await response.clone().json().catch(() => null);
    if (body?.ok !== true) return response;
    const out = new Headers(response.headers);
    out.set("Cache-Control", "no-store");
    return new Response(JSON.stringify({ ...body, communityInterested: await countCommunityInterest(env) }), { status: response.status, headers: out });
  } };
}
async function recordCommunityInterest(request, env, authenticate) {
  const account = await authenticate(request, env);
  if (!account) return { status: 401, body: { error: "AUTH_REQUIRED" } };
  if (account.id === env.APP_REVIEW_ACCOUNT_ID || env.APPLE_DEPLOYMENT === "test") {
    return { status: 200, body: { ok: true, recorded: false } };
  }
  try {
    await env.DB.prepare(
      "INSERT INTO community_interest (account_id, created_at) SELECT id, ? FROM users WHERE id = ? AND COALESCE(disabled,0) = 0 ON CONFLICT(account_id) DO NOTHING"
    ).bind(Date.now(), account.id).run();
    const row = await env.DB.prepare("SELECT account_id FROM community_interest WHERE account_id = ?").bind(account.id).first();
    if (!row) return { status: 401, body: { error: "AUTH_REQUIRED" } };
    return { status: 200, body: { ok: true, recorded: true } };
  } catch {
    return { status: 503, body: { error: "COMMUNITY_UNAVAILABLE" } };
  }
}
async function countCommunityInterest(env) {
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM community_interest AS c JOIN users AS u ON u.id = c.account_id WHERE COALESCE(u.disabled,0) = 0 AND u.id <> ?"
    ).bind(env.APP_REVIEW_ACCOUNT_ID || "").first();
    return Number(row?.c || 0);
  } catch {
    return null;
  }
}

// worker/pro-production-maintenance.mjs
var pausedRoutes = /* @__PURE__ */ new Map([
  ["/stripe/webhook", "POST"],
  ["/license/redeem", "POST"],
  ["/admin/grant", "POST"],
  ["/admin/adjust", "POST"],
  ["/admin/mint", "GET"],
  ["/auth/delete", "POST"],
  ["/admin/disable", "POST"]
]);
function withProductionProMaintenance(handler) {
  return {
    async fetch(request, env, ctx) {
      const path = new URL(request.url).pathname;
      if (env.PRO_WRITES_PAUSED === "1" && pausedRoutes.get(path) === request.method) {
        return new Response(JSON.stringify({
          error: "PRO_MAINTENANCE",
          message: "Manutenzione temporanea. Riprova pi\xF9 tardi."
        }), { status: 503, headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "retry-after": "60",
          "Access-Control-Allow-Origin": "*"
        } });
      }
      return handler.fetch(request, env, ctx);
    }
  };
}

// worker/apple-purchase-policy.mjs
var APPLE_PRO_DAYS = 30;
var APPLE_PRO_MS = APPLE_PRO_DAYS * 24 * 60 * 60 * 1e3;
var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var environments = /* @__PURE__ */ new Set(["Sandbox", "Production"]);
function fail(code) {
  throw new Error(code);
}
function timestamp(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function validateApplePurchase(transaction, account, config, now) {
  if (!timestamp(now) || !config || !environments.has(config.environment) || !["test", "production"].includes(config.deployment) || (config.deployment === "test" ? config.environment !== "Sandbox" : config.environment !== "Production") || typeof config.bundleId !== "string" || !config.bundleId || typeof config.productId !== "string" || !config.productId) fail("APPLE_CONFIG_INVALID");
  if (!account || typeof account.id !== "string" || !account.id || !timestamp(account.createdAt) || account.createdAt > now || ![0, false].includes(account.disabled) || typeof account.appAccountToken !== "string" || !uuid.test(account.appAccountToken)) fail("APPLE_ACCOUNT_UNAVAILABLE");
  const t = transaction;
  if (!t || t.environment !== config.environment || t.bundleId !== config.bundleId || t.productId !== config.productId || t.type !== "Non-Renewing Subscription" || t.quantity !== 1 || t.inAppOwnershipType !== "PURCHASED") fail("APPLE_PRODUCT_MISMATCH");
  if (typeof t.appAccountToken !== "string" || !uuid.test(t.appAccountToken) || t.appAccountToken.toLowerCase() !== account.appAccountToken.toLowerCase()) fail("APPLE_ACCOUNT_MISMATCH");
  for (const value of [t.transactionId, t.originalTransactionId]) {
    if (typeof value !== "string" || !/^[0-9]{1,64}$/.test(value)) fail("APPLE_TRANSACTION_INVALID");
  }
  if (!timestamp(t.purchaseDate) || t.purchaseDate < account.createdAt || t.purchaseDate > now || !timestamp(t.signedDate) || t.signedDate < t.purchaseDate || t.signedDate > now || !Number.isSafeInteger(t.purchaseDate + APPLE_PRO_MS)) fail("APPLE_DATE_INVALID");
  if (t.revocationDate != null || t.revocationReason != null) fail("APPLE_PURCHASE_REVOKED");
  return Object.freeze({
    environment: t.environment,
    transactionId: t.transactionId,
    originalTransactionId: t.originalTransactionId,
    accountId: account.id,
    appAccountToken: account.appAccountToken.toLowerCase(),
    productId: t.productId,
    purchasedAt: t.purchaseDate,
    signedAt: t.signedDate,
    durationMs: APPLE_PRO_MS
  });
}

// worker/apple-purchase-ledger.mjs
function fail2(code) {
  throw new Error(code);
}
function context(accountId, config, now) {
  if (typeof accountId !== "string" || !accountId || !Number.isSafeInteger(now) || now <= 0) fail2("APPLE_CONTEXT_INVALID");
  if (!config || !["test", "production"].includes(config.deployment) || config.environment !== (config.deployment === "test" ? "Sandbox" : "Production") || typeof config.bundleId !== "string" || !config.bundleId || typeof config.productId !== "string" || !config.productId) fail2("APPLE_CONFIG_INVALID");
}
function results(batch) {
  if (!Array.isArray(batch) || batch.length !== 2 || batch.some((r) => r.success !== true)) fail2("APPLE_STORAGE_FAILED");
  return batch[1].results?.[0];
}
async function ensureAppleAccountToken(db, accountId, config, now) {
  context(accountId, config, now);
  const token = crypto.randomUUID().toLowerCase();
  const row = results(await db.batch([
    db.prepare(`INSERT INTO apple_account_tokens
      (environment, account_id, app_account_token, created_at)
      SELECT ?, id, ?, ? FROM users
      WHERE id = ? AND COALESCE(disabled, 0) = 0 AND created_at > 0 AND created_at <= ?
      ON CONFLICT(environment, account_id) DO NOTHING`).bind(config.environment, token, now, accountId, now),
    db.prepare(`SELECT t.app_account_token FROM apple_account_tokens t
      JOIN users u ON u.id = t.account_id
      WHERE t.environment = ? AND t.account_id = ? AND t.retired_at IS NULL
      AND COALESCE(u.disabled, 0) = 0 AND u.created_at > 0 AND u.created_at <= ?`).bind(config.environment, accountId, now)
  ]));
  if (!row) fail2("APPLE_ACCOUNT_UNAVAILABLE");
  return row.app_account_token;
}
async function recordVerifiedApplePurchase(db, accountId, verifiedTransaction, config, now) {
  context(accountId, config, now);
  const account = await db.prepare(`SELECT u.id, u.created_at AS createdAt,
    COALESCE(u.disabled, 0) AS disabled, t.app_account_token AS appAccountToken
    FROM users u JOIN apple_account_tokens t ON t.account_id = u.id
    WHERE u.id = ? AND t.environment = ? AND t.retired_at IS NULL`).bind(accountId, config.environment).first();
  const p = validateApplePurchase(verifiedTransaction, account, config, now);
  const batch = await db.batch([
    db.prepare(`INSERT INTO apple_purchase_ledger
      (environment, transaction_id, original_transaction_id, account_id,
       app_account_token, product_id, purchased_at, signed_at, duration_ms, recorded_at)
      SELECT ?, ?, ?, u.id, t.app_account_token, ?, ?, ?, ?, ?
      FROM users u JOIN apple_account_tokens t ON t.account_id = u.id
      WHERE u.id = ? AND u.created_at = ? AND COALESCE(u.disabled, 0) = 0
      AND t.environment = ? AND t.app_account_token = ? AND t.retired_at IS NULL
      ON CONFLICT(environment, transaction_id) DO NOTHING`).bind(
      p.environment,
      p.transactionId,
      p.originalTransactionId,
      p.productId,
      p.purchasedAt,
      p.signedAt,
      p.durationMs,
      now,
      accountId,
      account.createdAt,
      p.environment,
      p.appAccountToken
    ),
    db.prepare(`SELECT l.* FROM apple_purchase_ledger l
      JOIN users u ON u.id = l.account_id
      JOIN apple_account_tokens t ON t.account_id = l.account_id AND t.environment = l.environment
      WHERE l.environment = ? AND l.transaction_id = ? AND l.account_id = ?
      AND u.created_at = ? AND COALESCE(u.disabled, 0) = 0 AND t.retired_at IS NULL
      AND t.app_account_token = ?`).bind(p.environment, p.transactionId, accountId, account.createdAt, p.appAccountToken)
  ]);
  const row = results(batch);
  if (!row) fail2("APPLE_PURCHASE_NOT_RECORDED");
  if (row.original_transaction_id !== p.originalTransactionId || row.app_account_token !== p.appAccountToken || row.product_id !== p.productId || row.purchased_at !== p.purchasedAt || row.duration_ms !== p.durationMs) {
    fail2("APPLE_TRANSACTION_CONFLICT");
  }
  return Object.freeze({
    state: "recorded",
    duplicate: batch[0].meta.changes === 0,
    transactionId: row.transaction_id,
    accountId: row.account_id,
    purchasedAt: row.purchased_at,
    durationMs: row.duration_ms
  });
}

// worker/pro-entitlements.mjs
var sources = /* @__PURE__ */ new Set(["apple", "stripe", "admin", "redeem"]);
var positive = (n) => Number.isSafeInteger(n) && n > 0;
var identifier = (s) => typeof s === "string" && /^[A-Za-z0-9:_-]{1,180}$/.test(s);
function fail3(code) {
  throw new Error(code);
}
function canonicalProEvent(event) {
  if (!event || !identifier(event.id) || !sources.has(event.source) || !positive(event.at)) fail3("PRO_EVENT_INVALID");
  if (event.order !== void 0 && (!Number.isSafeInteger(event.order) || event.order < 1 || event.source === "apple")) fail3("PRO_EVENT_INVALID");
  const ordering = event.order === void 0 ? {} : { order: event.order };
  if (event.kind === "grant" && positive(event.durationMs) && event.durationMs <= 365 * 864e5) {
    return {
      id: event.id,
      kind: "grant",
      source: event.source,
      at: event.at,
      durationMs: event.durationMs,
      ...ordering
    };
  }
  if (event.kind === "adjust" && event.source === "admin" && Number.isSafeInteger(event.deltaMs) && Math.abs(event.deltaMs) <= 365 * 864e5) {
    return { id: event.id, kind: "adjust", source: "admin", at: event.at, deltaMs: event.deltaMs, ...ordering };
  }
  if (event.kind === "status" && event.source === "apple" && identifier(event.targetId) && typeof event.revoked === "boolean") {
    return {
      id: event.id,
      kind: "status",
      source: "apple",
      at: event.at,
      targetId: event.targetId,
      revoked: event.revoked
    };
  }
  fail3("PRO_EVENT_INVALID");
}
function projectProUntil(baselineUntil, rawEvents) {
  if (!Number.isSafeInteger(baselineUntil) || baselineUntil < 0) fail3("PRO_BASELINE_INVALID");
  const events = rawEvents.map(canonicalProEvent);
  const ids = /* @__PURE__ */ new Set();
  const statuses = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (ids.has(e.id)) fail3("PRO_DUPLICATE_EVENT");
    ids.add(e.id);
    if (e.kind !== "status") continue;
    const old = statuses.get(e.targetId);
    if (!old || e.at > old.at || e.at === old.at && e.revoked) statuses.set(e.targetId, e);
  }
  let until = baselineUntil;
  const grants = events.filter((e) => e.kind === "grant" || e.kind === "adjust").sort((a, b) => a.at - b.at || (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const e of grants) {
    if (e.source === "apple" && statuses.get(e.id)?.revoked) continue;
    until = e.kind === "adjust" ? e.deltaMs < 0 ? Math.max(0, until + e.deltaMs) : Math.max(until, e.at) + e.deltaMs : Math.max(until, e.at) + e.durationMs;
    if (!Number.isSafeInteger(until)) fail3("PRO_EXPIRY_OVERFLOW");
  }
  return until;
}
function batchRows(batch) {
  if (!Array.isArray(batch) || batch.some((r) => r.success !== true)) fail3("PRO_STORAGE_FAILED");
  return batch;
}
async function applyProEvents(db, accountId, config, inputEvents, now) {
  if (!identifier(accountId) || !positive(now) || !["test", "production"].includes(config?.deployment) || config.environment !== (config.deployment === "test" ? "Sandbox" : "Production")) fail3("PRO_CONTEXT_INVALID");
  if (!Array.isArray(inputEvents) || !inputEvents.length || inputEvents.length > 10) fail3("PRO_EVENT_INVALID");
  const events = inputEvents.map(canonicalProEvent);
  if (events.some((e) => e.at > now) || new Set(events.map((e) => e.id)).size !== events.length) fail3("PRO_EVENT_INVALID");
  const env = config.environment;
  const seed = crypto.randomUUID();
  batchRows(await db.batch([
    db.prepare(`INSERT INTO pro_entitlement_accounts
      (environment, account_id, account_created_at, baseline_until, projected_until, revision)
      SELECT ?, u.id, u.created_at, COALESCE(u.paid_until,0), COALESCE(u.paid_until,0), ?
      FROM users u JOIN apple_account_tokens t ON t.account_id=u.id AND t.environment=?
      WHERE u.id=? AND COALESCE(u.disabled,0)=0 AND t.retired_at IS NULL
      AND u.created_at>0 AND u.created_at<=? AND COALESCE(u.paid_until,0)>=0
      ON CONFLICT(environment, account_id) DO NOTHING`).bind(env, seed, env, accountId, now)
  ]));
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await db.prepare(`SELECT p.*, COALESCE(u.paid_until,0) AS actual_until
      FROM pro_entitlement_accounts p JOIN users u ON u.id=p.account_id
      JOIN apple_account_tokens t ON t.account_id=p.account_id AND t.environment=p.environment
      WHERE p.environment=? AND p.account_id=? AND u.created_at=p.account_created_at
      AND COALESCE(u.disabled,0)=0 AND t.retired_at IS NULL`).bind(env, accountId).first();
    if (!state) fail3("PRO_ACCOUNT_UNAVAILABLE");
    if (state.actual_until !== state.projected_until) fail3("PRO_LEGACY_WRITE_CONFLICT");
    if (events.some((e) => e.at < state.account_created_at)) fail3("PRO_EVENT_PREDATES_ACCOUNT");
    const stored = await db.prepare(`SELECT event_id, account_id, event_json FROM pro_entitlement_events
      WHERE environment=? AND (account_id=? OR event_id IN (${events.map(() => "?").join(",")}))`).bind(env, accountId, ...events.map((e) => e.id)).all();
    if (stored.success !== true) fail3("PRO_STORAGE_FAILED");
    const old = new Map(stored.results.map((r) => [r.event_id, r]));
    const pending = [];
    for (const e of events) {
      const prior = old.get(e.id);
      if (prior && (prior.account_id !== accountId || prior.event_json !== JSON.stringify(e))) fail3("PRO_EVENT_CONFLICT");
      if (!prior) pending.push(e);
    }
    const all = stored.results.filter((r) => r.account_id === accountId).map((r) => JSON.parse(r.event_json));
    const until = projectProUntil(state.baseline_until, [...all, ...pending]);
    const activate = state.projected_until <= now && until > now && pending.some((e) => e.kind === "grant" || e.kind === "adjust" && e.deltaMs > 0);
    const operation = crypto.randomUUID();
    const result = batchRows(await db.batch([
      db.prepare(`UPDATE pro_entitlement_accounts SET projected_until=?, revision=?
        WHERE environment=? AND account_id=? AND revision=?
        AND EXISTS(SELECT 1 FROM users u JOIN apple_account_tokens t ON t.account_id=u.id
          WHERE u.id=? AND u.created_at=? AND COALESCE(u.disabled,0)=0
          AND COALESCE(u.paid_until,0)=? AND t.environment=? AND t.retired_at IS NULL)`).bind(
        until,
        operation,
        env,
        accountId,
        state.revision,
        accountId,
        state.account_created_at,
        state.projected_until,
        env
      ),
      ...pending.map((e) => db.prepare(`INSERT INTO pro_entitlement_events
        (environment,account_id,event_id,event_json,recorded_at)
        SELECT environment,account_id,?,?,? FROM pro_entitlement_accounts
        WHERE environment=? AND account_id=? AND revision=?`).bind(e.id, JSON.stringify(e), now, env, accountId, operation)),
      db.prepare(`UPDATE users SET paid_until=?, paid_activated_at=CASE WHEN ? THEN ? ELSE paid_activated_at END WHERE id=? AND created_at=?
        AND EXISTS(SELECT 1 FROM pro_entitlement_accounts
          WHERE environment=? AND account_id=? AND revision=?)`).bind(until, activate ? 1 : 0, now, accountId, state.account_created_at, env, accountId, operation)
    ]));
    if (result[0].meta.changes === 1) return Object.freeze({
      state: "applied",
      paidUntil: until,
      duplicate: pending.length === 0
    });
  }
  fail3("PRO_CONCURRENT_CHANGE_RETRY");
}

// worker/legacy-pro-delivery.mjs
var day = 864e5;
var validId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
var timestamp2 = (value) => Number.isSafeInteger(value) && value > 0;
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function createLegacyPayments(db, config, { cutover, stripePaymentLink } = {}) {
  if (!timestamp2(cutover) || !["test", "production"].includes(config?.deployment) || config.environment !== (config.deployment === "test" ? "Sandbox" : "Production")) {
    throw Error("PRO_PAYMENT_CONFIG_INVALID");
  }
  async function apply(account, operationId, facts, event, now) {
    if (!account?.id || !timestamp2(now) || now < cutover) throw Error("PRO_PAYMENT_CONTEXT_INVALID");
    await ensureAppleAccountToken(db, account.id, config, now);
    const fingerprint = await hash(JSON.stringify(facts));
    const result = await db.batch([
      db.prepare(`INSERT INTO pro_payment_operations
        (environment,operation_id,account_id,fingerprint,event_json,recorded_at)
        SELECT ?,?,id,?,?,? FROM users WHERE id=? AND created_at=? AND COALESCE(disabled,0)=0
        ON CONFLICT(environment,operation_id) DO NOTHING`).bind(config.environment, operationId, fingerprint, JSON.stringify(event), now, account.id, account.created_at),
      db.prepare(`SELECT sequence,account_id,fingerprint,event_json FROM pro_payment_operations
        WHERE environment=? AND operation_id=?`).bind(config.environment, operationId)
    ]);
    if (result.some((r) => r.success !== true)) throw Error("PRO_STORAGE_FAILED");
    const stored = result[1].results?.[0];
    if (!stored || stored.account_id !== account.id || stored.fingerprint !== fingerprint) {
      throw Error("PRO_PAYMENT_OPERATION_CONFLICT");
    }
    const recordedEvent = { ...JSON.parse(stored.event_json), order: stored.sequence };
    const outcome = await applyProEvents(db, account.id, config, [recordedEvent], Math.max(now, recordedEvent.at));
    return { ...outcome, operationId };
  }
  return Object.freeze({
    async stripe(account, session, now) {
      if (!/^plink_[A-Za-z0-9]+$/.test(stripePaymentLink || "")) throw Error("PRO_STRIPE_LINK_REQUIRED");
      if (session?.payment_link !== stripePaymentLink) throw Error("PRO_STRIPE_PRODUCT_MISMATCH");
      if (session.livemode !== (config.environment === "Production")) throw Error("PRO_STRIPE_ENVIRONMENT_MISMATCH");
      if (session.mode !== "payment" || session.payment_status !== "paid") return { ignored: true };
      if (!validId(session.id) || !session.id.startsWith("cs_") || !timestamp2(session.created) || !timestamp2(session.created * 1e3) || session.created * 1e3 > now) {
        throw Error("PRO_STRIPE_SESSION_INVALID");
      }
      if (session.created * 1e3 < cutover) throw Error("PRO_PRE_CUTOVER_RECONCILIATION_REQUIRED");
      if (config.deployment === "production" && (session.currency !== "eur" || session.amount_total !== 499)) {
        throw Error("PRO_STRIPE_AMOUNT_RECONCILIATION_REQUIRED");
      }
      const id = `stripe:${session.id}`;
      return apply(account, id, {
        source: "stripe",
        sessionId: session.id,
        created: session.created,
        paymentLink: stripePaymentLink
      }, { id, source: "stripe", kind: "grant", at: now, durationMs: 30 * day }, now);
    },
    async redeem(account, payload, now) {
      if (payload?.v !== 2 || payload.accountId !== account.id || !validId(payload.id) || !timestamp2(payload.issuedAt) || payload.issuedAt < cutover || payload.issuedAt < account.created_at || payload.issuedAt > now || !timestamp2(payload.exp) || payload.exp < now) throw Error("PRO_REDEEM_REISSUE_REQUIRED");
      const id = `redeem:${payload.id}`;
      return apply(
        account,
        id,
        { source: "redeem", id: payload.id, issuedAt: payload.issuedAt, exp: payload.exp },
        { id, source: "redeem", kind: "grant", at: now, durationMs: 30 * day },
        now
      );
    },
    async admin(account, deltaDays, requestId, now) {
      if (!validId(requestId) || !Number.isSafeInteger(deltaDays) || Math.abs(deltaDays) > 365) {
        throw Error("PRO_ADMIN_OPERATION_INVALID");
      }
      const id = `admin:${requestId}`;
      return apply(
        account,
        id,
        { source: "admin", deltaDays },
        { id, source: "admin", kind: "adjust", at: now, deltaMs: deltaDays * day },
        now
      );
    }
  });
}

// worker/apple-pro-delivery.mjs
async function deliverReconciledApplePurchase(db, accountId, currentTransaction, config, now) {
  const t = currentTransaction;
  if (!t) throw new Error("APPLE_CURRENT_STATE_REQUIRED");
  const revoked = t.revocationDate != null || t.revocationReason != null;
  if (revoked && (!Number.isSafeInteger(t.revocationDate) || t.revocationDate < t.purchaseDate || t.revocationDate > t.signedDate || t.revocationDate > now)) {
    throw new Error("APPLE_REVOCATION_INVALID");
  }
  const purchase = await recordVerifiedApplePurchase(
    db,
    accountId,
    { ...t, revocationDate: void 0, revocationReason: void 0 },
    config,
    now
  );
  const id = `apple:${t.transactionId}`;
  const result = await applyProEvents(db, accountId, config, [
    { id, kind: "grant", source: "apple", at: purchase.purchasedAt, durationMs: purchase.durationMs },
    {
      id: `${id}:${t.signedDate}:${revoked ? "revoked" : "active"}`,
      kind: "status",
      source: "apple",
      at: t.signedDate,
      targetId: id,
      revoked
    }
  ], now);
  return Object.freeze({ ...result, transactionId: t.transactionId });
}

// worker/apple-notification-owner.mjs
async function resolveNotificationOwner(env, config, transaction) {
  const databases = [env.DB];
  if (env.APPLE_REVIEW_NOTIFICATIONS_ENABLED === "1") {
    if (config.deployment !== "test" || config.environment !== "Sandbox" || !env.APP_REVIEW_DB || env.APP_REVIEW_DB === env.DB || !env.APP_REVIEW_ACCOUNT_ID) {
      throw Error("APPLE_NOTIFICATION_ROUTING_INVALID");
    }
    databases.push(env.APP_REVIEW_DB);
  }
  const matches = [];
  for (const db of databases) {
    const owner = await db.prepare(`SELECT account_id,retired_at FROM apple_account_tokens
      WHERE environment=? AND app_account_token=?`).bind(config.environment, transaction.appAccountToken.toLowerCase()).first();
    if (owner) matches.push({ db, owner });
  }
  if (matches.length !== 1) throw Error("APPLE_NOTIFICATION_OWNER_AMBIGUOUS_OR_UNKNOWN");
  const match = matches[0];
  if (match.db === env.APP_REVIEW_DB && match.owner.retired_at === null && match.owner.account_id !== env.APP_REVIEW_ACCOUNT_ID) {
    throw Error("APPLE_NOTIFICATION_REVIEW_ACCOUNT_INVALID");
  }
  return match;
}

// worker/apple-handler.mjs
var headers3 = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
var json3 = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: headers3 });
async function readPayload(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("BAD_INPUT");
  let size = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 192 * 1024) throw Error("BODY_TOO_LARGE");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  const body = JSON.parse(text);
  if (typeof body?.signedPayload !== "string") throw Error("BAD_INPUT");
  return body.signedPayload;
}
function createAppleHandler(core, deployment, dependencies = {}) {
  if (!["test", "production"].includes(deployment)) throw Error("APPLE_CONFIG_INVALID");
  const production = deployment === "production";
  const config = Object.freeze({
    deployment,
    environment: production ? "Production" : "Sandbox",
    bundleId: "com.calcioreport.app",
    productId: "com.calcioreport.app.pro30"
  });
  const enabledKey = production ? "APPLE_PRODUCTION_ENABLED" : "APPLE_SANDBOX_ENABLED";
  const ensureToken = dependencies.ensureToken || ensureAppleAccountToken;
  const reconcile = dependencies.reconcile || fetchReconciledAppleTransaction;
  const deliver = dependencies.deliver || deliverReconciledApplePurchase;
  return {
    async fetch(request, env, ctx) {
      const path = new URL(request.url).pathname;
      if (!path.startsWith("/apple/")) {
        if (!production && env.PRO_LEDGER_ENABLED !== "1" && env[enabledKey] === "1" && ["/stripe/webhook", "/license/redeem", "/admin/grant", "/admin/adjust"].includes(path)) {
          return json3({ error: "SANDBOX_LEGACY_PAYMENT_DISABLED" }, 503);
        }
        if (env.PRO_LEDGER_ENABLED === "1") {
          try {
            const payments = createLegacyPayments(env.DB, config, {
              cutover: Number(env.PRO_LEDGER_CUTOVER_MS),
              stripePaymentLink: env.STRIPE_PRO_PAYMENT_LINK_ID
            });
            return core.fetch(request, { ...env, PRO_PAYMENTS: payments }, ctx);
          } catch {
            return json3({ error: "PRO_PAYMENT_CONFIG_INVALID" }, 503);
          }
        }
        return core.fetch(request, env, ctx);
      }
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers3 });
      if (env[enabledKey] !== "1") return json3({ error: "APPLE_PURCHASES_DISABLED" }, 503);
      if (env.APPLE_DEPLOYMENT !== config.deployment || env.APPLE_ENVIRONMENT !== config.environment) return json3({ error: "APPLE_CONFIG_INVALID" }, 503);
      if (production) return json3({ error: "APPLE_PRODUCTION_NOT_READY" }, 503);
      if (!(path === "/apple/token" && request.method === "GET" || ["/apple/transaction", "/apple/notifications"].includes(path) && request.method === "POST")) return json3({ error: "NOT_FOUND" }, 404);
      try {
        if (path === "/apple/notifications") {
          const signedPayload2 = await readPayload(request);
          const transaction2 = await reconcile({
            url: env.APPLE_VERIFIER_URL,
            secret: env.APPLE_VERIFIER_SECRET
          }, signedPayload2, "notification");
          if (transaction2 === null) return json3({ ok: true, ignored: true });
          if (typeof transaction2.appAccountToken !== "string" || transaction2.environment !== config.environment) {
            return json3({ error: "APPLE_NOTIFICATION_ACCOUNT_INVALID" }, 503);
          }
          const { db, owner } = await resolveNotificationOwner(env, config, transaction2);
          if (owner.retired_at !== null) return json3({ ok: true, ignored: true });
          await deliver(db, owner.account_id, transaction2, config, Date.now());
          return json3({ ok: true });
        }
        const account = await core.authenticatePurchaseAccount(request, env);
        if (!account) return json3({ error: "AUTH_INVALID" }, 401);
        const now = Date.now();
        if (path === "/apple/token") {
          const appAccountToken = await ensureToken(env.DB, account.id, config, now);
          return json3({ appAccountToken, productId: config.productId, environment: config.environment });
        }
        const signedPayload = await readPayload(request);
        const transaction = await reconcile({
          url: env.APPLE_VERIFIER_URL,
          secret: env.APPLE_VERIFIER_SECRET
        }, signedPayload);
        const outcome = await deliver(env.DB, account.id, transaction, config, Date.now());
        return json3({ ok: true, ...outcome });
      } catch (error) {
        if (error.message === "BODY_TOO_LARGE") return json3({ error: "BODY_TOO_LARGE" }, 413);
        if (error instanceof SyntaxError || error.message === "BAD_INPUT") return json3({ error: "BAD_INPUT" }, 400);
        return json3({ error: "APPLE_DELIVERY_UNAVAILABLE" }, 503);
      }
    }
  };
}

// worker/app-review-router.mjs
var prefix = "cr-review:";
var json4 = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  "content-type": "application/json",
  "cache-control": "no-store",
  "Access-Control-Allow-Origin": "*"
} });
var normalize = (value) => String(value || "").trim().toLowerCase();
function reviewEnvironment(env) {
  if (env.APP_REVIEW_ENABLED !== "1" || !env.APP_REVIEW_DB || env.APP_REVIEW_DB === env.DB || !env.APP_REVIEW_ACCOUNT_ID || !env.APP_REVIEW_ACCOUNT_EMAIL || !env.APP_REVIEW_LICENSE_SECRET || env.APP_REVIEW_LICENSE_SECRET === env.LICENSE_SECRET || !env.APP_REVIEW_VERIFIER_URL || !env.APP_REVIEW_VERIFIER_SECRET) throw Error("REVIEW_CONFIG_INVALID");
  return {
    ...env,
    DB: env.APP_REVIEW_DB,
    LICENSE_SECRET: env.APP_REVIEW_LICENSE_SECRET,
    APPLE_DEPLOYMENT: "test",
    APPLE_ENVIRONMENT: "Sandbox",
    APPLE_SANDBOX_ENABLED: "1",
    APPLE_VERIFIER_URL: env.APP_REVIEW_VERIFIER_URL,
    APPLE_VERIFIER_SECRET: env.APP_REVIEW_VERIFIER_SECRET,
    PRO_LEDGER_ENABLED: "0",
    ADMIN_KEY: void 0,
    STRIPE_WEBHOOK_SECRET: void 0,
    RESEND_API_KEY: void 0
  };
}
function withToken(request, token) {
  const headers4 = new Headers(request.headers);
  headers4.set("Authorization", `Bearer ${token}`);
  headers4.delete("x-admin-key");
  return new Request(request, { headers: headers4 });
}
function createAppReviewRouter(production, sandbox, core) {
  return { async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    const authorization = request.headers.get("Authorization") || "";
    const reviewToken = authorization.startsWith(`Bearer ${prefix}`);
    let reviewLogin = false;
    if (request.method === "POST" && ["/auth/login", "/auth/register", "/auth/forgot"].includes(path)) {
      const body = await request.clone().json().catch(() => null);
      reviewLogin = !!env.APP_REVIEW_ACCOUNT_EMAIL && normalize(body?.email) === normalize(env.APP_REVIEW_ACCOUNT_EMAIL);
    }
    if (!reviewToken && !reviewLogin) return production.fetch(request, env, ctx);
    try {
      const reviewEnv = reviewEnvironment(env);
      if (reviewLogin) {
        if (path !== "/auth/login") return json4({ error: "REVIEW_ACCOUNT_MANAGED" }, 403);
        const response2 = await core.fetch(request, reviewEnv, ctx);
        if (!response2.ok) return response2;
        const body = await response2.json();
        if (!body.ok || typeof body.token !== "string") throw Error("REVIEW_LOGIN_INVALID");
        const account2 = await core.authenticatePurchaseAccount(withToken(new Request(request.url), body.token), reviewEnv);
        if (account2?.id !== env.APP_REVIEW_ACCOUNT_ID) return json4({ error: "AUTH_INVALID" }, 401);
        const headers4 = new Headers(response2.headers);
        headers4.set("cache-control", "no-store");
        return new Response(JSON.stringify({ ...body, token: prefix + body.token }), { status: response2.status, headers: headers4 });
      }
      const routed = withToken(request, authorization.slice(`Bearer ${prefix}`.length));
      const account = await core.authenticatePurchaseAccount(routed, reviewEnv);
      if (account?.id !== env.APP_REVIEW_ACCOUNT_ID) return json4({ error: "AUTH_INVALID" }, 401);
      if (path.startsWith("/admin/") || path.startsWith("/stripe/") || path.startsWith("/license/") || ["/apple/notifications", "/auth/reset", "/auth/register", "/auth/forgot", "/auth/login"].includes(path)) {
        return json4({ error: "REVIEW_ROUTE_UNAVAILABLE" }, 403);
      }
      if (path === "/community/interest" && request.method === "POST") {
        return json4({ ok: true, recorded: false });
      }
      const response = await sandbox.fetch(routed, reviewEnv, ctx);
      if (path === "/apple/token" && response.ok) {
        const body = await response.json();
        if (body.environment !== "Sandbox") throw Error("REVIEW_CONTEXT_INVALID");
        return json4({ ...body, audience: "app-review" });
      }
      return response;
    } catch {
      return json4({ error: "REVIEW_UNAVAILABLE" }, 503);
    }
  } };
}

// worker/apple-production-entry.mjs
var apple_production_entry_default = createAppReviewRouter(
  withProductionProMaintenance(withAppleReadiness(withCommunityInterest(createAppleHandler(worker_default, "production"), worker_default))),
  createAppleHandler(worker_default, "test"),
  worker_default
);
export {
  apple_production_entry_default as default
};
