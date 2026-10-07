// js/features/panelsShared.js
// Funzioni condivise dai pannelli (referee / teams / corners / shots)
// IMPORTANTISSIMO: qui vivono i setter UI + helpers + cache

/* =========================
   SETTERS UI (card content)
   ========================= */
function setReferee(html) {
  const el = document.getElementById("referee");
  if (el) el.innerHTML = html;
}

function setTeams(html) {
  const el = document.getElementById("teamsPanel");
  if (el) el.innerHTML = html;
}

function setCorners(html) {
  const el = document.getElementById("cornersPanel");
  if (el) el.innerHTML = html;
}

function setShots(html) {
  const el = document.getElementById("shotsPanel");
  if (el) el.innerHTML = html;
}

function setInjuries(html) {
  const el = document.getElementById("injuriesPanel");
  if (el) el.innerHTML = html;
}

/* =========================
   HELPERS BASE
   ========================= */
function pct(part, total) {
  const p = Number(part) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.round((p / t) * 100);
}

// Limite “safe” per non far esplodere le chiamate (puoi cambiarlo quando vuoi)
function getLimitForTeams() {
  const sel = document.getElementById("refHistoryCount");
  const requested = parseInt(sel?.value || "10", 10) || 10;

  // cap fisso per performance (non infinito)
  const CAP = 15;
  return Math.min(requested, CAP);
}

/* =========================
   FIXTURES (last N) per team
   ========================= */
async function fetchTeamLastFixtures(teamId, limit) {
  if (!teamId) return [];

  const n = Math.max(1, Number(limit) || 10);
  // Ultime N partite finite
  const r = await apiGet(
    `/fixtures?team=${teamId}&last=${n}&status=FT&timezone=Europe/Rome`,
    { retries: 2, delays: [400, 900] },
  );

  if (!r.ok || r.errors || !Array.isArray(r.arr)) return [];
  return r.arr;
}

/* =========================
   CACHE: EVENTS per fixture
   ========================= */
const __EVENTS_CACHE__ = new Map(); // fixtureId -> events[]

async function getFixtureEventsCached(fixtureId) {
  if (!fixtureId) return [];
  if (__EVENTS_CACHE__.has(fixtureId)) return __EVENTS_CACHE__.get(fixtureId);

  const r = await apiGet(`/fixtures/events?fixture=${fixtureId}`, {
    retries: 2,
    delays: [400, 900],
  });

  const arr = r.ok && !r.errors && Array.isArray(r.arr) ? r.arr : [];
  __EVENTS_CACHE__.set(fixtureId, arr);
  return arr;
}

/* =========================
   CACHE: STATISTICHE per fixture
   ========================= */
// Corner, Tiri, Falli e Indicatori consumano tutti lo stesso endpoint.
// La cache è condivisa per l'intera sessione e gli errori NON vengono salvati.
const __FIXTURE_STATS_ROWS_CACHE__ = new Map(); // fixtureId -> raw rows[]
const __FIXTURE_STATS_ROWS_INFLIGHT__ = new Map(); // fixtureId -> Promise<rows[]>

async function getFixtureStatisticsRowsCached(fixtureId) {
  if (!fixtureId) return [];

  if (__FIXTURE_STATS_ROWS_CACHE__.has(fixtureId)) {
    return __FIXTURE_STATS_ROWS_CACHE__.get(fixtureId);
  }

  if (__FIXTURE_STATS_ROWS_INFLIGHT__.has(fixtureId)) {
    return __FIXTURE_STATS_ROWS_INFLIGHT__.get(fixtureId);
  }

  const pending = (async () => {
    const r = await apiGet(`/fixtures/statistics?fixture=${fixtureId}`, {
      retries: 2,
      delays: [500, 1000],
    });

    if (!r.ok || r.errors || !Array.isArray(r.arr)) return [];

    __FIXTURE_STATS_ROWS_CACHE__.set(fixtureId, r.arr);
    return r.arr;
  })();

  __FIXTURE_STATS_ROWS_INFLIGHT__.set(fixtureId, pending);

  try {
    return await pending;
  } finally {
    __FIXTURE_STATS_ROWS_INFLIGHT__.delete(fixtureId);
  }
}

/* =========================
   CORNERS per fixture teams
   ========================= */
function normalizeCornersStats(statArray) {
  // API spesso usa "Corner Kicks"
  const lower = (s) => String(s || "").toLowerCase();
  const map = new Map();
  for (const s of statArray || []) map.set(lower(s?.type), s?.value);

  const pick = (...types) => {
    for (const t of types.map(lower)) {
      const v = map.get(t);
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  return {
    corners: pick("Corner Kicks", "Corners", "corner kicks", "corners"),
  };
}

async function getCornersForFixtureTeams(fixtureId, homeId, awayId) {
  const rows = await getFixtureStatisticsRowsCached(fixtureId);
  if (rows.length === 0) return null;

  const out = new Map();

  for (const row of rows) {
    const teamId = row?.team?.id ?? null;
    if (!teamId) continue;
    if (teamId !== homeId && teamId !== awayId) continue;

    const stats = normalizeCornersStats(row?.statistics || []);
    if (stats.corners == null) continue;
    out.set(teamId, stats.corners);
  }

  if (!out.has(homeId) || !out.has(awayId)) return null;
  return out;
}
