// js/features/panelsShared.js

/* =========================
   CACHE EVENTI / STATISTICHE
   ========================= */
const __FIXTURE_EVENTS_CACHE__ = new Map(); // fixtureId -> events array
const __FIXTURE_STATS_CACHE__ = new Map(); // fixtureId -> Map(teamId -> cornersNumber)

async function getFixtureEventsCached(fixtureId) {
  if (!fixtureId) return [];
  if (__FIXTURE_EVENTS_CACHE__.has(fixtureId)) return __FIXTURE_EVENTS_CACHE__.get(fixtureId);

  const r = await apiGet(`/fixtures/events?fixture=${fixtureId}`);
  const ev = r.ok && !r.errors ? (r.arr || []) : [];
  __FIXTURE_EVENTS_CACHE__.set(fixtureId, ev);
  return ev;
}

function extractCornersFromStatsForTeam(statsArr, teamId) {
  const teamBlock = (statsArr || []).find((x) => (x?.team?.id ?? null) === teamId);
  const list = teamBlock?.statistics || [];
  const cornerItem = list.find((s) => String(s?.type || "").toLowerCase() === "corner kicks");
  const v = cornerItem?.value;

  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

async function getCornersForFixtureTeams(fixtureId, homeId, awayId) {
  if (__FIXTURE_STATS_CACHE__.has(fixtureId)) return __FIXTURE_STATS_CACHE__.get(fixtureId);

  const r = await apiGet(`/fixtures/statistics?fixture=${fixtureId}`);
  const statsArr = r.ok && !r.errors ? (r.arr || []) : [];

  const m = new Map();
  m.set(homeId, extractCornersFromStatsForTeam(statsArr, homeId));
  m.set(awayId, extractCornersFromStatsForTeam(statsArr, awayId));

  __FIXTURE_STATS_CACHE__.set(fixtureId, m);
  return m;
}

/* =========================
   UTILS COMUNI
   ========================= */
function getLimitForTeams() {
  const limitEl = document.getElementById("refHistoryCount");
  let limit = parseInt(limitEl?.value || "10", 10);
  if (Number.isNaN(limit) || limit < 1) limit = 10;

  const HARD_CAP = 20;
  return Math.min(limit, HARD_CAP);
}

async function fetchTeamLastFixtures(teamId, limit) {
  const r = await apiGet(`/fixtures?team=${teamId}&last=${limit}&status=FT&timezone=Europe/Rome`);
  if (!r.ok || r.errors) return [];
  return r.arr || [];
}

function pct(part, total) {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/* =========================
   EVENTI UI (pannelli)
   ========================= */
document.getElementById("refHistoryCount")?.addEventListener("change", () => {
  if (selectedFixture?.referee && selectedFixture.referee !== "—") loadRefereeHistory();
  if (selectedFixture?.home?.id && selectedFixture?.away?.id) loadTeamsForm();
  if (selectedFixture?.home?.id && selectedFixture?.away?.id) loadTeamsCorners();
});