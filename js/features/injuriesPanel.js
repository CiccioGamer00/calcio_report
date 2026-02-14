// js/features/injuriesPanel.js

function setInjuries(html) {
  const el = document.getElementById("injuriesPanel");
  if (el) el.innerHTML = html;
}

// Cache: teamId:season -> Map(playerId|nameLower -> position)
const __TEAM_POS_CACHE__ = new Map();

function seasonFromFixtureISO(dateISO) {
  if (!dateISO) return null;
  const d = new Date(dateISO);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 7 ? y : y - 1;
}

function extractPositionFromPlayerRow(row) {
  // API-Football /players di solito: { player: {...}, statistics: [ { games: { position: "Midfielder" } } ] }
  const direct =
    row?.player?.position ||
    row?.player?.pos ||
    row?.player?.role ||
    "";

  if (direct) return String(direct).trim();

  const s0 = Array.isArray(row?.statistics) ? row.statistics[0] : null;
  const fromStats =
    s0?.games?.position ||
    s0?.games?.pos ||
    "";

  return String(fromStats || "").trim();
}

async function fetchTeamPositions(teamId, season) {
  const key = `${teamId}:${season}`;
  if (__TEAM_POS_CACHE__.has(key)) return __TEAM_POS_CACHE__.get(key);

  const map = new Map();

  // Limitiamo le chiamate: max 4 pagine
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 4) {
    const r = await apiGet(
      `/players?team=${teamId}&season=${season}&page=${page}`,
      { retries: 2, delays: [300, 800] },
    );

    if (!r.ok || r.errors) break;

    const arr = Array.isArray(r.arr) ? r.arr : [];
    for (const row of arr) {
      const pid = row?.player?.id ? String(row.player.id) : "";
      const pname = String(row?.player?.name || "").trim().toLowerCase();
      const pos = extractPositionFromPlayerRow(row);

      if (pos) {
        if (pid) map.set(pid, pos);
        if (pname) map.set(pname, pos);
      }
    }

    const tp = Number(r.json?.paging?.total);
    totalPages = Number.isFinite(tp) ? tp : 1;

    page += 1;
  }

  __TEAM_POS_CACHE__.set(key, map);
  return map;
}

function renderTeamInjuries(teamName, teamLogo, items, posMap) {
  const rows = (items || [])
    .map((it) => {
      const name = it?.player?.name || "—";

      // Ruolo: prima provo se per caso fosse già nell'injury (quasi mai),
      // altrimenti lo cerco in posMap tramite player.id o nome
      const rawPosDirect =
        it?.player?.position ||
        it?.player?.pos ||
        it?.player?.role ||
        "";

      const pid = it?.player?.id ? String(it.player.id) : "";
      const fullName = String(it?.player?.name || "").trim();
const pname = fullName.toLowerCase();
const surname = fullName.includes(".") ? fullName.split(".").slice(1).join(".").trim().toLowerCase() : "";

      const rawPos =
  rawPosDirect ||
  (posMap ? (posMap.get(pid) || posMap.get(pname) || posMap.get(surname) || "") : "");

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
      <div class="k">Indisponibili: ${safeHTML(teamName)}</div>
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
  const fx = selectedFixture;

  if (!fx?.id) {
    setInjuries(`<p class="muted"><em>Seleziona una squadra per vedere gli indisponibili.</em></p>`);
    return;
  }

  setInjuries(`<p class="muted"><em>Recupero indisponibili...</em></p>`);

  const fixtureId = fx.id;

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

  const home = fx.home || {};
  const away = fx.away || {};

  const homeItems = all.filter((x) => x?.team?.id === home.id);
  const awayItems = all.filter((x) => x?.team?.id === away.id);

  // Carico le posizioni usando /players (più affidabile)
  const season = seasonFromFixtureISO(fx.date);

  let homePosMap = new Map();
  let awayPosMap = new Map();

  if (season && home.id && away.id) {
    [homePosMap, awayPosMap] = await Promise.all([
      fetchTeamPositions(home.id, season),
      fetchTeamPositions(away.id, season),
    ]);
  }

  setInjuries(`
    <div class="kv">
      ${renderTeamInjuries(home.name || "Casa", home.logo || "", homeItems, homePosMap)}
      ${renderTeamInjuries(away.name || "Trasferta", away.logo || "", awayItems, awayPosMap)}
    </div>
  `);
}
