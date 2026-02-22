// js/features/teamFlow.js
// Gestione input + suggerimenti + selezione team + caricamento pannelli
// Compatibile con:
// - loadFixtureDetails()  (refereePanel.js)
// - loadTeamsForm()       (teamsPanel.js)
// - loadTeamsCorners()    (cornersPanel.js)
// - loadTeamsShots()      (shotsPanel.js)
// - loadInjuries()        (injuriesPanel.js)

const __SUGGEST_CACHE__ = new Map(); // q -> {ts, items:[{id,name,logo}]}
let __SUGGEST_DEBOUNCE__ = null;
let __LAST_SUGGEST_ITEMS__ = [];

function getTeamInputEl() {
  return (
    document.getElementById("teamInput") ||
    document.getElementById("teamSearchInput")
  );
}

function getTeamDatalistEl() {
  return (
    document.getElementById("teamSuggestions") ||
    document.getElementById("teamsList")
  );
}
function setMatch(html) {
  const el = document.getElementById("match");
  if (el) el.innerHTML = html;
}

function updateDatalist(items) {
  __LAST_SUGGEST_ITEMS__ = items || [];
  const dl = getTeamDatalistEl();
  if (!dl) return;

  dl.innerHTML = (items || [])
    .slice(0, 15)
    .map((x) => {
      const label = x.country ? `${x.country} — ${x.name}` : x.name;
      return `<option value="${safeHTML(x.name)}" label="${safeHTML(label)}"></option>`;
    })
    .join("");
}

function findSuggestedByName(name) {
  const n = String(name || "")
    .trim()
    .toLowerCase();
  if (!n) return null;
  return (
    __LAST_SUGGEST_ITEMS__.find(
      (x) =>
        String(x.name || "")
          .trim()
          .toLowerCase() === n,
    ) || null
  );
}

async function fetchSuggestions(q) {
  const now = Date.now();
  const cached = __SUGGEST_CACHE__.get(q);
  if (cached && now - cached.ts < 60_000) return cached.items;

  const r = await apiGet(`/teams?search=${encodeURIComponent(q)}`, {
    retries: 2,
    delays: [250, 650],
  });

  const items = (r.ok && !r.errors ? r.arr : [])
    .map((t) => ({
      id: t?.team?.id ?? null,
      name: t?.team?.name ?? "",
      logo: t?.team?.logo ?? "",
      country: t?.team?.country ?? t?.team?.nation ?? "",
    }))
    .filter((x) => x.id && x.name);

  __SUGGEST_CACHE__.set(q, { ts: now, items });
  return items;
}

async function pickTeamByName(name) {
  // 1) se è uno dei suggerimenti appena mostrati, usa quello
  const fromSuggest = findSuggestedByName(name);
  if (fromSuggest) return fromSuggest;

  // 2) altrimenti chiedi all’API e prendi il primo (o match esatto se esiste)
  const r = await apiGet(`/teams?search=${encodeURIComponent(name)}`, {
    retries: 2,
    delays: [300, 700],
  });
  if (!r.ok || r.errors || !r.arr || r.arr.length === 0) return null;

  const low = name.trim().toLowerCase();
  const exact = r.arr.find(
    (t) =>
      String(t?.team?.name || "")
        .trim()
        .toLowerCase() === low,
  );
  const best = exact || r.arr[0];

  return {
    id: best?.team?.id ?? null,
    name: best?.team?.name ?? "",
    logo: best?.team?.logo ?? "",
  };
}

async function fetchNextFixtures(teamId, count = 2) {
  const r = await apiGet(
    `/fixtures?team=${teamId}&next=${count}&timezone=Europe/Rome`,
    { retries: 3, delays: [400, 900, 1600] },
  );
  if (!r.ok || r.errors || !r.arr || r.arr.length === 0) return [];
  return r.arr;
}

function renderMatchBasic(fx, nextMy = null, nextOpp = null) {
  const dateISO = fx?.fixture?.date || null;
  const when = dateISO ? new Date(dateISO).toLocaleString("it-IT") : "—";

  const league = fx?.league?.name || "—";
  const round = fx?.league?.round || "";
  const venue = fx?.fixture?.venue?.name || "—";

  const home = fx?.teams?.home || {};
  const away = fx?.teams?.away || {};

  function fmtNext(f, teamId) {
  if (!f) return `<div class="nm-muted">Non disponibile</div>`;

  const w = f?.fixture?.date ? new Date(f.fixture.date).toLocaleString("it-IT") : "—";

  const hId = f?.teams?.home?.id ?? null;
  const aId = f?.teams?.away?.id ?? null;

  const hName = f?.teams?.home?.name || "—";
  const aName = f?.teams?.away?.name || "—";

  const hLogo = f?.teams?.home?.logo || "";
  const aLogo = f?.teams?.away?.logo || "";

  const comp = f?.league?.name || "—";

  // ✅ Opponente = l’altra squadra rispetto a teamId
  let oppName = "—";
  let oppLogo = "";

  if (teamId && teamId === hId) {
    oppName = aName;
    oppLogo = aLogo;
  } else if (teamId && teamId === aId) {
    oppName = hName;
    oppLogo = hLogo;
  } else {
    // fallback se non matcha (dati strani): mostro "Home vs Away"
    oppName = `${hName} vs ${aName}`;
    oppLogo = "";
  }

  return `
    <div class="nextMini">
      <div class="nm-top">
        <div class="nm-title">Prossima</div>
        <div class="nm-date">${safeHTML(w)}</div>
      </div>
      <div class="nm-mid">
        ${oppLogo ? `<img class="nm-logo" src="${safeHTML(oppLogo)}" alt="">` : ""}
        <div class="nm-opp">${safeHTML(oppName)}</div>
      </div>
      <div class="nm-comp">${safeHTML(comp)}</div>
    </div>
  `;
}

  return `
    <div class="matchHero">
      <div class="mh-top">
        <div class="mh-comp">
          <div class="mh-league">${safeHTML(league)}${round ? ` • ${safeHTML(round)}` : ""}</div>
          <div class="mh-meta">${safeHTML(when)} • ${safeHTML(venue)}</div>
        </div>
      </div>

      <div class="mh-main">
        <div class="mh-team">
          ${home.logo ? `<img class="mh-logo" src="${safeHTML(home.logo)}" alt="logo" />` : ""}
          <div class="mh-name">${safeHTML(home.name || "Casa")}</div>

          <div class="mh-next">
  ${fmtNext(nextMy, selectedFixture?.home?.id)}
</div>
        </div>

        <div class="mh-vs">
          <div class="mh-score">VS</div>
          <div class="mh-sub">Prossimo match</div>
        </div>

        <div class="mh-team right">
          ${away.logo ? `<img class="mh-logo" src="${safeHTML(away.logo)}" alt="logo" />` : ""}
          <div class="mh-name">${safeHTML(away.name || "Trasferta")}</div>

          <div class="mh-next">
  ${fmtNext(nextOpp, selectedFixture?.away?.id)}
</div>
        </div>
      </div>
    </div>
  `;
}

function setLoadingAll() {
  setMatch(`<p class="muted"><em>Caricamento match...</em></p>`);
  // Gli altri pannelli li carichiamo solo a richiesta (risparmio chiamate)
}

function renderLoadBtn(onclickFn, label = "Carica dati") {
  const fn = safeHTML(onclickFn);
  return `
    <div style="margin-top:10px;">
      <button type="button" class="btn primary" onclick="${fn}()">${safeHTML(label)}</button>
    </div>
  `;
}

function setOnDemandPanelsPlaceholders() {
  // reset indicatori: non devono autoriempirsi quando carico altre card
  window.__IND_ACTIVE__ = false;
  if (window.__IND__) {
    window.__IND__.teams = null;
    window.__IND__.corners = null;
    window.__IND__.shots = null;
    window.__IND__.referee = null;
    window.__IND__.fouls = null;
  }

  if (typeof setReferee === "function") {
    setReferee(
      `<p class="muted"><em>Apri la scheda “Arbitro” per caricare i dati.</em></p>`,
    );
  }
  if (typeof setTeams === "function") {
    setTeams(
      `<p class="muted"><em>Apri la scheda “Squadre” per caricare i dati.</em></p>`,
    );
  }
  if (typeof setCorners === "function") {
    setCorners(
      `<p class="muted"><em>Apri la scheda “Corner” per caricare i dati.</em></p>`,
    );
  }
  if (typeof setShots === "function") {
    setShots(
      `<p class="muted"><em>Apri la scheda “Tiri” per caricare i dati.</em></p>`,
    );
  }
  if (typeof setInjuries === "function") {
    setInjuries(
      `<p class="muted"><em>Apri la scheda “Indisponibili” per caricare i dati.</em></p>`,
    );
  }

  if (typeof setPrediction === "function") {
    setPrediction(
      `<p class="muted"><em>Apri la scheda “Predizione” per calcolare la stima.</em></p>`,
    );
  }
  if (typeof setIndicators === "function") {
    setIndicators(
      `<p class="muted"><em>Apri la scheda “Indicatori” per caricare i dati.</em></p>`,
    );
  }
}

// bottone “Indicatori”: attiva render e lancia il caricamento (se esiste)
window.activateIndicatorsAndLoad = async function () {
  // 1) Se esiste il controller "ufficiale" degli indicatori, usiamo quello.
  if (typeof window.activateIndicators === "function") {
    try {
      await window.activateIndicators();
      return;
    } catch (e) {
      console.error("activateIndicators error", e);
    }
  }

  // 2) Fallback: attiva render e prova a caricare il bundle (se presente)
  window.__IND_ACTIVE__ = true;
  if (typeof window.renderIndicators === "function") {
    try {
      window.renderIndicators();
    } catch (e) {
      console.error("renderIndicators", e);
    }
  }
  if (typeof window.loadIndicators === "function") {
    try {
      await window.loadIndicators();
    } catch (e) {
      console.error("loadIndicators", e);
    }
  }
};

async function showTeam() {
  const input = getTeamInputEl();
  const q = sanitizeSearch(input ? input.value : "");
  if (!q || q.length < 2) return;

  // reset “pulito” così la seconda ricerca riparte sempre
  selectedTeam = null;
  selectedFixture = null;
  window.__PANEL_LOADED__ = {
    referee: false,
    teamsPanel: false,
    cornersPanel: false,
    shotsPanel: false,
    injuriesPanel: false,
    indicatorsPanel: false,
    predictionPanel: false,
  };

  setLoadingAll();
  setOnDemandPanelsPlaceholders();

  const team = await pickTeamByName(q);
  if (!team || !team.id) {
    setMatch(
      `<p class="bad"><em>Nessuna squadra trovata per "${safeHTML(q)}".</em></p>`,
    );
    return;
  }
  selectedTeam = team;

  const nextFx = await fetchNextFixtures(team.id, 2);
  const fx = nextFx[0] || null;
  const fx2 = nextFx[1] || null;
  // Prossimo impegno dell'altra squadra (dopo questo match)
  const homeId = fx?.teams?.home?.id ?? null;
  const awayId = fx?.teams?.away?.id ?? null;
  const myTeamId = team.id;

  const oppTeamId = myTeamId === homeId ? awayId : homeId;

  let oppNextAfter = null;

  if (oppTeamId) {
    const oppNext = await fetchNextFixtures(oppTeamId, 2);

    // se il primo è lo stesso match (fixture id uguale), allora il "dopo" è il secondo
    if ((oppNext[0]?.fixture?.id ?? null) === (fx?.fixture?.id ?? null)) {
      oppNextAfter = oppNext[1] || null;
    } else {
      oppNextAfter = oppNext[0] || null;
    }
  }
  if (!fx) {
    setMatch(
      `<p class="bad"><em>Nessun prossimo match trovato per "${safeHTML(team.name)}".</em></p>`,
    );
    return;
  }

  // QUI: selectedFixture con la struttura che i pannelli già usano (home/away/id)
  selectedFixture = {
    id: fx?.fixture?.id ?? null,
    date: fx?.fixture?.date ?? null,

    // IMPORTANTI per fallback arbitro / filtri
    leagueId: fx?.league?.id ?? null,
    leagueName: fx?.league?.name ?? "",

    home: {
      id: fx?.teams?.home?.id ?? null,
      name: fx?.teams?.home?.name ?? "",
      logo: fx?.teams?.home?.logo ?? "",
    },
    away: {
      id: fx?.teams?.away?.id ?? null,
      name: fx?.teams?.away?.name ?? "",
      logo: fx?.teams?.away?.logo ?? "",
    },

    referee: "—",
  };

  setMatch(renderMatchBasic(fx, fx2, oppNextAfter));
  // prova a caricare campo+formazioni (se disponibili)
  loadLineupsPitch().catch(() => {});

  // NOTA: i pannelli sotto ora sono on-demand (risparmio chiamate)
  if (fx2) {
    const when2 = fx2?.fixture?.date
      ? new Date(fx2.fixture.date).toLocaleString("it-IT")
      : "—";
    const h2 = fx2?.teams?.home?.name || "—";
    const a2 = fx2?.teams?.away?.name || "—";
    const comp2 = fx2?.league?.name || "—";

    const matchEl = document.getElementById("match");
  }
  if (oppNextAfter) {
    const whenO = oppNextAfter?.fixture?.date
      ? new Date(oppNextAfter.fixture.date).toLocaleString("it-IT")
      : "—";
    const hO = oppNextAfter?.teams?.home?.name || "—";
    const aO = oppNextAfter?.teams?.away?.name || "—";
    const compO = oppNextAfter?.league?.name || "—";

    const matchEl = document.getElementById("match");
  }
  // (i pannelli vengono caricati dai rispettivi bottoni)
}

// UX: suggerimenti stabili + NO riapertura dopo selezione
function initTeamSearchUX() {
  const input = getTeamInputEl();
  if (!input) return;

  let suppressSuggest = false;
  let suggestReqId = 0; // token per ignorare risposte vecchie

  function suppress(ms = 600) {
    suppressSuggest = true;
    setTimeout(() => (suppressSuggest = false), ms);
  }

  function cancelDebounce() {
    if (__SUGGEST_DEBOUNCE__) {
      clearTimeout(__SUGGEST_DEBOUNCE__);
      __SUGGEST_DEBOUNCE__ = null;
    }
  }

  input.addEventListener("input", () => {
    if (suppressSuggest) return;

    const q = sanitizeSearch(input.value);

    if (!q || q.length < 2) {
      cancelDebounce();
      updateDatalist([]);
      return;
    }

    cancelDebounce();

    const myReq = ++suggestReqId; // “versione” di questa richiesta

    __SUGGEST_DEBOUNCE__ = setTimeout(async () => {
      const items = await fetchSuggestions(q);

      // se nel frattempo è partita un'altra richiesta, ignoro
      if (myReq !== suggestReqId) return;

      // se siamo in modalità soppressa (dopo selezione), ignoro
      if (suppressSuggest) return;

      // se il testo è cambiato, ignoro
      const nowQ = sanitizeSearch(input.value);
      if (nowQ !== q) return;

      updateDatalist(items);
    }, 250);
  });

  input.addEventListener("change", () => {
    // selezione da datalist
    const exact = findSuggestedByName(input.value);
    if (exact) {
      // blocco TUTTO quello che può ripopolare
      suppress(700);
      cancelDebounce();
      suggestReqId++; // invalida richieste in volo
      updateDatalist([]);

      // (opzionale ma utile): chiude la UI del datalist su alcuni browser
      input.blur();
      setTimeout(() => input.focus(), 0);

      showTeam();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      suppress(400);
      cancelDebounce();
      suggestReqId++;
      updateDatalist([]);
      showTeam();
    }
  });
}

initTeamSearchUX();
async function loadLineupsPitch() {
  const box = document.getElementById("lineupsBox");
  const content = document.getElementById("lineupsContent");
  if (!box || !content) return;

  // Mostra sempre il box (campo sempre visibile)
  box.classList.remove("hidden");

  if (!selectedFixture?.id) {
    content.innerHTML = `<p class="muted"><em>Seleziona un match per vedere le formazioni.</em></p>`;
    return;
  }

  content.innerHTML = `<p class="muted"><em>Recupero formazioni…</em></p>`;

  const r = await apiGet(`/fixtures/lineups?fixture=${selectedFixture.id}`, {
    retries: 2,
    delays: [350, 900],
  });

  // Se non disponibili: campo “placeholder”
  if (!r.ok || r.errors || !Array.isArray(r.arr) || r.arr.length === 0) {
    content.innerHTML = renderPitchPlaceholder(
      "Formazioni non disponibili (ancora).",
    );
    return;
  }

  const homeId = selectedFixture.home?.id;
  const awayId = selectedFixture.away?.id;

  const home = r.arr.find((x) => (x?.team?.id ?? null) === homeId) || r.arr[0];
  const away = r.arr.find((x) => (x?.team?.id ?? null) === awayId) || r.arr[1];

  const homeXI = Array.isArray(home?.startXI) ? home.startXI : [];
  const awayXI = Array.isArray(away?.startXI) ? away.startXI : [];

  const homeFormation = String(home?.formation || "").trim(); // es "4-3-3"
  const awayFormation = String(away?.formation || "").trim();

  // ========== helpers ==========
  function posFromGrid(g) {
    const s = String(g || "");
    const m = s.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!m) return null;
    return { row: parseInt(m[1], 10), col: parseInt(m[2], 10) };
  }

  function parseFormation(f) {
    // "4-3-3" -> [4,3,3]
    const parts = String(f || "")
      .split("-")
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return parts.length ? parts : null;
  }

  // genera coordinate (x,y) in percent per una riga con N giocatori
  function rowXs(n) {
    if (n <= 1) return [50];
    const xs = [];
    for (let i = 0; i < n; i++) {
      xs.push((100 * (i + 1)) / (n + 1));
    }
    return xs;
  }

  // layout per squadra su metà campo (home sinistra, away destra)
  function layoutTeamPlayers(startXI, formationStr, side) {
    // 1) prova grid (se almeno 6 player ce l’hanno)
    const withGrid = startXI
      .map((p) => {
        const pl = p?.player || {};
        const grid = posFromGrid(pl?.grid);
        return { p, grid };
      })
      .filter((x) => x.grid);

    const useGrid = withGrid.length >= 6;

    // 2) altrimenti usa formation
    const formation = parseFormation(formationStr);

    // separa GK + outfield (API spesso mette GK come primo, ma non garantito)
    const players = startXI.map((x) => x?.player || {}).filter(Boolean);

    // GK: prova a beccarlo da pos o grid row 1, altrimenti primo
    let gk = players[0];
    const gkByGrid = players.find((pl) => posFromGrid(pl.grid)?.row === 1);
    if (gkByGrid) gk = gkByGrid;

    const outfield = players.filter((pl) => pl !== gk);

    // target rows: [GK] + formation rows, fallback 4-4-2
    const rows = formation || [4, 4, 2];

    // Y percent su metà campo: GK vicino alla porta, attacco verso metà
    // home: 80% -> 20% (da sinistra verso centro), away specchiato
    const yLevels = [];
    // GK
    yLevels.push(82);
    // linee
    const base = [66, 48, 30, 18]; // fino a 4 linee
    for (let i = 0; i < rows.length; i++) yLevels.push(base[i] ?? 18 - i * 10);

    function makeDot(pl, xPct, yPct, sideClass) {
      const num = pl?.number ?? "";
      const name = pl?.name || "—";
      const photo = pl?.photo || "";
      return `
        <div class="pitch-player ${sideClass}" style="--x:${xPct};--y:${yPct};">
          ${photo ? `<img class="pp-photo" src="${safeHTML(photo)}" alt="" />` : ""}
          <div class="pp-badge">${safeHTML(num)}</div>
          <div class="pp-name">${safeHTML(name)}</div>
        </div>
      `;
    }

    // convert y per away (specchio)
    function yForSide(y) {
      return side === "away" ? 100 - y : y;
    }

    // GK dot
    const dots = [];
    dots.push(makeDot(gk, 50, yForSide(yLevels[0]), side));

    if (useGrid) {
      // usa grid: mappa row/col su percentuali (row 1..6, col 1..5)
      for (const p of players) {
        if (p === gk) continue;
        const g = posFromGrid(p.grid);
        if (!g) continue;

        const x = (100 * g.col) / 6; // col 1..5 => ~16..83
        const y = 15 + (g.row - 1) * 14; // row 1..6
        dots.push(makeDot(p, x, yForSide(y), side));
      }
      return dots.join("");
    }

    // formation layout: distribuisci outfield per righe
    let idx = 0;
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const n = rows[rIdx];
      const xs = rowXs(n);
      const y = yForSide(yLevels[rIdx + 1] ?? 30);

      for (let j = 0; j < n; j++) {
        const pl = outfield[idx++];
        if (!pl) break;
        dots.push(makeDot(pl, xs[j], y, side));
      }
    }

    // se avanzano giocatori (panchina/bug), li piazzo vicino al centro
    while (idx < outfield.length) {
      const pl = outfield[idx++];
      dots.push(makeDot(pl, 50, yForSide(45), side));
    }

    return dots.join("");
  }

  function renderPitch(homeDots, awayDots) {
    return `
      <div class="pitch">
        <div class="pitch-lines"></div>
        <div class="pitch-mid"></div>

        <div class="pitch-teamname left">${safeHTML(selectedFixture.home?.name || "Casa")}${homeFormation ? ` • ${safeHTML(homeFormation)}` : ""}</div>
        <div class="pitch-teamname right">${safeHTML(selectedFixture.away?.name || "Trasferta")}${awayFormation ? ` • ${safeHTML(awayFormation)}` : ""}</div>

        <div class="pitch-grid">
          ${homeDots}
          ${awayDots}
        </div>
      </div>
    `;
  }

  function renderPitchPlaceholder(msg) {
    return `
      <div class="pitch pitch--empty">
        <div class="pitch-lines"></div>
        <div class="pitch-mid"></div>
        <div class="pitch-grid">
          <div class="muted" style="padding:14px;"><em>${safeHTML(msg)}</em></div>
        </div>
      </div>
    `;
  }

  const homeDots = layoutTeamPlayers(homeXI, homeFormation, "home");
  const awayDots = layoutTeamPlayers(awayXI, awayFormation, "away");

  content.innerHTML = renderPitch(homeDots, awayDots);
}
window.showTeam = showTeam;
