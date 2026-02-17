// app.js
// - Bottone: Login -> Logout quando autenticato
// - Auto logout dopo 6 ore (token scaduto localmente)
// - Badge in header: TRIAL/PRO + giorni rimanenti
// - Messaggio post-registrazione (spiega TRIAL vs PRO)
// - Lock PRO (blur + badge) su elementi con data-pro-only="1"

const SESSION_MAX_MS = 6 * 60 * 60 * 1000; // 6 ore
const LS_TOKEN = "CR_TOKEN";
const LS_LOGIN_TS = "CR_LOGIN_TS";

function daysLeft(ts) {
  const diff = Number(ts || 0) - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function setAuthMsg(msg) {
  const el = document.getElementById("authMsg");
  if (el) el.textContent = msg || "";
}

function getToken() {
  return localStorage.getItem(LS_TOKEN) || "";
}

function isSessionExpired() {
  const ts = Number(localStorage.getItem(LS_LOGIN_TS) || 0);
  if (!ts) return false;
  return Date.now() - ts > SESSION_MAX_MS;
}

function forceLogout(reasonMsg = "") {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_LOGIN_TS);
  if (reasonMsg) alert(reasonMsg);
  location.reload();
}

async function fetchMe() {
  const baseUrl = window.API_CONFIG?.baseUrl;
  const token = getToken();
  if (!baseUrl || !token) return { ok: false, status: 0, json: null };

  try {
    const res = await fetch(baseUrl + "/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json: j };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

function setBadge(type, text) {
  const badge = document.getElementById("statusBadge");
  if (!badge) return;

  badge.classList.remove("hidden", "trial", "pro", "expired");

  if (!type) {
    badge.classList.add("hidden");
    badge.textContent = "";
    return;
  }

  badge.classList.add(type);
  badge.textContent = text || "";
}

function applyProLocks(meJson) {
  const now = Number(meJson?.now || Date.now());
  const paidUntil = Number(meJson?.paidUntil || 0);
  const isPro = now < paidUntil;

  const proBlocks = document.querySelectorAll("[data-pro-only='1']");
  proBlocks.forEach((el) => {
    if (isPro) el.classList.remove("pro-locked");
    else el.classList.add("pro-locked");
  });
}

async function refreshTopAuthUI() {
  const btn = document.getElementById("btnOpenAuth");
  if (!btn) return;

  // sessione scaduta localmente
  if (getToken() && isSessionExpired()) {
    forceLogout("Sessione scaduta (6 ore). Effettua di nuovo il login.");
    return;
  }

  const { json } = await fetchMe();

  // NON loggato
  if (!json?.ok) {
    btn.textContent = "Login";
    btn.classList.remove("pro-active", "trial-active", "expired");
    setBadge(null, "");
    return;
  }

  // Loggato -> bottone diventa Logout
  btn.textContent = "Logout";

  const now = Number(json.now || Date.now());
  const trialEndsAt = Number(json.trialEndsAt || 0);
  const paidUntil = Number(json.paidUntil || 0);

  // PRO
  if (now < paidUntil) {
    btn.classList.add("pro-active");
    btn.classList.remove("trial-active", "expired");
    setBadge("pro", `PRO • ${daysLeft(paidUntil)}g rim.`);
    return;
  }

  // TRIAL
  if (now < trialEndsAt) {
    btn.classList.add("trial-active");
    btn.classList.remove("pro-active", "expired");
    setBadge("trial", `TRIAL • ${daysLeft(trialEndsAt)}g rim.`);
    return;
  }

  // SCADUTO
  btn.classList.add("expired");
  btn.classList.remove("pro-active", "trial-active");
  setBadge("expired", "SCADUTO");
}

async function authPost(path, body) {
  const baseUrl = window.API_CONFIG?.baseUrl;
  const res = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json: j };
}

async function showRemainingInPopup() {
  const me = await fetchMe();
  const json = me?.json;

  if (!json?.ok) {
    setAuthMsg("Accedi o registrati per iniziare la prova gratuita di 7 giorni.");
    return;
  }

  const now = Number(json.now || Date.now());
  const trialEndsAt = Number(json.trialEndsAt || 0);
  const paidUntil = Number(json.paidUntil || 0);

  if (now < paidUntil) {
    setAuthMsg(`PRO attivo: ${daysLeft(paidUntil)} giorni rimanenti.`);
  } else if (now < trialEndsAt) {
    setAuthMsg(`TRIAL attivo: ${daysLeft(trialEndsAt)} giorni rimanenti.`);
  } else {
    setAuthMsg("Prova scaduta: inserisci codice o contattami per attivazione.");
  }
}

function openAuthModal() {
  document.getElementById("authModal")?.classList.remove("hidden");
  showRemainingInPopup();
}

function closeAuthModal() {
  document.getElementById("authModal")?.classList.add("hidden");
}

function setupTopButton() {
  const btn = document.getElementById("btnOpenAuth");
  if (!btn) return;

  btn.addEventListener("click", () => {
    // se loggato -> logout
    if (getToken()) {
      forceLogout();
      return;
    }
    // se non loggato -> apri modal
    openAuthModal();
  });
}

function setupAuthActions() {
  const loginBtn = document.getElementById("btnLogin");
  const registerBtn = document.getElementById("btnRegister");
  const redeemBtn = document.getElementById("btnRedeem");

  if (!loginBtn || !registerBtn || !redeemBtn) return;

  loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("authEmail")?.value || "";
    const password = document.getElementById("authPass")?.value || "";

    const res = await authPost("/auth/login", { email, password });

    if (res.ok && res.json?.token) {
      localStorage.setItem(LS_TOKEN, res.json.token);
      localStorage.setItem(LS_LOGIN_TS, String(Date.now()));

      setAuthMsg("Login effettuato.");

      await refreshTopAuthUI();

      const me = await fetchMe();
      if (me?.json?.ok) applyProLocks(me.json);

      closeAuthModal();
    } else {
      setAuthMsg(res.json?.message || "Errore login.");
    }
  });

  registerBtn.addEventListener("click", async () => {
    const email = document.getElementById("authEmail")?.value || "";
    const password = document.getElementById("authPass")?.value || "";

    const res = await authPost("/auth/register", { email, password });

    if (res.ok && res.json?.token) {
      localStorage.setItem(LS_TOKEN, res.json.token);
      localStorage.setItem(LS_LOGIN_TS, String(Date.now()));

      const me = await fetchMe();
      const json = me?.json;

      const d = json?.trialEndsAt ? daysLeft(json.trialEndsAt) : 7;

      setAuthMsg(
        `✅ Registrazione completata!\n` +
          `TRIAL attivo: ${d} giorni rimanenti.\n\n` +
          `In TRIAL vedi: Match, Arbitro, Squadre, Corner, Tiri, Falli, Indisponibili.\n` +
          `🔒 SOLO ABBONAMENTO: Predizione Poisson e percentuali avanzate negli Indicatori.\n\n` +
          `Quando vuoi, inserisci un codice attivazione (30 giorni) per sbloccare tutto.`
      );

      await refreshTopAuthUI();
      if (json?.ok) applyProLocks(json);

      closeAuthModal();
    } else {
      setAuthMsg(res.json?.message || "Errore registrazione.");
    }
  });

  redeemBtn.addEventListener("click", async () => {
    const code = document.getElementById("redeemCode")?.value || "";
    const token = getToken();

    if (!token) {
      setAuthMsg("Devi fare login prima.");
      return;
    }

    const res = await fetch(window.API_CONFIG.baseUrl + "/license/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      localStorage.setItem(LS_LOGIN_TS, String(Date.now()));

      setAuthMsg("Abbonamento attivato per 30 giorni.");
      await refreshTopAuthUI();

      const me = await fetchMe();
      if (me?.json?.ok) applyProLocks(me.json);

      closeAuthModal();
    } else {
      setAuthMsg(data.message || "Codice non valido.");
    }
  });
}

function setupModalClose() {
  document.getElementById("btnCloseAuth")?.addEventListener("click", closeAuthModal);
  document.getElementById("authModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "authModal") closeAuthModal();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupTopButton();
  setupAuthActions();
  setupModalClose();

  // ✅ LISTENER GLOBALI (una sola volta)
  window.addEventListener("cr:auth", () => {
    setAuthMsg("Devi fare login per continuare.");
    openAuthModal();
  });

  window.addEventListener("cr:paywall", (e) => {
    const msg =
      e?.detail?.json?.message ||
      "Prova scaduta: inserisci un codice o contattami.";
    setAuthMsg(msg);
    openAuthModal();
  });

  await refreshTopAuthUI();

  const me = await fetchMe();
  if (me?.json?.ok) applyProLocks(me.json);
});
