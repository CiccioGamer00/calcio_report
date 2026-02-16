function setupAuthModal() {
  const modal = document.getElementById("authModal");
  const openBtn = document.getElementById("btnOpenAuth");
  const closeBtn = document.getElementById("closeAuth");

  if (!modal || !openBtn || !closeBtn) return;

  openBtn.addEventListener("click", async () => {
  modal.classList.remove("hidden");
  await showRemainingInPopup();   // << aggiungi questa riga
});
  closeBtn.addEventListener("click", () => modal.classList.add("hidden"));

  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
}

function daysLeft(ts) {
  const now = Date.now();
  const diff = Number(ts || 0) - now;
  if (diff <= 0) return 0;
  // Mostra 7 appena creato, senza fare 8 per colpa dei millisecondi
  return Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

async function fetchMe() {
  const baseUrl = window.API_CONFIG?.baseUrl;
  const token = localStorage.getItem("CR_TOKEN");
  const res = await fetch(baseUrl + "/auth/me", {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, json: j };
}

function fmtTrialStatus(json) {
  if (!json?.ok) return "Login per cercare";

  const now = Number(json.now || Date.now());
  const trialEndsAt = Number(json.trialEndsAt || 0);
  const paidUntil = Number(json.paidUntil || 0);

  if (now < paidUntil) return `PRO <span class="pill">attivo</span>`;

  if (now < trialEndsAt) {
    const limTotal = Number(json?.trial?.limits?.total || 20);
    const limDaily = Number(json?.trial?.limits?.daily || 3);
    const usedTotal = Number(json?.trial?.used?.total || 0);
    const usedDaily = Number(json?.trial?.used?.daily || 0);

    const remTotal = Math.max(0, limTotal - usedTotal);
    const remDaily = Math.max(0, limDaily - usedDaily);

    return `Trial: <span class="pill">${remTotal}/${limTotal}</span> • Oggi: <span class="pill">${remDaily}/${limDaily}</span>`;
  }

  return `SCADUTO <span class="pill">PRO</span>`;
}

async function refreshTrialStatus() {
  const el = document.getElementById("trialStatus");
  if (!el) return;
  const { json } = await fetchMe();
  el.innerHTML = fmtTrialStatus(json);
}

window.refreshTrialStatus = refreshTrialStatus;

// ✅ come vuoi tu: bottone senza giorni, giorni nel popup (messaggio)
async function refreshTopAuthButton() {
  const btn = document.getElementById("btnOpenAuth");
  if (!btn) return;

  const { json } = await fetchMe();

  if (!json?.ok) {
    btn.textContent = "Login";
    btn.classList.remove("pro-active", "trial-active", "expired");
    return;
  }

  const now = Number(json.now || Date.now());
  const trialEndsAt = Number(json.trialEndsAt || 0);
  const paidUntil = Number(json.paidUntil || 0);

  if (now < paidUntil) {
    btn.textContent = "PRO attivo";
    btn.classList.add("pro-active");
    btn.classList.remove("trial-active", "expired");
    return;
  }

  if (now < trialEndsAt) {
    btn.textContent = "TRIAL attivo";
    btn.classList.add("trial-active");
    btn.classList.remove("pro-active", "expired");
    return;
  }

  btn.textContent = "SCADUTO";
  btn.classList.add("expired");
  btn.classList.remove("pro-active", "trial-active");
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

function setAuthMsg(msg) {
  const el = document.getElementById("authMsg");
  if (el) el.textContent = msg || "";
}

async function showRemainingInPopup() {
  const { json } = await fetchMe();
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
    const limTotal = Number(json?.trial?.limits?.total || 20);
    const limDaily = Number(json?.trial?.limits?.daily || 3);
    const usedTotal = Number(json?.trial?.used?.total || 0);
    const usedDaily = Number(json?.trial?.used?.daily || 0);

    const remTotal = Math.max(0, limTotal - usedTotal);
    const remDaily = Math.max(0, limDaily - usedDaily);

    setAuthMsg(
      `TRIAL attivo: ${daysLeft(trialEndsAt)} giorni rimanenti. Ricerche: ${remTotal}/${limTotal} • Oggi: ${remDaily}/${limDaily}.`,
    );
  } else {
    setAuthMsg("Prova scaduta: inserisci codice o contattami per attivazione.");
  }
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
      localStorage.setItem("CR_TOKEN", res.json.token);
      setAuthMsg("Login effettuato.");
      await refreshTopAuthButton();
      await refreshTrialStatus();
      await showRemainingInPopup();
      document.getElementById("authModal")?.classList.add("hidden");
    } else {
      setAuthMsg(res.json?.message || "Errore login.");
    }
  });

  registerBtn.addEventListener("click", async () => {
    const email = document.getElementById("authEmail")?.value || "";
    const password = document.getElementById("authPass")?.value || "";

    const res = await authPost("/auth/register", { email, password });

    if (res.ok && res.json?.token) {
  localStorage.setItem("CR_TOKEN", res.json.token);

  await refreshTopAuthButton();
  await refreshTrialStatus();

  // Messaggio PRO: iniziato trial + giorni
  const { json } = await fetchMe();
  const d = json?.trialEndsAt ? daysLeft(json.trialEndsAt) : 7;
  setAuthMsg(`INIZIATO IL PERIODO DI PROVA: ${d} giorni rimanenti.`);

  document.getElementById("authModal")?.classList.add("hidden");
} else {
  setAuthMsg(res.json?.message || "Errore registrazione.");
}
  });

  redeemBtn.addEventListener("click", async () => {
    const code = document.getElementById("redeemCode")?.value || "";
    const token = localStorage.getItem("CR_TOKEN");

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
      setAuthMsg("Abbonamento attivato per 30 giorni.");
      await refreshTopAuthButton();
      await refreshTrialStatus();
      await showRemainingInPopup();
      document.getElementById("authModal")?.classList.add("hidden");
    } else {
      setAuthMsg(data.message || "Codice non valido.");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupAuthModal();
  setupAuthActions();
  await refreshTopAuthButton();
  await refreshTrialStatus();
});
