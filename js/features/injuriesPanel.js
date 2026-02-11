// js/features/injuriesPanel.js

function setInjuries(html) {
  const el = document.getElementById("injuriesPanel");
  if (el) el.innerHTML = html;
}

function normalizeReason(obj) {
  // API di solito mette qualcosa tipo: player.reason = "Injury" / "Suspended" / ecc.
  const r =
    obj?.player?.reason ||
    obj?.reason ||
    obj?.type ||
    obj?.status ||
    "";

  const s = String(r).trim();
  if (!s) return "—";
  return s;
}

function normalizeStatus(obj) {
  // non sempre presente; se non c'è, non inventiamo nulla
  const s =
    obj?.player?.type ||
    obj?.player?.status ||
    obj?.status ||
    "";

  const t = String(s).trim();
  return t || "";
}

function renderTeamInjuries(teamName, teamLogo, items) {
const rows = (items || [])
  .map((it) => {
    const name = it?.player?.name || "—";

    // RUOLO: se l'API lo fornisce lo mostriamo, altrimenti "—"
    const rawPos =
      it?.player?.position ||
      it?.player?.pos ||
      it?.player?.role ||
      "";

    const posLabel = rawPos ? (normalizePositionIT(rawPos) || rawPos) : "—";

    return `
      <li>
        <strong>${safeHTML(name)}</strong>
        — <span class="muted">${safeHTML(posLabel)}</span>
      </li>
    `;
  })
  .join("");

  return `
    <div class="kv-row">
      <div class="k">
        Indisponibili: ${safeHTML(teamName)}
      </div>
      <div class="v">
        <span class="teamline">
          ${teamLogo ? `<img class="logo" src="${safeHTML(teamLogo)}" alt="logo" />` : ""}
          <span class="pill">${safeHTML((items || []).length)} giocatori</span>
        </span>
        <div style="margin-top:8px;">
          ${
            (items || []).length
              ? `<ul>${rows}</ul>`
              : `<p class="muted"><em>Nessun indisponibile segnalato per questa partita.</em></p>`
          }
        </div>
      </div>
    </div>
  `;
}

async function loadInjuries() {
  // “snapshot” per evitare che selectedFixture cambi durante gli await
  const fx = selectedFixture;

  if (!fx?.id) {
    setInjuries(
      `<p class="muted"><em>Seleziona una squadra per vedere gli indisponibili.</em></p>`,
    );
    return;
  }

  setInjuries(`<p class="muted"><em>Recupero indisponibili...</em></p>`);

  const fixtureId = fx.id;

  // endpoint: injuries per fixture
  const r = await apiGet(`/injuries?fixture=${fixtureId}`, {
    retries: 3,
    delays: [500, 1000, 1800],
  });

  if (!r.ok || r.errors) {
    setInjuries(`
      <p class="muted"><em>Impossibile recuperare indisponibili.</em></p>
      <pre class="mono" style="white-space:pre-wrap; font-size:12px;">${safeHTML(
        JSON.stringify(r.errors || {}, null, 2),
      )}</pre>
    `);
    return;
  }

  const all = Array.isArray(r.arr) ? r.arr : [];

  // uso SEMPRE fx (snapshot), NON selectedFixture globale
  const home = fx.home || {};
  const away = fx.away || {};

  const homeItems = all.filter((x) => x?.team?.id === home.id);
  const awayItems = all.filter((x) => x?.team?.id === away.id);

  setInjuries(`
    <div class="kv">
      ${renderTeamInjuries(home.name || "Casa", home.logo || "", homeItems)}
      ${renderTeamInjuries(away.name || "Trasferta", away.logo || "", awayItems)}
    </div>
  `);
}

