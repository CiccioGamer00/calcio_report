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
    __IS_PRO__ = false;
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
    __IS_PRO__ = true;
    return;
  }

  // TRIAL
  if (now < trialEndsAt) {
    btn.classList.add("trial-active");
    btn.classList.remove("pro-active", "expired");
    setBadge("trial", `TRIAL • ${daysLeft(trialEndsAt)}g rim.`);
    __IS_PRO__ = false;
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

function goToPayment() {
  const url =
    window.API_CONFIG?.paypalUrl ||
    window.API_CONFIG?.paymentUrl ||
    "";

  if (url) {
    window.open(url, "_blank", "noopener");
    return;
  }

  // fallback: se non configurato, apri login
  openAuthModal();
}
// =========================
// PRO upsell (Telegram group)
// =========================
function showProUpsell(featureName = "questa sezione") {
  const tg = window.API_CONFIG?.telegramUrl || "";
  const msg =
    `🔒 ${featureName} è riservata agli utenti PRO.\n\n` +
    `Vuoi sbloccarla? Scrivimi nel gruppo Telegram e chiedi info in privato:\n` +
    `ti spiego attivazione + pagamento e ti abilito subito.`;

  // se abbiamo il link gruppo, proponiamo apertura
  if (tg) {
    const ok = confirm(msg + "\n\nAprire Telegram adesso?");
    if (ok) window.open(tg, "_blank", "noopener");
    return;
  }

  alert(msg + "\n\n(Errore: link Telegram non configurato in config.js)");
}

function setupProLockCTA() {
  // Clic su una sezione PRO bloccata -> pagamento (se configurato) oppure login
  document.addEventListener("click", (e) => {
    const locked = e.target?.closest?.(".pro-locked");
    if (!locked) return;
    e.preventDefault();
    e.stopPropagation();
    goToPayment();
  });
}

function setupTelegramHeader() {
  const a = document.getElementById("btnTelegramHeader");
  if (!a) return;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const url = window.API_CONFIG?.telegramUrl || "";
    if (!url) {
      alert("Link Telegram non configurato in config.js");
      return;
    }
    window.open(url, "_blank", "noopener");
  });
}
function setupTabsStage() {
  const nav = document.getElementById("panelTabs");
  if (!nav) return;

  function show(viewId) {
    // match non è nello stage: quando clicchi "Match", chiudiamo tutto nello stage
    document.querySelectorAll("#stage .stageView").forEach(el => el.classList.add("hidden"));

    if (viewId === "match") return;

    const el = document.getElementById(viewId);
    if (el) el.classList.remove("hidden");
  }

  nav.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".tab");
    if (!btn) return;

    const view = btn.getAttribute("data-view");
    const isProTab = btn.getAttribute("data-pro-tab") === "1";

    // gate PRO (se già hai __IS_PRO__ / goToPayment, usa quelli)
    if (isProTab && typeof window.__IS_PRO__ !== "undefined" && !window.__IS_PRO__) {
      if (typeof goToPayment === "function") goToPayment();
      return;
    }

    nav.querySelectorAll(".tab").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    show(view);
  });

  // default: Match attivo
  show("match");
}

function setupSupportEmailFooter() {
  const a = document.getElementById("supportEmailLink");
  if (!a) return;
  const mail = window.API_CONFIG?.supportEmail || "";
  if (!mail) {
    a.textContent = "(imposta email)";
    a.href = "#";
    return;
  }
  a.textContent = mail;
  a.href = `mailto:${mail}`;
}

function setupPayPalButton() {
  const btn = document.getElementById("btnPayPal");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    goToPayment();
  });
}
// =========================
// UI: Tabs + Loader overlay
// =========================
let __LOADER_COUNT__ = 0;
let __IS_PRO__ = false;
// =========================
// HELP / TOAST (panel hints)
// =========================
const LS_HINTS = "CR_HINTS_OFF"; // JSON: { [key]: true }
function getHintsOff() {
  try { return JSON.parse(localStorage.getItem(LS_HINTS) || "{}"); }
  catch { return {}; }
}
function setHintOff(key) {
  const m = getHintsOff();
  m[key] = true;
  localStorage.setItem(LS_HINTS, JSON.stringify(m));
}

function showToast({ key = "", title = "", text = "", allowDisable = true, ctaLabel = "", ctaUrl = "" } = {}) {
  const el = document.getElementById("crToast");
  if (!el) return;

  // se disattivato per quel key, non mostrare
  if (key) {
    const off = getHintsOff();
    if (off[key]) return;
  }

  el.innerHTML = `
    <div class="tTop">
      <div>
        <div class="tTitle">${title}</div>
        <div class="tText">${text}</div>
      </div>
      <button type="button" class="tClose" data-tclose="1">Chiudi</button>
    </div>
       <div class="tActions">
      ${ctaLabel && ctaUrl ? `<button type="button" class="tClose" data-tcta="1">${ctaLabel}</button>` : ``}
      ${allowDisable && key ? `<button type="button" class="tLink" data-tdisable="1" data-key="${key}">Non mostrare più</button>` : ``}
    </div>
  `;

  el.classList.remove("hidden");

  // click handlers (semplici)
  el.querySelector("[data-tclose='1']")?.addEventListener("click", () => {
    el.classList.add("hidden");
    el.innerHTML = "";
  });
    el.querySelector("[data-tcta='1']")?.addEventListener("click", () => {
    if (ctaUrl) window.open(ctaUrl, "_blank", "noopener");
    el.classList.add("hidden");
    el.innerHTML = "";
  });

  el.querySelector("[data-tdisable='1']")?.addEventListener("click", (e) => {
    const k = e.currentTarget?.getAttribute("data-key") || "";
    if (k) setHintOff(k);
    el.classList.add("hidden");
    el.innerHTML = "";
  });
}

const PANEL_HINTS = {
  matchView: {
    key: "hint_match",
    title: "Scheda Match ⚽",
    text: "Qui trovi il prossimo match (data, stadio) e le info principali. Le formazioni compaiono quando disponibili."
  },
  referee: {
    key: "hint_referee",
    title: "Scheda Arbitro 🧑‍⚖️",
    text: "Dettagli dell’arbitro e storico recente: utile per capire lo “stile” della partita."
  },
  teamsPanel: {
    key: "hint_teams",
    title: "Scheda Squadre 👥",
    text: "Forma e trend delle due squadre sulle ultime partite selezionate (menu Partite)."
  },
  cornersPanel: {
    key: "hint_corners",
    title: "Scheda Corner 🚩",
    text: "Statistiche corner delle due squadre (ultime partite): ritmo, pressione, propensione offensiva."
  },
  shotsPanel: {
    key: "hint_shots",
    title: "Scheda Tiri 🎯",
    text: "Tiri totali e tiri in porta: misura pericolosità e volume offensivo."
  },
  injuriesPanel: {
    key: "hint_injuries",
    title: "Scheda Indisponibili 🩹",
    text: "Infortunati/squalificati e (quando possibile) ruolo: impatta molto lettura match."
  },
  standingsPanel: {
    key: "hint_standings",
    title: "Scheda Classifica 🏆",
    text: "Posizione, punti e contesto in campionato: utile per motivazioni e obiettivi."
  },
  indicatorsPanel: {
    key: "hint_indicators",
    title: "Scheda Indicatori 📊 (PRO)",
    text: "Indicatori stile bookmaker con hit-rate e dettagli: pensati per una lettura rapida e “da betting”."
  },
  predictionPanel: {
    key: "hint_prediction",
    title: "Scheda Predizione 🧠 (PRO)",
    text: "Stime e percentuali avanzate (modello): da usare come supporto, non come verità assoluta."
  }
};

function showLoader(msg) {
  __LOADER_COUNT__++;
  const el = document.getElementById("crLoader");
  const msgEl = document.getElementById("crLoaderMsg");
  if (!el) return;

  const phrases = [
    "Il pallone sta rotolando… ⚽",
    "Stiamo scaldando i motori… 🔥",
    "Recupero statistiche dal VAR… 📺",
    "Cross in area… arriva il dato! 🎯",
    "Contropiede in corso… 🏃‍♂️",
    "Parata del server… quasi! 🧤",
  ];

  if (msgEl) msgEl.textContent = msg || phrases[Math.floor(Math.random() * phrases.length)];
  el.classList.remove("hidden");
}

function hideLoader() {
  __LOADER_COUNT__ = Math.max(0, __LOADER_COUNT__ - 1);
  const el = document.getElementById("crLoader");
  if (!el) return;
  if (__LOADER_COUNT__ === 0) el.classList.add("hidden");
}

function setViewAll() {
  document.body.dataset.viewMode = "all";
  document.body.removeAttribute("data-view-mode");
  document.querySelectorAll(".card.is-focus").forEach((c) => c.classList.remove("is-focus"));
}

function setViewSingleById(contentId) {
  // contentId è l'id del DIV content (es: "match", "referee", "teamsPanel"...)
  const content = document.getElementById(contentId);
  const card = content?.closest?.(".card");
  if (!card) return;

  document.body.dataset.viewMode = "single";
  document.body.setAttribute("data-view-mode", "single");

  // reset focus
  document.querySelectorAll(".card.is-focus").forEach((c) => c.classList.remove("is-focus"));
  card.classList.add("is-focus");

  // scroll carino
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

function markActiveTab(btn) {
  document.querySelectorAll("#panelTabs .tab").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");
}

function setupTabs() {
  const nav = document.getElementById("panelTabs");
  if (!nav) return;

  // cache: evitiamo di ricaricare sempre
  window.__PANEL_LOADED__ = window.__PANEL_LOADED__ || {
    referee: false,
    teamsPanel: false,
    cornersPanel: false,
    shotsPanel: false,
    injuriesPanel: false,
    indicatorsPanel: false,
    predictionPanel: false,
    standingsPanel:false
  };

  function showView(viewId) {
    document.querySelectorAll(".stageView").forEach((el) => el.classList.add("hidden"));
    const el = document.getElementById(viewId);
    if (el) el.classList.remove("hidden");

    document.getElementById("viewportCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function autoLoadFor(viewId) {
    // Match: niente fetch extra qui
    if (viewId === "matchView") return;
    if (viewId === "standingsPanel" && typeof loadStandings === "function") {
  window.__PANEL_LOADED__.standingsPanel = true;
  await loadStandings();
}

    // PRO gate
    const isProTab =
      viewId === "predictionPanel" || viewId === "indicatorsPanel";

    if (isProTab && !__IS_PRO__) return;

    // Se non ho fixture selezionato, non carico
    if (!selectedFixture?.id) return;

    // load solo se non già caricato
    const loaded = window.__PANEL_LOADED__[viewId];
    if (loaded) return;

    try {
      if (viewId === "referee" && typeof loadFixtureDetails === "function") {
        window.__PANEL_LOADED__.referee = true;
        await loadFixtureDetails();
      }
      if (viewId === "teamsPanel" && typeof loadTeamsForm === "function") {
        window.__PANEL_LOADED__.teamsPanel = true;
        await loadTeamsForm();
      }
      if (viewId === "cornersPanel" && typeof loadTeamsCorners === "function") {
        window.__PANEL_LOADED__.cornersPanel = true;
        await loadTeamsCorners();
      }
      if (viewId === "shotsPanel" && typeof loadTeamsShots === "function") {
        window.__PANEL_LOADED__.shotsPanel = true;
        await loadTeamsShots();
      }
      if (viewId === "injuriesPanel" && typeof loadInjuries === "function") {
        window.__PANEL_LOADED__.injuriesPanel = true;
        await loadInjuries();
      }

      if (viewId === "predictionPanel" && typeof window.loadPrediction === "function") {
        window.__PANEL_LOADED__.predictionPanel = true;
        await window.loadPrediction();
      }

      if (viewId === "indicatorsPanel") {
        window.__PANEL_LOADED__.indicatorsPanel = true;
        // attiva e carica come già previsto dal tuo teamFlow
        if (typeof window.activateIndicatorsAndLoad === "function") {
          await window.activateIndicatorsAndLoad();
        } else if (typeof window.loadIndicatorsBundle === "function") {
          await window.loadIndicatorsBundle();
        }
      }
    } catch (e) {
      console.error("autoLoadFor error", viewId, e);
      // se fallisce, permetti retry al prossimo click
      window.__PANEL_LOADED__[viewId] = false;
    }
  }

  nav.addEventListener("click", async (e) => {
  const btn = e.target?.closest?.(".tab");
  if (!btn) return;

  const view = btn.getAttribute("data-view");
  const isProTab = btn.getAttribute("data-pro-tab") === "1";

  if (isProTab && !__IS_PRO__) {
  const name = (view === "predictionPanel") ? "Predizione 🧠" : "Indicatori 📊";
  const tg = window.API_CONFIG?.telegramUrl || "";

  showToast({
    key: "hint_pro_gate",
    title: `🔒 ${name} è PRO`,
    text:
      "Questa sezione è riservata agli utenti PRO.\n" +
      "Vuoi sbloccarla? Entra nel gruppo Telegram e scrivimi in privato: ti spiego tutto e ti attivo l’accesso.",
    allowDisable: true,
    ctaLabel: tg ? "Apri Telegram" : "",
    ctaUrl: tg
  });

  if (typeof goToPayment === "function") goToPayment(); // pagamento se configurato, altrimenti login
  return;
}


  nav.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");

  const viewId = (view === "match") ? "matchView" : view;
  showView(viewId);

  // ✅ help “cordiale” all’apertura scheda (disattivabile)
  const h = PANEL_HINTS[viewId];
  if (h) showToast(h);

  await autoLoadFor(viewId);
});

  // default: Match
  showView("matchView");
}
document.addEventListener("DOMContentLoaded", async () => {
  setupTopButton();
  setupAuthActions();
  setupModalClose();
  setupProLockCTA();
  setupTelegramHeader();
  setupSupportEmailFooter();
  setupPayPalButton();
  // Tabs
  setupTabs();
   // ✅ Welcome "Come funziona?"
  document.getElementById("btnWelcomeHow")?.addEventListener("click", () => {
    showToast({
      key: "hint_welcome",
      title: "Come funziona 🚀",
      text:
        "1) Cerca una squadra → 2) Apri Match → 3) Esplora le schede.\n",
      allowDisable: true
    });
  });

  // Loader (da api.js)
  window.addEventListener("cr:loading", (e) => {
    const on = !!e?.detail?.on;
    if (on) showLoader();
    else hideLoader();
  });
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





