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
    return 0;
  };

  return {
    corners: pick("Corner Kicks", "Corners", "corner kicks", "corners"),
  };
}

async function getCornersForFixtureTeams(fixtureId, homeId, awayId) {
  // ritorna Map(teamId -> corners)
  const out = new Map();
  out.set(homeId, 0);
  out.set(awayId, 0);

  const r = await apiGet(`/fixtures/statistics?fixture=${fixtureId}`, {
    retries: 2,
    delays: [500, 1000],
  });
  if (!r.ok || r.errors || !Array.isArray(r.arr) || r.arr.length === 0) return out;

  for (const row of r.arr) {
    const teamId = row?.team?.id ?? null;
    if (!teamId) continue;
    if (teamId !== homeId && teamId !== awayId) continue;

    const stats = normalizeCornersStats(row?.statistics || []);
    out.set(teamId, stats.corners || 0);
  }

  return out;
}
