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
function getTeamSuggestBoxEl() {
  return document.getElementById("teamSuggestBox");
}

function hideSuggestBox() {
  const box = getTeamSuggestBoxEl();
  if (!box) return;
  box.classList.add("hidden");
  box.innerHTML = "";
}

function renderSuggestBox(items) {
  const box = getTeamSuggestBoxEl();
  if (!box) return;

  const list = (items || []).slice(0, 12);

  if (!list.length) {
    hideSuggestBox();
    return;
  }

  box.innerHTML = list
    .map((x) => {
      const meta = x.country ? x.country : "—";
      return `
        <button type="button" class="suggestItem"
          data-team-id="${safeHTML(x.id)}"
          data-team-name="${safeHTML(x.name)}"
          data-team-logo="${safeHTML(x.logo || "")}"
        >
          ${
            x.logo
              ? `<img class="suggestLogo" src="${safeHTML(x.logo)}" alt="" onerror="this.style.display='none'; this.parentElement.querySelector('.suggestLogoFallback').classList.remove('hidden')" />`
              : ``
          }
<span class="suggestLogoFallback ${x.logo ? "hidden" : ""}">⚽</span>
          <span class="suggestText">
            <span class="suggestName">${safeHTML(x.name)}</span>
            <span class="suggestMeta">${safeHTML(meta)}</span>
          </span>
        </button>
      `;
    })
    .join("");

  box.classList.remove("hidden");
}
function setMatch(html) {
  const el = document.getElementById("match");
  if (el) el.innerHTML = html;
}

function updateDatalist(items) {
  __LAST_SUGGEST_ITEMS__ = items || [];

  // 1) datalist nativo (fallback)
  const dl = getTeamDatalistEl();
  if (dl) {
    dl.innerHTML = (items || [])
      .slice(0, 15)
      .map((x) => {
        const label = x.country ? `${x.country} — ${x.name}` : x.name;
        return `<option value="${safeHTML(x.name)}" label="${safeHTML(label)}"></option>`;
      })
      .join("");
  }

  // 2) dropdown custom (quello bello con logo)
  renderSuggestBox(items);
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

function renderMatchBasic(fx, nextMy = null, nextOpp = null, myTeamId = null) {
  const dateISO = fx?.fixture?.date || null;
  const when = dateISO ? new Date(dateISO).toLocaleString("it-IT") : "—";
  const mini = selectedFixture?.standingsMini || null;
  const homeMini = mini?.home
    ? `${mini.home.rank}ª • ${mini.home.points}pt`
    : null;
  const awayMini = mini?.away
    ? `${mini.away.rank}ª • ${mini.away.points}pt`
    : null;

  const league = fx?.league?.name || "—";
  const round = fx?.league?.round || "";
  const venue = fx?.fixture?.venue?.name || "—";

  const home = fx?.teams?.home || {};
  const away = fx?.teams?.away || {};
  const homeId = home?.id ?? null;
  const awayId = away?.id ?? null;

  // assegna i prossimi match al lato giusto:
  // - nextMy = prossimo match della squadra cercata (fx2)
  // - nextOpp = prossimo match dell’avversaria dopo questo match (oppNextAfter)
  const homeNext = myTeamId && myTeamId === homeId ? nextMy : nextOpp;
  const awayNext = myTeamId && myTeamId === awayId ? nextMy : nextOpp;

  function fmtNextInline(f, teamId) {
    if (!f) return `<div class="next-muted">Prossimo: —</div>`;

    const w = f?.fixture?.date
      ? new Date(f.fixture.date).toLocaleString("it-IT")
      : "—";

    const hId = f?.teams?.home?.id ?? null;
    const aId = f?.teams?.away?.id ?? null;

    const hName = f?.teams?.home?.name || "—";
    const aName = f?.teams?.away?.name || "—";

    // Opponente = l’altra squadra rispetto a teamId
    let oppName = "—";
    if (teamId && teamId === hId) oppName = aName;
    else if (teamId && teamId === aId) oppName = hName;
    else oppName = `${hName} vs ${aName}`;

    return `
    <div class="mh-nextInline">
      <div class="mh-nextLabel">Prossima</div>
      <div class="mh-nextLine">${safeHTML(w)} • ${safeHTML(oppName)}</div>
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
  <div class="mh-logoCol">
    ${home.logo ? `<img class="mh-logo" src="${safeHTML(home.logo)}" alt="logo" />` : ""}
    ${fmtNextInline(homeNext, selectedFixture?.home?.id)}
  </div>

  <div class="mh-textCol">
    <div class="mh-name">${safeHTML(home.name || "Casa")}</div>
    ${homeMini ? `<div class="mh-mini"><span class="pill">🏆 ${safeHTML(homeMini)}</span></div>` : ``}
  </div>
</div>

        <div class="mh-vs">
          <div class="mh-score">VS</div>
          <div class="mh-sub">Prossimo match</div>
        </div>

        <div class="mh-team right">
  <div class="mh-logoCol">
    ${away.logo ? `<img class="mh-logo" src="${safeHTML(away.logo)}" alt="logo" />` : ""}
    ${fmtNextInline(awayNext, selectedFixture?.away?.id)}
  </div>

  <div class="mh-textCol">
    <div class="mh-name">${safeHTML(away.name || "Trasferta")}</div>
    ${awayMini ? `<div class="mh-mini"><span class="pill">🏆 ${safeHTML(awayMini)}</span></div>` : ``}
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
    season: fx?.league?.season ?? null,

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

  setMatch(renderMatchBasic(fx, fx2, oppNextAfter, team.id));
  // mini classifica (silenziosa): aggiorna le pill vicino alle squadre
  if (typeof window.loadStandingsMini === "function") {
    window
      .loadStandingsMini()
      .then(() => setMatch(renderMatchBasic(fx, fx2, oppNextAfter, team.id)))
      .catch(() => {});
  }
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
  const box = getTeamSuggestBoxEl();

  // click su un suggerimento
  box?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".suggestItem");
    if (!btn) return;

    const name = btn.getAttribute("data-team-name") || "";
    if (!name) return;

    input.value = name;

    suppress(700);
    cancelDebounce();
    suggestReqId++;
    hideSuggestBox();

    // chiude anche la UI nativa se aperta
    input.blur();
    setTimeout(() => input.focus(), 0);

    showTeam();
  });

  // chiusura quando perdi focus (con micro-delay per permettere click)
  input.addEventListener("blur", () => {
    setTimeout(() => hideSuggestBox(), 180);
  });

  // se rifocalizzi e hai testo, puoi riaprire (solo se ci sono suggerimenti)
  input.addEventListener("focus", () => {
    const q = sanitizeSearch(input.value);
    if (q.length >= 2 && __LAST_SUGGEST_ITEMS__?.length) {
      renderSuggestBox(__LAST_SUGGEST_ITEMS__);
    }
  });
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
      hideSuggestBox();
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
      hideSuggestBox();

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
      hideSuggestBox();
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

  // Se non disponibili: provo STIMATA (ultimi match + indisponibili)
  if (!r.ok || r.errors || !Array.isArray(r.arr) || r.arr.length === 0) {
    const est = await estimateLineupsForFixture().catch(() => null);
    if (est?.home && est?.away) {
      content.innerHTML = renderPitchFromEstimate(est);
      wirePitchClicks(); // abilita click players per popup stats
      return;
    }
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
  const lineupTag = "UFFICIALE";

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
function xForSide(x) {
  // x in 0..100, lo comprimo in metà campo
  // HOME: 5..49  |  AWAY: 51..95
  const clamped = Math.max(0, Math.min(100, Number(x) || 50));
  if (side === "away") return 50 + clamped * 0.45;
  return 50 - clamped * 0.45;
}
    function makeDot(pl, xPct, yPct, sideClass) {
      const num = pl?.number ?? "";
      const name = pl?.name || "—";
      const photo = pl?.photo || "";
      const pid = pl?.id ?? "";

      return `
    <button class="pitch-player ${sideClass}" style="--x:${xPct};--y:${yPct};" type="button"
      data-player-id="${safeHTML(pid)}"
      data-player-name="${safeHTML(name)}"
      ${pid ? "" : "disabled"}
      aria-label="${safeHTML(name)}"
    >
      ${
        photo
          ? `<img class="pp-photo" src="${safeHTML(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="this.style.display='none'"/>`
          : ""
      }
      <div class="pp-badge">${safeHTML(num)}</div>
      <div class="pp-name">${safeHTML(name)}</div>
    </button>
  `;
    }

       // GK dot
    const dots = [];
    dots.push(makeDot(gk, xForSide(82), yLevels[0], side)); // GK vicino alla porta

    if (useGrid) {
      // usa grid: mappa row/col su percentuali (row 1..6, col 1..5)
      for (const p of players) {
        if (p === gk) continue;
        const g = posFromGrid(p.grid);
        if (!g) continue;

       const y = (100 * g.col) / 6;          // colonna -> verticale
const x = 18 + (g.row - 1) * 14;      // riga -> profondità (verso metà campo)
dots.push(makeDot(p, xForSide(x), y, side));
      }
      return dots.join("");
    }

    // formation layout: distribuisci outfield per righe
    let idx = 0;
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const n = rows[rIdx];
      const xs = rowXs(n);
      const xDepth = yLevels[rIdx + 1] ?? 30;   // uso yLevels come “profondità”
const y = xs[j];                           // distribuisco in verticale


      for (let j = 0; j < n; j++) {
        const pl = outfield[idx++];
        if (!pl) break;
        dots.push(makeDot(pl, xForSide(xDepth), y, side));
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

     <div class="pitch-teamname left">
  ${safeHTML(selectedFixture.home?.name || "Casa")}${homeFormation ? ` • ${safeHTML(homeFormation)}` : ""}
  <span class="pitch-badge pitch-badge--official">UFFICIALE</span>
  ${homeCoach ? ` <span class="muted" style="margin-left:8px;">(${safeHTML(homeCoach)})</span>` : ""}
</div>

<div class="pitch-teamname right">
  ${safeHTML(selectedFixture.away?.name || "Trasferta")}${awayFormation ? ` • ${safeHTML(awayFormation)}` : ""}
  <span class="pitch-badge pitch-badge--official">UFFICIALE</span>
  ${awayCoach ? ` <span class="muted" style="margin-left:8px;">(${safeHTML(awayCoach)})</span>` : ""}
</div>

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
  const homeCoach = home?.coach?.name ? String(home.coach.name) : "";
  const awayCoach = away?.coach?.name ? String(away.coach.name) : "";

  content.innerHTML = renderPitch(homeDots, awayDots);
  wirePitchClicks();
}
// ====== STIMA FORMAZIONI (fallback) ======
const __EST_LINEUP_CACHE__ = new Map(); // key -> {ts, data}
const __PLAYER_STATS_CACHE__ = new Map(); // playerId|season|league -> data

function cacheKeyEst(teamId, leagueId, season) {
  return `${teamId}|${leagueId}|${season}`;
}

async function fetchInjuredPlayerIds(teamId, season) {
  // endpoint API-Football: /injuries?team=...&season=...
  // (se l’API risponde vuota, ok)
  if (!teamId || !season) return new Set();
  const r = await apiGet(`/injuries?team=${teamId}&season=${season}`, {
    retries: 2,
    delays: [400, 900],
  });
  const out = new Set();
  if (!r.ok || r.errors || !Array.isArray(r.arr)) return out;

  for (const row of r.arr) {
    const pid = row?.player?.id ?? null;
    if (pid) out.add(pid);
  }
  return out;
}

function formationMode(list) {
  const m = new Map();
  for (const x of list || []) {
    const f = String(x || "").trim();
    if (!f) continue;
    m.set(f, (m.get(f) || 0) + 1);
  }
  let best = null,
    bestN = 0;
  for (const [k, n] of m.entries()) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function sortByRole(players) {
  // prova a usare "pos" o "position" se presente, fallback ordine attuale
  const rank = (p) => {
    const pos = String(p?.pos || p?.position || "").toUpperCase();
    if (pos.startsWith("G")) return 0; // GK
    if (pos.startsWith("D")) return 1; // DEF
    if (pos.startsWith("M")) return 2; // MID
    if (pos.startsWith("F") || pos.startsWith("A")) return 3; // ATT
    return 9;
  };
  return (players || []).slice().sort((a, b) => rank(a) - rank(b));
}
async function estimateLineupForTeam(teamId, leagueId, season, limit = 8) {
  if (!teamId || !season) return null;

  const key = cacheKeyEst(teamId, leagueId, season);
  const hit = __EST_LINEUP_CACHE__.get(key);
  if (hit && Date.now() - hit.ts < 5 * 60_000) return hit.data; // 5 min cache

  const injured = await fetchInjuredPlayerIds(teamId, season);

  // 1) prova stessa lega+stagione (se leagueId c'è)
  let fixtures = [];
  if (leagueId) {
    const fx = await apiGet(
      `/fixtures?team=${teamId}&league=${leagueId}&season=${season}&last=${limit}&status=FT&timezone=Europe/Rome`,
      { retries: 2, delays: [450, 900] },
    );
    fixtures = fx.ok && !fx.errors && Array.isArray(fx.arr) ? fx.arr : [];
  }

  // 2) fallback: ultime partite TUTTE le competizioni (serve per coppe/UCL ecc)
  if (!fixtures.length) {
    const fx = await apiGet(
      `/fixtures?team=${teamId}&last=${limit}&status=FT&timezone=Europe/Rome`,
      { retries: 2, delays: [450, 900] },
    );
    fixtures = fx.ok && !fx.errors && Array.isArray(fx.arr) ? fx.arr : [];
  }

  if (!fixtures.length) return null;

  const counts = new Map(); // playerId -> {n, player}
  const formations = [];

  for (const f of fixtures) {
    const fid = f?.fixture?.id ?? null;
    if (!fid) continue;

    const lr = await apiGet(`/fixtures/lineups?fixture=${fid}`, {
      retries: 1,
      delays: [450],
    });
    const arr = lr.ok && !lr.errors && Array.isArray(lr.arr) ? lr.arr : [];
    if (!arr.length) continue;

    const block = arr.find((x) => (x?.team?.id ?? null) === teamId) || null;
    if (!block) continue;

    const formation = String(block?.formation || "").trim();
    if (formation) formations.push(formation);

    const startXI = Array.isArray(block?.startXI) ? block.startXI : [];
    for (const row of startXI) {
      const pl = row?.player || {};
      const pid = pl?.id ?? null;
      if (!pid) continue;
      if (injured.has(pid)) continue;

      const prev = counts.get(pid) || { n: 0, player: null };
      counts.set(pid, {
        n: prev.n + 1,
        player: {
          id: pid,
          name: pl?.name || "—",
          number: pl?.number ?? "",
          photo: pl?.photo || "",
          pos: pl?.pos || pl?.position || "",
        },
      });
    }
  }

  if (counts.size < 11) return null;

  const top = Array.from(counts.values())
    .sort((a, b) => b.n - a.n)
    .slice(0, 11)
    .map((x) => x.player);

  const XI = sortByRole(top);
  const form = formationMode(formations) || "4-4-2";

  const data = { formation: form, startXI: XI, injuredCount: injured.size };
  __EST_LINEUP_CACHE__.set(key, { ts: Date.now(), data });
  return data;
}
async function estimateLineupsForFixture() {
  const leagueId = selectedFixture?.leagueId;
  const season = selectedFixture?.season;
  const homeId = selectedFixture?.home?.id;
  const awayId = selectedFixture?.away?.id;

  if (!leagueId || !season || !homeId || !awayId) return null;

  const [homeEst, awayEst] = await Promise.all([
    estimateLineupForTeam(homeId, leagueId, season, 8),
    estimateLineupForTeam(awayId, leagueId, season, 8),
  ]);

  if (!homeEst || !awayEst) return null;

  return {
    type: "estimated",
    leagueId,
    season,
    home: homeEst,
    away: awayEst,
  };
}

function renderPitchFromEstimate(est) {
  const homeFormation = est?.home?.formation || "4-4-2";
  const awayFormation = est?.away?.formation || "4-4-2";

  // riuso la tua layoutTeamPlayers esistente dentro loadLineupsPitch:
  // qui ricostruiamo oggetti come startXI: [{player:{...}}] per compatibilità
  const homeXI = (est?.home?.startXI || []).map((p) => ({ player: p }));
  const awayXI = (est?.away?.startXI || []).map((p) => ({ player: p }));

  // usa la tua layoutTeamPlayers già dentro loadLineupsPitch:
  // per non duplicare, copio l’idea base: generiamo dot con --x/--y
  // (qui facciamo una versione compatta uguale alla tua)
  function parseFormation(f) {
    const parts = String(f || "")
      .split("-")
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return parts.length ? parts : [4, 4, 2];
  }
  function rowXs(n) {
    if (n <= 1) return [50];
    return Array.from({ length: n }, (_, i) => (100 * (i + 1)) / (n + 1));
  }
  function makeDot(pl, xPct, yPct, sideClass) {
    return `
      <button class="pitch-player ${sideClass}" style="--x:${xPct};--y:${yPct};" type="button"
        data-player-id="${safeHTML(pl?.id ?? "")}"
        data-player-name="${safeHTML(pl?.name ?? "")}"
      >
        ${pl?.photo ? `<img class="pp-photo" src="${safeHTML(pl.photo)}" alt="" />` : ""}
        <div class="pp-badge">${safeHTML(pl?.number ?? "")}</div>
        <div class="pp-name">${safeHTML(pl?.name ?? "—")}</div>
        <div class="pp-tag">STIMATA</div>
      </button>
    `;
  }
  function layout(startXI, formationStr, side) {
    const players = startXI.map((x) => x?.player || {}).filter(Boolean);
    if (!players.length) return "";
    const rows = parseFormation(formationStr);
    const gk = players[0];
    const out = players.slice(1);

    const base = [66, 48, 30, 18];
    const yLevels = [82, ...rows.map((_, i) => base[i] ?? 18 - i * 10)];
    const yForSide = (y) => (side === "away" ? 100 - y : y);

    let html = "";
    html += makeDot(gk, 50, yForSide(yLevels[0]), side);

    let idx = 0;
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const n = rows[rIdx];
      const xs = rowXs(n);
      const y = yForSide(yLevels[rIdx + 1] ?? 30);
      for (let j = 0; j < n; j++) {
        const pl = out[idx++];
        if (!pl) break;
        html += makeDot(pl, xs[j], y, side);
      }
    }
    return html;
  }

  const homeDots = layout(homeXI, homeFormation, "home");
  const awayDots = layout(awayXI, awayFormation, "away");

  return `
    <div class="pitch">
      <div class="pitch-lines"></div>
      <div class="pitch-mid"></div>

      <div class="pitch-teamname left">
        ${safeHTML(selectedFixture.home?.name || "Casa")} • ${safeHTML(homeFormation)} <span class="pitch-badge">STIMATA</span>
      </div>
      <div class="pitch-teamname right">
        ${safeHTML(selectedFixture.away?.name || "Trasferta")} • ${safeHTML(awayFormation)} <span class="pitch-badge">STIMATA</span>
      </div>

      <div class="pitch-grid">
        ${homeDots}
        ${awayDots}
      </div>
      <div class="pitch-footnote muted">
  * Formazione stimata dalle ultime partite (escludendo indisponibili quando disponibili).
  <span class="pitch-badge pitch-badge--est">AFFIDABILITÀ: MEDIA</span>
</div>
    </div>
  `;
}

// abilita click players (event delegation)
function wirePitchClicks() {
  const root = document.getElementById("lineupsContent");
  if (!root || root.__wired) return;
  root.__wired = true;

  root.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.(".pitch-player");
    if (!btn) return;

    const playerId = btn.getAttribute("data-player-id");
    const playerName = btn.getAttribute("data-player-name") || "Giocatore";

    if (!playerId) return;

    await openPlayerModal(playerId, playerName);
  });
}
async function openPlayerModal(playerId, playerName) {
  const auth = document.getElementById("authModal");
  if (auth && !auth.classList.contains("hidden")) return;
  const modal = document.getElementById("playerModal");
  const title = document.getElementById("playerTitle");
  const body = document.getElementById("playerBody");
  const closeBtn = document.getElementById("btnClosePlayer");
  if (!modal || !title || !body) return;

  title.textContent = playerName || "Giocatore";
  body.innerHTML = `<p class="muted"><em>Carico statistiche…</em></p>`;
  modal.classList.remove("hidden");

  const leagueId = selectedFixture?.leagueId;
  const season = selectedFixture?.season;
  const key = `${playerId}|${leagueId}|${season}`;

  // chiusura
  const close = () => modal.classList.add("hidden");
  closeBtn?.addEventListener("click", close, { once: true });
  modal.addEventListener(
    "click",
    (e) => {
      if (e.target?.id === "playerModal") close();
    },
    { once: true },
  );

  if (!leagueId || !season) {
    body.innerHTML = `<p class="muted"><em>Statistiche non disponibili (mancano league/season).</em></p>`;
    return;
  }

  const cached = __PLAYER_STATS_CACHE__.get(key);
  if (cached) {
    body.innerHTML = cached;
    return;
  }

  // API-Football players: /players?id=...&season=...&league=...
  const r = await apiGet(
    `/players?id=${encodeURIComponent(playerId)}&season=${encodeURIComponent(season)}&league=${encodeURIComponent(leagueId)}`,
    {
      retries: 2,
      delays: [450, 900],
    },
  );

  if (!r.ok || r.errors || !Array.isArray(r.arr) || r.arr.length === 0) {
    body.innerHTML = `<p class="muted"><em>Nessuna statistica trovata per questo giocatore.</em></p>`;
    return;
  }

  const p = r.arr[0]?.player || {};
  const stats = r.arr[0]?.statistics?.[0] || {};

  const games = stats?.games || {};
  const goals = stats?.goals || {};
  const cards = stats?.cards || {};
  const fouls = stats?.fouls || {};
  const shots = stats?.shots || {};
  const passes = stats?.passes || {};

  const html = `
    <div class="kv">
      <div class="kv-row"><div class="k">Nome</div><div class="v"><strong>${safeHTML(p?.name || playerName)}</strong></div></div>
      <div class="kv-row"><div class="k">Età</div><div class="v">${safeHTML(p?.age ?? "—")}</div></div>
      <div class="kv-row"><div class="k">Ruolo</div><div class="v">${safeHTML(games?.position ?? "—")}</div></div>
      <div class="kv-row"><div class="k">Presenze</div><div class="v">${safeHTML(games?.appearences ?? games?.appearances ?? "—")}</div></div>
      <div class="kv-row"><div class="k">Minuti</div><div class="v">${safeHTML(games?.minutes ?? "—")}</div></div>

      <div class="kv-row"><div class="k">Gol</div><div class="v">${safeHTML(goals?.total ?? "—")}</div></div>
      <div class="kv-row"><div class="k">Assist</div><div class="v">${safeHTML(goals?.assists ?? "—")}</div></div>

      <div class="kv-row"><div class="k">Tiri</div><div class="v">${safeHTML(shots?.total ?? "—")} tot / ${safeHTML(shots?.on ?? "—")} in porta</div></div>
      <div class="kv-row"><div class="k">Passaggi</div><div class="v">${safeHTML(passes?.total ?? "—")} tot / ${safeHTML(passes?.key ?? "—")} key</div></div>

      <div class="kv-row"><div class="k">Falli</div><div class="v">${safeHTML(fouls?.committed ?? "—")} commessi / ${safeHTML(fouls?.drawn ?? "—")} subiti</div></div>
      <div class="kv-row"><div class="k">Cartellini</div><div class="v">🟨 ${safeHTML(cards?.yellow ?? "—")} / 🟥 ${safeHTML(cards?.red ?? "—")}</div></div>
    </div>
  `;

  __PLAYER_STATS_CACHE__.set(key, html);
  body.innerHTML = html;
}
window.showTeam = showTeam;
