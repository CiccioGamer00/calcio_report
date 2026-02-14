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

function setMatch(html) {
  const el = document.getElementById("match");
  if (el) el.innerHTML = html;
}

function updateDatalist(items) {
  __LAST_SUGGEST_ITEMS__ = items || [];
  const dl = document.getElementById("teamSuggestions");
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
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  return (
    __LAST_SUGGEST_ITEMS__.find(
      (x) => String(x.name || "").trim().toLowerCase() === n,
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
    (t) => String(t?.team?.name || "").trim().toLowerCase() === low,
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

function renderMatchBasic(fx) {
  const dateISO = fx?.fixture?.date || null;
  const when = dateISO
    ? new Date(dateISO).toLocaleString("it-IT")
    : "—";

  const league = fx?.league?.name || "—";
  const round = fx?.league?.round || "";
  const venue = fx?.fixture?.venue?.name || "—";

  const home = fx?.teams?.home || {};
  const away = fx?.teams?.away || {};

  return `
    <div class="kv">
      <div class="kv-row"><div class="k">Competizione</div><div class="v">${safeHTML(league)} ${round ? `• ${safeHTML(round)}` : ""}</div></div>
      <div class="kv-row"><div class="k">Data/Ora</div><div class="v"><strong>${safeHTML(when)}</strong></div></div>
      <div class="kv-row"><div class="k">Stadio</div><div class="v">${safeHTML(venue)}</div></div>
      <div class="kv-row"><div class="k">Match</div><div class="v">
        <span class="teamline">
          ${home.logo ? `<img class="logo" src="${safeHTML(home.logo)}" alt="logo" />` : ""}
          <strong>${safeHTML(home.name || "Casa")}</strong>
          <span class="muted"> vs </span>
          <strong>${safeHTML(away.name || "Trasferta")}</strong>
          ${away.logo ? `<img class="logo" src="${safeHTML(away.logo)}" alt="logo" />` : ""}
        </span>
      </div></div>
  `;
}

function setLoadingAll() {
  setMatch(`<p class="muted"><em>Caricamento match...</em></p>`);
  if (typeof setReferee === "function") setReferee(`<p class="muted"><em>Caricamento arbitro...</em></p>`);
  if (typeof setTeams === "function") setTeams(`<p class="muted"><em>Caricamento squadre...</em></p>`);
  if (typeof setCorners === "function") setCorners(`<p class="muted"><em>Caricamento corner...</em></p>`);
  if (typeof setShots === "function") setShots(`<p class="muted"><em>Caricamento tiri...</em></p>`);
  if (typeof setInjuries === "function") setInjuries(`<p class="muted"><em>Caricamento indisponibili...</em></p>`);
}

async function showTeam() {
  const input = document.getElementById("teamInput");
  const q = sanitizeSearch(input ? input.value : "");
  if (!q || q.length < 2) return;

  // reset “pulito” così la seconda ricerca riparte sempre
  selectedTeam = null;
  selectedFixture = null;

  setLoadingAll();

  const team = await pickTeamByName(q);
  if (!team || !team.id) {
    setMatch(`<p class="bad"><em>Nessuna squadra trovata per "${safeHTML(q)}".</em></p>`);
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
    setMatch(`<p class="bad"><em>Nessun prossimo match trovato per "${safeHTML(team.name)}".</em></p>`);
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

  setMatch(renderMatchBasic(fx));

  // Carica pannelli (se esistono, compatibile)
  try { if (typeof loadFixtureDetails === "function") await loadFixtureDetails(); } catch (e) { console.error("loadFixtureDetails", e); }
  if (fx2) {
  const when2 = fx2?.fixture?.date ? new Date(fx2.fixture.date).toLocaleString("it-IT") : "—";
  const h2 = fx2?.teams?.home?.name || "—";
  const a2 = fx2?.teams?.away?.name || "—";
  const comp2 = fx2?.league?.name || "—";

  const matchEl = document.getElementById("match");
  if (matchEl) {
    matchEl.innerHTML += `
      <hr />
      <p class="muted"><strong>Incontro successivo</strong></p>
      <p class="muted">${safeHTML(when2)} — ${safeHTML(h2)} vs ${safeHTML(a2)} <em>(${safeHTML(comp2)})</em></p>
    `;
  }
}
if (oppNextAfter) {
  const whenO = oppNextAfter?.fixture?.date
    ? new Date(oppNextAfter.fixture.date).toLocaleString("it-IT")
    : "—";
  const hO = oppNextAfter?.teams?.home?.name || "—";
  const aO = oppNextAfter?.teams?.away?.name || "—";
  const compO = oppNextAfter?.league?.name || "—";

  const matchEl = document.getElementById("match");
  if (matchEl) {
    matchEl.innerHTML += `
      <hr />
      <p class="muted"><strong>Prossimo impegno dell’altra squadra (dopo questo match)</strong></p>
      <p class="muted">${safeHTML(whenO)} — ${safeHTML(hO)} vs ${safeHTML(aO)} <em>(${safeHTML(compO)})</em></p>
    `;
  }
}
try { if (typeof loadTeamsForm === "function") await loadTeamsForm(); } catch (e) { console.error("loadTeamsForm", e); }
try { if (typeof loadTeamsCorners === "function") await loadTeamsCorners(); } catch (e) { console.error("loadTeamsCorners", e); }
try { if (typeof loadTeamsShots === "function") await loadTeamsShots(); } catch (e) { console.error("loadTeamsShots", e); }
try { if (typeof loadInjuries === "function") await loadInjuries(); } catch (e) { console.error("loadInjuries", e); }
  try { if (typeof loadTeamsFouls === "function") await loadTeamsFouls(); } catch (e) { console.error("loadTeamsFouls", e); }
}

// UX: suggerimenti stabili + NO riapertura dopo selezione
function initTeamSearchUX() {
  const input = document.getElementById("teamInput");
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
window.showTeam = showTeam;


