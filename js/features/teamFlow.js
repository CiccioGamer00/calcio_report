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

async function fetchNextFixture(teamId) {
  const r = await apiGet(
    `/fixtures?team=${teamId}&next=1&timezone=Europe/Rome`,
    { retries: 3, delays: [400, 900, 1600] },
  );
  if (!r.ok || r.errors || !r.arr || r.arr.length === 0) return null;
  return r.arr[0];
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
      <div class="kv-row"><div class="k">Fixture ID</div><div class="v"><span class="pill">${safeHTML(fx?.fixture?.id ?? "—")}</span></div></div>
    </div>
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

  const fx = await fetchNextFixture(team.id);
  if (!fx) {
    setMatch(`<p class="bad"><em>Nessun prossimo match trovato per "${safeHTML(team.name)}".</em></p>`);
    return;
  }

  // QUI: selectedFixture con la struttura che i pannelli già usano (home/away/id)
 selectedFixture = {
  id: fx?.fixture?.id ?? null,
  date: fx?.fixture?.date ?? null,

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
try { if (typeof loadTeamsForm === "function") await loadTeamsForm(); } catch (e) { console.error("loadTeamsForm", e); }
try { if (typeof loadTeamsCorners === "function") await loadTeamsCorners(); } catch (e) { console.error("loadTeamsCorners", e); }
try { if (typeof loadTeamsShots === "function") await loadTeamsShots(); } catch (e) { console.error("loadTeamsShots", e); }
try { if (typeof loadInjuries === "function") await loadInjuries(); } catch (e) { console.error("loadInjuries", e); }
}

// UX: suggerimenti + auto-start quando selezioni un suggerimento
function initTeamSearchUX() {
  const input = document.getElementById("teamInput");
  if (!input) return;

  input.addEventListener("input", () => {
    const q = sanitizeSearch(input.value);

    if (!q || q.length < 2) return;

    if (__SUGGEST_DEBOUNCE__) clearTimeout(__SUGGEST_DEBOUNCE__);
    __SUGGEST_DEBOUNCE__ = setTimeout(async () => {
      const items = await fetchSuggestions(q);
      updateDatalist(items);

      // Se l’input è esattamente uno dei suggerimenti → parti subito
      const exact = findSuggestedByName(input.value);
      if (exact) showTeam();
    }, 250);
  });

  input.addEventListener("change", () => {
    // alcuni browser “sparano” change quando scegli dal datalist
    const exact = findSuggestedByName(input.value);
    if (exact) showTeam();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      showTeam();
    }
  });
}

initTeamSearchUX();
window.showTeam = showTeam;


