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
async function resolveLeagueSeason(leagueId, fallbackSeason) {
  try {
    const r = await apiGet(`/leagues?id=${leagueId}`, { retries: 1 });
    const row =
      r.ok && !r.errors && Array.isArray(r.arr) && r.arr[0] ? r.arr[0] : null;
    const current = row?.seasons?.find?.((s) => s?.current)?.year ?? null;
    return current || fallbackSeason;
  } catch (e) {
    return fallbackSeason;
  }
}
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
  selectedFixture.season = await resolveLeagueSeason(selectedFixture.leagueId, selectedFixture.season);
  console.log("SEASON FIXED:", selectedFixture.season, "league", selectedFixture.leagueId);
console.log("TEAM SEARCHED:", selectedTeam);
console.log("FIXTURE:", selectedFixture);
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
// ✅ Se esiste la tendina custom, disattivo la datalist nativa del browser
if (box) {
  input.removeAttribute("list");
}
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

  // Mostra sempre il box
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

  // Se non disponibili ufficialmente: provo STIMATA (storico + indisponibili)
  if (!r.ok || r.errors || !Array.isArray(r.arr) || r.arr.length === 0) {
    const est = await estimateLineupsForFixture().catch((e) => {
  console.error("estimateLineupsForFixture ERROR:", e);
  return null;
});
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

  const homeFormation = String(home?.formation || "").trim();
  const awayFormation = String(away?.formation || "").trim();

  // ========== HELPERS ==========

  function parseFormation(f) {
    const parts = String(f || "")
      .split("-")
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return parts.length ? parts : null;
  }

  // Genera coordinate (X) in percentuale per centrare i giocatori sulla riga
  function rowXs(n) {
    if (n <= 1) return [50];
    const xs = [];
    for (let i = 0; i < n; i++) xs.push((100 * (i + 1)) / (n + 1));
    return xs;
  }

  // Crea il singolo "pallino" del giocatore sul campo
  function makeDot(pl, xPct, yPct, sideClass) {
    const num = pl?.number ?? "";
    const name = pl?.name || "—";
    const photo = pl?.photo || "";
    const pid = pl?.id ?? "";

    return `
  <button class="pitch-player ${sideClass}" style="--x:${xPct};--y:${yPct};" type="button"
    data-player-id="${safeHTML(pl?.id ?? "")}"
    data-player-name="${safeHTML(name)}"
  >
    <img class="pp-photo" src="${safeHTML(pl.photo)}" loading="lazy"
  onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22><circle cx=%2220%22 cy=%2214%22 r=%228%22 fill=%22%23cfd8dc%22/><path d=%22M6 38c2-9 10-14 14-14s12 5 14 14%22 fill=%22%23cfd8dc%22/></svg>';"
/>
    <div class="pp-badge">${safeHTML(num)}</div>
    <div class="pp-name">${safeHTML(name)}</div>
  </button>
`;
  }

  // Posiziona la squadra in base al modulo
  function layoutTeamPlayers(startXI, formationStr, side) {
    const formation = parseFormation(formationStr);
    const players = startXI.map((x) => x?.player || {}).filter(Boolean);

    // Identifica il portiere (NON assumere ordine startXI)
let gk = players.find(pl => String(pl?.pos || pl?.position || "").toUpperCase().startsWith("G"));
if (!gk) gk = players.find(pl => String(pl?.pos || pl?.position || "").toLowerCase().includes("goal"));
if (!gk) gk = players[0]; // ultimo fallback

const outfield = players.filter((pl) => pl?.id !== gk?.id);

    // Fallback se manca il modulo
    const rows = formation || [4, 4, 2];

    // Y Levels per un campo verticale (0-100%)
    const ySteps = [6, 20, 34, 46];

    // Inverti la Y per la squadra di casa (che gioca in basso verso l'alto)
    const finalY = (y) => (side === "home" ? 100 - y : y);

    const dots = [];

    // Posiziona il Portiere
    if (gk) {
      dots.push(makeDot(gk, 50, finalY(ySteps[0]), side));
    }

    // Posiziona i giocatori di movimento
    let idx = 0;
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const n = rows[rIdx];
      const xs = rowXs(n); // Asse X (larghezza)
      const yDepth = finalY(ySteps[rIdx + 1] || 46); // Asse Y (profondità)

      for (let j = 0; j < n; j++) {
        const pl = outfield[idx++];
        if (!pl) break;
        // QUI ERA IL BUG! Ora le X e Y sono assegnate correttamente dentro il ciclo
        dots.push(makeDot(pl, xs[j], yDepth, side));
      }
    }

    // Giocatori extra (in caso di panchinari finiti per errore nei titolari)
    while (idx < outfield.length) {
      const pl = outfield[idx++];
      dots.push(makeDot(pl, 50, finalY(50), side));
    }

    return dots.join("");
  }

  // Disegna il contenitore del campo
  function renderPitch(homeDots, awayDots) {
    const homeName = selectedFixture.home?.name || "Casa";
    const awayName = selectedFixture.away?.name || "Trasferta";

    return `
      <div class="pitch-container">
        <div class="pitch">
          <div class="pitch-lines"></div>
          <div class="pitch-mid"></div>
          <div class="pitch-grid">
            ${awayDots}
            ${homeDots}
          </div>
        </div>
        <div class="pitch-legend" style="display:flex; justify-content:space-between; margin-top:10px; font-size:13px;">
          <div class="legend-team">
             <strong>${safeHTML(homeName)}</strong> <span class="pitch-badge pitch-badge--official">UFFICIALE</span><br>
             <span class="muted">${homeFormation ? `Modulo: ${safeHTML(homeFormation)}` : ""}</span>
          </div>
          <div class="legend-team text-right" style="text-align: right;">
             <strong>${safeHTML(awayName)}</strong> <span class="pitch-badge pitch-badge--official">UFFICIALE</span><br>
             <span class="muted">${awayFormation ? `Modulo: ${safeHTML(awayFormation)}` : ""}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderPitchPlaceholder(msg) {
    return `
      <div class="pitch-container">
        <div class="pitch pitch--empty" style="display:flex; align-items:center; justify-content:center;">
          <div class="pitch-lines"></div>
          <div class="pitch-mid"></div>
          <div class="muted" style="z-index:10;"><em>${safeHTML(msg)}</em></div>
        </div>
      </div>
    `;
  }

  // --- ESECUZIONE ---
  const homeDots = layoutTeamPlayers(homeXI, homeFormation, "home");
  const awayDots = layoutTeamPlayers(awayXI, awayFormation, "away");

  content.innerHTML = renderPitch(homeDots, awayDots);
  wirePitchClicks();
}
// ====== STIMA FORMAZIONI E ALLENATORI (fallback) ======
const __EST_LINEUP_CACHE__ = new Map(); // key -> {ts, data}
const __PLAYER_STATS_CACHE__ = new Map(); // playerId|season|league -> data
const __TEAM_APPEAR_CACHE__ = new Map(); // team|league|season -> {ts, map(playerId->apps)}
function cacheKeyEst(teamId, leagueId, season) {
  return `${teamId}|${leagueId || "all"}|${season || "all"}`;
}

// 1. Recupera l'allenatore reale
async function fetchCurrentCoach(teamId) {
  if (!teamId) return "N/D";
  try {
    const r = await apiGet(`/coachs?team=${teamId}`, { retries: 1 });
    if (r && r.ok && Array.isArray(r.arr) && r.arr.length > 0) {
      return r.arr[0]?.name || "N/D";
    }
  } catch (e) {
    console.warn("Errore fetch coach");
  }
  return "N/D";
}

// 2. Recupera infortunati
async function fetchInjuredPlayerIds(teamId, season) {
  // ✅ Nuova logica: indisponibili SOLO per la partita selezionata
  // Usa lo stesso endpoint del pannello injuriesPanel: /injuries?fixture=...
  const out = new Set();

  const fxId = selectedFixture?.id ?? null;
  if (!fxId || !teamId) return out;

  try {
    const r = await apiGet(`/injuries?fixture=${fxId}`, {
      retries: 2,
      delays: [400, 900],
    });

    if (!r.ok || r.errors || !Array.isArray(r.arr)) return out;

    // filtra solo gli indisponibili della squadra richiesta
    for (const row of r.arr) {
      if ((row?.team?.id ?? null) !== teamId) continue;
      const pid = row?.player?.id ?? null;
      if (pid) out.add(pid);
    }

    return out;
  } catch (e) {
    return out;
  }
}
async function fetchSquadPlayerIds(teamId) {
  // /players/squads?team=...  -> rosa attuale (riduce i "fantasmi" e gli omonimi)
  if (!teamId) return null;
  const r = await apiGet(`/players/squads?team=${teamId}`, {
    retries: 2,
    delays: [400, 900],
  });
  if (!r.ok || r.errors || !Array.isArray(r.arr) || !r.arr.length) return null;

  const set = new Set();
  const squad = r.arr[0]?.players;
  if (Array.isArray(squad)) {
    for (const p of squad) {
      const pid = p?.id ?? null;
      if (pid) set.add(pid);
    }
  }
  return set.size ? set : null;
}
async function fetchTeamLeagueAppearances(teamId, leagueId, season) {
  if (!teamId || !leagueId || !season) return null;

  const key = `${teamId}|${leagueId}|${season}`;
  const hit = __TEAM_APPEAR_CACHE__.get(key);
  if (hit && Date.now() - hit.ts < 10 * 60_000) return hit.map;

  const out = new Map();

  let page = 1;
  let safety = 0;

  while (safety++ < 6) {
    const r = await apiGet(
      `/players?team=${teamId}&league=${leagueId}&season=${season}&page=${page}`,
      { retries: 1, delays: [350] },
    );

    const arr = (r.ok && !r.errors && Array.isArray(r.arr)) ? r.arr : [];
    if (!arr.length) break;

    for (const row of arr) {
      const pid = row?.player?.id ?? null;
      if (!pid) continue;

      const stats = Array.isArray(row?.statistics) ? row.statistics[0] : null;
      const apps = stats?.games?.appearences ?? stats?.games?.appearances ?? 0;

      out.set(pid, Number(apps) || 0);
    }

    if (arr.length < 20) break;
    page++;
  }

  __TEAM_APPEAR_CACHE__.set(key, { ts: Date.now(), map: out });
  return out;
}
function sortByRole(players) {
  const rank = (pos) => {
    const p = String(pos || "").toUpperCase();
    if (p.includes("G")) return 1; // GK
    if (p.includes("D")) return 2; // DEF
    if (p.includes("M")) return 3; // MID
    if (p.includes("F") || p.includes("A")) return 4; // ATT
    return 5;
  };
  return [...players].sort((a, b) => rank(a.pos) - rank(b.pos));
}

function formationMode(arr) {
  if (!arr || !arr.length) return "4-4-2";
  const map = {};
  arr.forEach((f) => {
    if (f) map[f] = (map[f] || 0) + 1;
  });
  return Object.keys(map).reduce((a, b) => (map[a] > map[b] ? a : b), "4-4-2");
}

async function estimateLineupForTeam(teamId, leagueId, season, limit = 10) {
  if (!teamId) return null;

  const key = cacheKeyEst(teamId, leagueId, season);
  const hit = __EST_LINEUP_CACHE__.get(key);
  if (hit && Date.now() - hit.ts < 5 * 60_000) return hit.data;

  const [injured, coachName] = await Promise.all([
    fetchInjuredPlayerIds(teamId, season),
    fetchCurrentCoach(teamId),
  ]);

  // 1) ultimi match (prima stessa lega, poi fallback all)
  let fixtures = [];
  if (leagueId && season) {
    const fx = await apiGet(
      `/fixtures?team=${teamId}&league=${leagueId}&season=${season}&last=${limit}&status=FT&timezone=Europe/Rome`,
      { retries: 2, delays: [450, 900] },
    );
    fixtures = fx.ok && !fx.errors && Array.isArray(fx.arr) ? fx.arr : [];
  }
  if (!fixtures.length) {
    const fx = await apiGet(
      `/fixtures?team=${teamId}&last=${limit}&status=FT&timezone=Europe/Rome`,
      { retries: 2, delays: [450, 900] },
    );
    fixtures = fx.ok && !fx.errors && Array.isArray(fx.arr) ? fx.arr : [];
  }
  if (!fixtures.length) return null;

  // 2) rosa attuale (filtra fantasmi)
  const squadIds = await fetchSquadPlayerIds(teamId).catch(() => null);

  // counts: playerId -> {w, player}
  const counts = new Map();
  const formations = []; // {f, w}
  let usedMatches = 0;

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const fid = f?.fixture?.id ?? null;
    if (!fid) continue;

    const w = Math.max(0.35, 1 - i * 0.12);

    const lr = await apiGet(`/fixtures/lineups?fixture=${fid}`, {
      retries: 1,
      delays: [450],
    });
    const arr = lr.ok && !lr.errors && Array.isArray(lr.arr) ? lr.arr : [];
    if (!arr.length) continue;

    const block = arr.find((x) => (x?.team?.id ?? null) === teamId) || null;
    if (!block) continue;

    usedMatches++;

    const formation = String(block?.formation || "").trim();
    if (formation) formations.push({ f: formation, w });

    const startXI = Array.isArray(block?.startXI) ? block.startXI : [];
    for (const row of startXI) {
      const pl = row?.player || {};
      const pid = pl?.id ?? null;
      if (!pid) continue;

      if (injured.has(pid)) continue;
      if (squadIds && !squadIds.has(pid)) continue;

      const prev = counts.get(pid) || { w: 0, player: null };
      counts.set(pid, {
        w: prev.w + w,
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

  // 3) MODULO DEL MISTER = moda pesata
  const fm = new Map();
  for (const x of formations) fm.set(x.f, (fm.get(x.f) || 0) + x.w);

  let bestForm = "4-4-2";
  let bestW = 0;
  for (const [k, v] of fm.entries()) {
    if (v > bestW) {
      bestW = v;
      bestForm = k;
    }
  }

  // ===== Helpers ruolo / settore =====
  function macroRoleFromPos(pos) {
    const p = String(pos || "").toUpperCase();
    if (p.startsWith("G")) return "GK";
    if (p.startsWith("D")) return "DEF";
    if (p.startsWith("M")) return "MID";
    if (p.startsWith("F") || p.startsWith("A")) return "ATT";
    return "MID";
  }

  function macroRoleFromSquadPosition(position) {
    const s = String(position || "").toLowerCase();
    if (s.includes("goal")) return "GK";
    if (s.includes("def")) return "DEF";
    if (s.includes("mid")) return "MID";
    if (s.includes("forw") || s.includes("att") || s.includes("strik") || s.includes("wing")) return "ATT";
    return "MID";
  }

  function parseFormationCounts(fStr) {
    const parts = String(fStr || "4-4-2")
      .split("-")
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    const def = parts[0] ?? 4;
    const mid = parts[1] ?? 4;
    const att = parts[2] ?? 2;
    return { GK: 1, DEF: def, MID: mid, ATT: att };
  }

  function stableFallbackSort(a, b) {
    const sa = a?.score ?? 0;
    const sb = b?.score ?? 0;
    if (sb !== sa) return sb - sa;

    const na = Number(a?.number);
    const nb = Number(b?.number);
    const hasNa = Number.isFinite(na);
    const hasNb = Number.isFinite(nb);
    if (hasNa && hasNb && na !== nb) return na - nb;
    if (hasNa !== hasNb) return hasNa ? -1 : 1;

    return String(a?.name || "").localeCompare(String(b?.name || ""), "it", { sensitivity: "base" });
  }

  // presenze competizione (bulk) -> evita 0 presenze quando possibile
  const appsMap = await fetchTeamLeagueAppearances(teamId, leagueId, season).catch(() => null);

  // lista ranked dai match recenti
  const rankedList = Array.from(counts.values()).sort((a, b) => b.w - a.w);

  async function buildXIBySectors() {
    const need = parseFormationCounts(bestForm || "4-4-2");
    const countRole = (role) => chosen.filter((x) => x.pos === role).length;
const missing = (role) => Math.max(0, (need[role] || 0) - countRole(role));

    const scoreById = new Map();
    for (const [pid, obj] of counts.entries()) scoreById.set(pid, obj?.w ?? 0);

    // ✅ pool “vero” dalla competizione: players?team&league&season (coerente con Serie A 2025)
const teamPlayers = [];
if (leagueId && season) {
  let page = 1;
  let safety = 0;
  while (safety++ < 6) {
    const r = await apiGet(
      `/players?team=${teamId}&league=${leagueId}&season=${season}&page=${page}`,
      { retries: 1, delays: [350] },
    );
    const arr = (r.ok && !r.errors && Array.isArray(r.arr)) ? r.arr : [];
    if (!arr.length) break;
    teamPlayers.push(...arr);
    if (arr.length < 20) break;
    page++;
  }
}

// pool disponibile (no injured) basato su players della stagione/lega
let pool = (teamPlayers || [])
  .map((row) => {
    const p = row?.player || {};
    const statsArr = Array.isArray(row?.statistics) ? row.statistics : [];
const stats =
  statsArr.find((s) => String(s?.league?.id) === String(leagueId)) ||
  statsArr[0] ||
  null;
    const posRaw = stats?.games?.position || "";     // "Goalkeeper/Defender/Midfielder/Attacker"
    const apps = stats?.games?.appearences ?? stats?.games?.appearances ?? 0;

    const pid = p?.id ?? null;
    if (!pid) return null;
    if (injured.has(pid)) return null;
   // if (squadIds && !squadIds.has(pid)) return null;

    const role = macroRoleFromSquadPosition(posRaw);
    const recent = scoreById.get(pid) ?? 0;

    // score: prima recent, poi presenze competizione
    const score = recent > 0 ? (recent * 1000 + Number(apps || 0)) : Number(apps || 0);

    return {
      id: pid,
      name: p?.name || "—",
      number: p?.number ?? "",
      photo: p?.photo || "",
      pos: role,
      apps: Number(apps || 0),
      score,
    };
  })
  .filter(Boolean);
      
      // FALLBACK: se /players è vuoto, usa rankedList (titolari reali recenti) come pool minimo
if (!pool.length && rankedList && rankedList.length) {
  pool = rankedList
    .map((it) => {
      const pl = it?.player;
      if (!pl?.id) return null;
      if (injured.has(pl.id)) return null;

      const role = macroRoleFromPos(pl.pos);
      return {
        id: pl.id,
        name: pl.name || "—",
        number: pl.number ?? "",
        photo: pl.photo || "",
        pos: role,
        apps: Number(appsMap?.get?.(pl.id) || 0),
        score: (it.w || 0) * 1000 + Number(appsMap?.get?.(pl.id) || 0),
      };
    })
    .filter(Boolean);
}

    // se ho appsMap e ho abbastanza gente con apps>0, preferisco quella
    if (appsMap) {
      const nonZero = pool.filter((p) => (p.apps ?? 0) > 0);
      if (nonZero.length >= 11) pool = nonZero;
    }

    // indicizza pool per ruolo
    const poolByRole = { GK: [], DEF: [], MID: [], ATT: [] };
    for (const p of pool) {
      const r = macroRoleFromPos(p.pos);
      (poolByRole[r] || (poolByRole[r] = [])).push(p);
    }
    for (const k of ["GK", "DEF", "MID", "ATT"]) poolByRole[k].sort(stableFallbackSort);
console.log("POOL GK (top5):", (poolByRole.GK||[]).slice(0,5).map(p=>`${p.name} apps:${p.apps} score:${p.score}`));
console.log("POOL MID (top8):", (poolByRole.MID||[]).slice(0,8).map(p=>`${p.name} apps:${p.apps} score:${p.score}`));
// Se il pool GK è vuoto (bug API/players), prendo il GK dai lineups reali (rankedList)
let forceGkFromRanked = (poolByRole.GK || []).length === 0;
    const chosen = [];
    const chosenIds = new Set();

    const takeFromRanked = (role, n) => {
      for (const it of rankedList) {
        if (chosen.length >= 11) break;
        const pl = it?.player;
        if (!pl?.id) continue;
        if (chosenIds.has(pl.id)) continue;

        const r = macroRoleFromPos(pl.pos);
        if (r !== role) continue;

        chosen.push({
          id: pl.id,
          name: pl.name || "—",
          number: pl.number ?? "",
          photo: pl.photo || "",
          pos: role,
        });
        chosenIds.add(pl.id);

        if (chosen.filter((x) => x.pos === role).length >= n) break;
      }
    };

    const fillRole = (role, n) => {
      while (chosen.filter((x) => x.pos === role).length < n) {
        const listAll = (poolByRole[role] || []).filter(p => !chosenIds.has(p.id));
const listNZ = listAll.filter(p => (p.apps ?? 0) > 0);
const source = listNZ.length ? listNZ : listAll;
const cand = source[0];
        if (!cand) break;

        chosen.push({
          id: cand.id,
          name: cand.name,
          number: cand.number,
          photo: cand.photo,
          pos: role,
        });
        chosenIds.add(cand.id);
      }
    };

    // 1) titolari storici: sempre per DEF/MID/ATT
takeFromRanked("DEF", need.DEF);
takeFromRanked("MID", need.MID);
takeFromRanked("ATT", need.ATT);

// 1b) GK: SOLO se il pool GK è vuoto (fallback deterministico)
if (forceGkFromRanked) {
  takeFromRanked("GK", need.GK);
}

// 2) fill dal pool rispettando il modulo
fillRole("GK", need.GK);
fillRole("DEF", need.DEF);
fillRole("MID", need.MID);
fillRole("ATT", need.ATT);

   // 3) se mancano ancora, riempio SOLO i ruoli ancora mancanti secondo il modulo
const order = ["GK", "DEF", "MID", "ATT"];

while (chosen.length < 11) {
  let added = false;

  // prova a colmare i "buchi" del modulo
  for (const role of order) {
    if (missing(role) <= 0) continue; // ruolo già pieno: NON aggiungere

    const listAll = (poolByRole[role] || []).filter(p => !chosenIds.has(p.id));
    const listNZ = listAll.filter(p => (p.apps ?? 0) > 0);
    const source = listNZ.length ? listNZ : listAll;
    const cand = source[0];

    if (cand) {
      chosen.push({ id: cand.id, name: cand.name, number: cand.number, photo: cand.photo, pos: role });
      chosenIds.add(cand.id);
      added = true;
      break;
    }
  }

  // se per quel ruolo non c'è nessuno nel pool, prendo il "best disponibile" da QUALSIASI ruolo
  // ma lo assegno al ruolo che manca di più (così la formazione resta 3-5-2)
  if (!added) {
    const deficitRole =
      order
        .map(r => ({ r, m: missing(r) }))
        .sort((a,b) => b.m - a.m)[0]?.r;

    if (!deficitRole || missing(deficitRole) <= 0) break;

    const any =
      ["MID","DEF","ATT","GK"]
        .flatMap(r => (poolByRole[r] || []))
        .filter(p => !chosenIds.has(p.id))
        .sort(stableFallbackSort)[0];

    if (!any) break;

    chosen.push({ id: any.id, name: any.name, number: any.number, photo: any.photo, pos: deficitRole });
    chosenIds.add(any.id);
  }
}

    // ordina finale: GK, DEF, MID, ATT
    const roleRank = { GK: 1, DEF: 2, MID: 3, ATT: 4 };
    chosen.sort((a, b) => (roleRank[a.pos] || 9) - (roleRank[b.pos] || 9));

    return chosen.slice(0, 11);
  }

  // ======= COSTRUZIONE OUTPUT =======

  const XI = await buildXIBySectors();
  const xiIds = new Set((XI || []).map(p => p?.id).filter(Boolean));

  // candidati (top 6)
  const roleKey = (pos) => {
    const p = String(pos || "").toUpperCase();
    if (p.startsWith("G")) return "GK";
    if (p.startsWith("D")) return "DEF";
    if (p.startsWith("M")) return "MID";
    if (p.startsWith("F") || p.startsWith("A")) return "ATT";
    return "MID";
  };

  const cand = { GK: [], DEF: [], MID: [], ATT: [] };
for (const it of rankedList.slice(0, 60)) { // 60 così compensiamo i "saltati"
  const p = it?.player;
  if (!p?.id) continue;

  // ✅ NON mostrare nei probabili chi è già negli XI
  if (xiIds.has(p.id)) continue;

  const r = roleKey(p.pos);
  const pctRaw = Math.round((it.w / (usedMatches || 1)) * 100);
  const pct = Math.max(0, Math.min(100, pctRaw));

  cand[r].push({ ...p, pct, score: it.w });
}
  cand.GK = cand.GK.slice(0, 4);
  cand.DEF = cand.DEF.slice(0, 6);
  cand.MID = cand.MID.slice(0, 6);
  cand.ATT = cand.ATT.slice(0, 6);

  const data = {
    formation: bestForm || "4-4-2",
    startXI: XI,
    coach: coachName,
    injuredCount: injured.size,
   badgeLabel: `STIMA (${usedMatches}/${limit})`,
    usedMatches,
    candidates: cand,
  };

  __EST_LINEUP_CACHE__.set(key, { ts: Date.now(), data });
  return data;
}

// 4. Fallback Globale Match
async function estimateLineupsForFixture() {
  const homeId = selectedFixture?.home?.id;
  const awayId = selectedFixture?.away?.id;
  if (!homeId || !awayId) return null;

  const leagueId = selectedFixture?.leagueId || null;
  const season = selectedFixture?.season || null;

  let [homeEst, awayEst] = await Promise.all([
    estimateLineupForTeam(homeId, leagueId, season, 10),
    estimateLineupForTeam(awayId, leagueId, season, 10),
  ]);

  if (!homeEst || !awayEst) return null;

  return {
    type: homeEst.isMock || awayEst.isMock ? "mock" : "estimated",
    home: homeEst,
    away: awayEst,
  };
}

// 5. Rendering del Campo
function renderPitchFromEstimate(est) {
  if (!est || !est.home || !est.away)
    return '<p class="muted">Errore rendering.</p>';
console.log("HOME XI", est.home.startXI.map(p=>`${p.name}(${p.pos})`).join(" | "));
console.log("AWAY XI", est.away.startXI.map(p=>`${p.name}(${p.pos})`).join(" | "));
  const homeFormation = est.home.formation || "4-4-2";
  const awayFormation = est.away.formation || "4-4-2";
  const homeCoach = est.home.coach || "N/D";
  const awayCoach = est.away.coach || "N/D";

  function parseFormation(f) {
    const parts = String(f || "4-4-2")
      .split("-")
      .map((n) => parseInt(n, 10))
      .filter((n) => !isNaN(n));
    return parts.length ? parts : [4, 4, 2];
  }

  function rowXs(n) {
    if (n <= 1) return [50];
    return Array.from({ length: n }, (_, i) => (100 * (i + 1)) / (n + 1));
  }

  function makeDot(pl, x, y, side) {
    const isFake = String(pl?.id).startsWith("mock");
    const disabledAttr = isFake
      ? 'disabled style="cursor:default; opacity:0.8;"'
      : "";

    return `
      <button class="pitch-player ${side}" style="--x:${x}; --y:${y};" type="button"
        data-player-id="${safeHTML(pl?.id)}" data-player-name="${safeHTML(pl?.name)}" ${disabledAttr}>
        <div class="pp-photo-wrapper">
            ${pl?.photo ? `<img class="pp-photo" src="${safeHTML(pl.photo)}" loading="lazy" onerror="this.style.display='none'" />` : '<div class="pp-photo-placeholder" style="width:100%;height:100%;background:#222;border-radius:50%;border:2px solid rgba(255,255,255,0.3);"></div>'}
            <div class="pp-badge">${safeHTML(pl?.number || "")}</div>
        </div>
        <div class="pp-name">${safeHTML(pl?.name || "—")}</div>
      </button>
    `;
  }

  function layout(teamData, side) {
    const players = teamData.startXI || [];
    const rows = parseFormation(teamData.formation);

    const ySteps = [6, 20, 32, 44];
    const finalY = (y) => (side === "home" ? 100 - y : y);

    let html = "";
    if (!players.length) return html;

    // GK: non assumere players[0]
let gk = players.find(pl => String(pl?.pos || "").toUpperCase() === "GK" || String(pl?.pos || "").toUpperCase().startsWith("G"));
if (!gk) gk = players[0];

const outfield = players.filter(p => p?.id !== gk?.id);

html += makeDot(gk, 50, finalY(ySteps[0]), side);

let idx = 0;
rows.forEach((num, rIdx) => {
  const xs = rowXs(num);
  const y = finalY(ySteps[rIdx + 1] || 44);
  for (let j = 0; j < num; j++) {
    if (outfield[idx]) html += makeDot(outfield[idx], xs[j], y, side);
    idx++;
  }
});
    return html;
  }
  function candButton(p) {
    if (!p?.id) return "";
    return `
    <button type="button" class="candChip"
      data-player-id="${safeHTML(p.id)}"
      data-player-name="${safeHTML(p.name)}"
      title="Apri statistiche"
    >
      ${p.photo ? `<img class="candPhoto" src="${safeHTML(p.photo)}" alt="" onerror="this.style.display='none'"/>` : ""}
      <span class="candName">${safeHTML(p.name)}</span>
      <span class="candPct">${safeHTML(p.pct ?? "—")}%</span>
    </button>
  `;
  }

  function candidatesBlock(teamName, c) {
    if (!c) return "";
    return `
    <div class="candTeam">
      <div class="candTitle">${safeHTML(teamName)}</div>

      <div class="candRow"><div class="candRole">POR</div><div class="candList">${(c.GK || []).map(candButton).join("") || `<span class="muted">—</span>`}</div></div>
      <div class="candRow"><div class="candRole">DIF</div><div class="candList">${(c.DEF || []).map(candButton).join("") || `<span class="muted">—</span>`}</div></div>
      <div class="candRow"><div class="candRole">CEN</div><div class="candList">${(c.MID || []).map(candButton).join("") || `<span class="muted">—</span>`}</div></div>
      <div class="candRow"><div class="candRole">ATT</div><div class="candList">${(c.ATT || []).map(candButton).join("") || `<span class="muted">—</span>`}</div></div>
    </div>
  `;
  }

  return `
    <div class="pitch-container">
      <div class="pitch">
        <div class="pitch-lines"></div>
        <div class="pitch-mid"></div>
        <div class="pitch-area-top"></div>
        <div class="pitch-area-bottom"></div>
        
        <div class="coach-badge home">
            <strong>👤 ${safeHTML(homeCoach)}</strong><br>
            <span style="opacity:0.8">⚙️ Modulo: ${homeFormation}</span>
        </div>
        <div class="coach-badge away">
            <strong>👤 ${safeHTML(awayCoach)}</strong><br>
            <span style="opacity:0.8">⚙️ Modulo: ${awayFormation}</span>
        </div>

        ${layout(est.home, "home")}
        ${layout(est.away, "away")}
      </div>
      <div class="pitch-legend" style="display:flex; justify-content:space-between; margin-top:10px; font-size:13px; padding: 0 10px;">
        <div class="legend-team" style="text-align: left;">
            <strong>${safeHTML(selectedFixture?.home?.name || "Casa")}</strong> 
            <span class="pitch-badge pitch-badge--est" style="border-color:#ffb84d; background:rgba(255,184,77,0.15);">
                ${safeHTML(est.home.badgeLabel)}
            </span>
        </div>
        
        <div class="legend-team" style="text-align: right;">
            <strong>${safeHTML(selectedFixture?.away?.name || "Trasferta")}</strong> 
            <span class="pitch-badge pitch-badge--est" style="border-color:#ffb84d; background:rgba(255,184,77,0.15);">
                ${safeHTML(est.away.badgeLabel)}
            </span>
        </div>
      </div>
      <div class="candWrap">
  ${candidatesBlock(selectedFixture?.home?.name || "Casa", est.home?.candidates)}
  ${candidatesBlock(selectedFixture?.away?.name || "Trasferta", est.away?.candidates)}
</div>
    </div>
  `;
}

// 6. Eventi Modale Statistiche
function wirePitchClicks() {
  const root = document.getElementById("lineupsContent");
  if (!root || root.__wired) return;
  root.__wired = true;

  root.addEventListener("click", async (e) => {
    const el =
      e.target?.closest?.(".pitch-player") ||
      e.target?.closest?.(".candChip");

    if (!el || el.hasAttribute("disabled")) return;

    const playerId = el.getAttribute("data-player-id");
    const playerName = el.getAttribute("data-player-name") || "Giocatore";

    if (!playerId || playerId === "undefined") return;

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

  const close = () => modal.classList.add("hidden");
  closeBtn?.addEventListener("click", close, { once: true });
  modal.addEventListener(
    "click",
    (e) => {
      if (e.target?.id === "playerModal") close();
    },
    { once: true },
  );

  const leagueId = selectedFixture?.leagueId || "39"; // Fallback Serie A
  const season = selectedFixture?.season || new Date().getFullYear();
  const key = `${playerId}|${leagueId}|${season}`;

  const cached = __PLAYER_STATS_CACHE__.get(key);
  if (cached) {
    body.innerHTML = cached;
    return;
  }

  const r = await apiGet(
    `/players?id=${encodeURIComponent(playerId)}&season=${encodeURIComponent(season)}`,
    { retries: 1 },
  );

  if (!r.ok || r.errors || !Array.isArray(r.arr) || r.arr.length === 0) {
    body.innerHTML = `<p class="muted"><em>Nessuna statistica dettagliata trovata per questo giocatore.</em></p>`;
    return;
  }

  const p = r.arr[0]?.player || {};
  // Cerchiamo le statistiche specifiche del campionato attuale (leagueId)
  const allStats = r.arr[0]?.statistics || [];
  const stats =
    allStats.find((s) => String(s.league?.id) === String(leagueId)) ||
    allStats[0] ||
    {};
  const games = stats?.games || {};
  const goals = stats?.goals || {};
  const cards = stats?.cards || {};

  const html = `
    <div class="kv">
      <div class="kv-row"><div class="k">Nome</div><div class="v"><strong>${safeHTML(p?.name || playerName)}</strong></div></div>
      <div class="kv-row"><div class="k">Età</div><div class="v">${safeHTML(p?.age ?? "—")}</div></div>
      <div class="kv-row"><div class="k">Ruolo</div><div class="v">${safeHTML(games?.position ?? "—")}</div></div>
      <div class="kv-row"><div class="k">Presenze</div><div class="v">${safeHTML(games?.appearences ?? games?.appearances ?? "—")}</div></div>
      <div class="kv-row"><div class="k">Gol / Assist</div><div class="v">${safeHTML(goals?.total ?? "0")} / ${safeHTML(goals?.assists ?? "0")}</div></div>
      <div class="kv-row"><div class="k">Cartellini (G/R)</div><div class="v">🟨 ${safeHTML(cards?.yellow ?? "0")} / 🟥 ${safeHTML(cards?.red ?? "0")}</div></div>
    </div>
  `;
  __PLAYER_STATS_CACHE__.set(key, html);
  body.innerHTML = html;
}

window.showTeam = showTeam;

