// js/features/injuriesPanel.js

function setInjuries(html) {
  const el = document.getElementById("injuriesPanel");
  if (el) el.innerHTML = html;
}

// Cache: teamId:season -> Map(playerId|nameLower -> position)
const __TEAM_POS_CACHE__ = new Map();
const __INJURY_PLAYER_ROWS__ = new Map(); // playerId|season -> /players row

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

function dedupeInjuryRows(items) {
  const unique = [];
  const indexes = new Map();

  for (const item of items || []) {
    const teamId = item?.team?.id ? String(item.team.id) : "";
    const playerId = item?.player?.id ? String(item.player.id) : "";
    const playerName = String(item?.player?.name || "").trim().toLowerCase();
    const playerKey = playerId
      ? `id:${playerId}`
      : playerName
        ? `name:${playerName}`
        : "";
    const key = teamId && playerKey ? `${teamId}:${playerKey}` : "";

    if (!key) {
      unique.push(item);
      continue;
    }

    const index = indexes.get(key);
    if (index === undefined) {
      indexes.set(key, unique.length);
      unique.push(item);
      continue;
    }

    const currentReason = String(unique[index]?.player?.reason || "").trim();
    const candidateReason = String(item?.player?.reason || "").trim();
    if (!currentReason && candidateReason) {
      unique[index] = {
        ...unique[index],
        player: { ...unique[index].player, reason: item.player.reason },
      };
    }
  }

  return unique;
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

      if (pid) __INJURY_PLAYER_ROWS__.set(`${pid}|${season}`, row);

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
function playerChipHTML(p) {
  const name = p?.player?.name ?? p?.name ?? "—";
  const photo = p?.player?.photo ?? p?.photo ?? "";
  const playerId = p?.player?.id ?? p?.id ?? "";

  const img = photo
    ? `<img class="pimg" src="${safeHTML(photo)}" alt="${safeHTML(name)}"
         loading="lazy"
         referrerpolicy="no-referrer"
         onerror="this.style.display='none'">`
    : `<span class="pimg" style="display:inline-block"></span>`;

  const content = `${img}<span class="pname">${safeHTML(name)}</span>`;
  if (!playerId) return `<span class="pchip">${content}</span>`;

  return `<button type="button" class="pchip injPlayerButton"
    data-player-id="${safeHTML(playerId)}"
    data-player-name="${safeHTML(name)}">${content}</button>`;
}

function wireInjuryPlayerClicks() {
  const root = document.getElementById("injuriesPanel");
  if (!root || root.__injuryPlayerClicksWired) return;
  root.__injuryPlayerClicksWired = true;

  root.addEventListener("click", async (event) => {
    const button = event.target?.closest?.(".injPlayerButton");
    if (!button || typeof window.openPlayerModal !== "function") return;

    const playerId = button.getAttribute("data-player-id") || "";
    const playerName = button.getAttribute("data-player-name") || "Giocatore";
    const season = seasonFromFixtureISO(selectedFixture?.date);
    const playerRow = __INJURY_PLAYER_ROWS__.get(`${playerId}|${season}`) || null;

    await window.openPlayerModal(playerId, playerName, playerRow);
  });
}

function renderTeamInjuries(teamName, teamLogo, items, posMap) {
  const rows = (items || [])
    .map((it) => {
      // Ruolo: prima provo se per caso fosse già nell'injury (quasi mai),
      // altrimenti lo cerco in posMap tramite player.id o nome/cognome
      const rawPosDirect =
        it?.player?.position ||
        it?.player?.pos ||
        it?.player?.role ||
        "";

      const pid = it?.player?.id ? String(it.player.id) : "";
      const fullName = String(it?.player?.name || "").trim();
      const pname = fullName.toLowerCase();
      const surname = fullName.includes(".")
        ? fullName.split(".").slice(1).join(".").trim().toLowerCase()
        : "";

      const rawPos =
        rawPosDirect ||
        (posMap ? (posMap.get(pid) || posMap.get(pname) || posMap.get(surname) || "") : "");

      const posLabel = rawPos ? (normalizePositionIT(rawPos) || rawPos) : "—";

      const reason = it?.player?.reason ? String(it.player.reason) : "";
      const meta = reason ? `${posLabel} • ${reason}` : posLabel;

      return `
        <li class="injRow">
          ${playerChipHTML(it)}
          <div class="injMeta">
            <span class="muted">${safeHTML(meta)}</span>
          </div>
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

  const all = dedupeInjuryRows(Array.isArray(r.arr) ? r.arr : []);

  const home = fx.home || {};
  const away = fx.away || {};

  const homeItems = all.filter((x) => x?.team?.id === home.id);
  const awayItems = all.filter((x) => x?.team?.id === away.id);

  // Carico le posizioni usando /players (più affidabile)
  const season = seasonFromFixtureISO(fx.date);

  let homePosMap = new Map();
  let awayPosMap = new Map();

  if (season) {
    [homePosMap, awayPosMap] = await Promise.all([
      home.id && homeItems.length
        ? fetchTeamPositions(home.id, season)
        : new Map(),
      away.id && awayItems.length
        ? fetchTeamPositions(away.id, season)
        : new Map(),
    ]);
  }

  setInjuries(`
    <div class="kv">
      ${renderTeamInjuries(home.name || "Casa", home.logo || "", homeItems, homePosMap)}
      ${renderTeamInjuries(away.name || "Trasferta", away.logo || "", awayItems, awayPosMap)}
    </div>
  `);
  wireInjuryPlayerClicks();
}


