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

function getLimitForTeams() {
  const sel = document.getElementById("refHistoryCount");
  const requested = parseInt(sel?.value || "10", 10) || 10;
  const CAP = 15;
  return Math.min(requested, CAP);
}

function uniqueFixtures(rows) {
  const out = [];
  const seen = new Set();
  for (const fx of rows || []) {
    const id = fx?.fixture?.id ?? null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(fx);
  }
  return out;
}

function sortFixturesNewestFirst(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ta = Number(a?.fixture?.timestamp || 0);
    const tb = Number(b?.fixture?.timestamp || 0);
    return tb - ta;
  });
}

function isFinishedOrPast(fx) {
  const status = String(fx?.fixture?.status?.short || "").toUpperCase();
  if (["FT", "AET", "PEN"].includes(status)) return true;
  const ts = Number(fx?.fixture?.timestamp || 0);
  return ts > 0 && ts < Math.floor(Date.now() / 1000);
}

/* =========================
   FIXTURES (last N) per team
   ========================= */
async function fetchTeamLastFixtures(teamId, limit) {
  if (!teamId) return [];

  const n = Math.max(1, Number(limit) || 10);
  const attempts = [...new Set([n, Math.max(n + 2, 7), Math.max(n + 5, 10)])];

  // Prima usiamo il pattern ufficiale team + last.
  // Se una specifica cache-key contiene un vuoto temporaneo, cambiare N ci permette
  // di usare una seconda cache-key senza inventare parametri non necessari.
  for (const lastN of attempts) {
    const r = await apiGet(
      `/fixtures?team=${teamId}&last=${lastN}&timezone=Europe/Rome`,
      { retries: 1, delays: [700] },
    );

    if (r.ok && !r.errors && Array.isArray(r.arr) && r.arr.length) {
      const rows = sortFixturesNewestFirst(uniqueFixtures(r.arr));
      if (rows.length) return rows.slice(0, n);
    }
  }

  // Ultimo fallback: stessa lega del match selezionato, stagione corrente e precedente.
  const leagueId =
    typeof selectedFixture !== "undefined" ? selectedFixture?.leagueId : null;
  const season =
    typeof selectedFixture !== "undefined" ? Number(selectedFixture?.season) : null;

  if (!leagueId || !Number.isFinite(season)) {
    console.warn("fetchTeamLastFixtures: no league/season fallback", teamId);
    return [];
  }

  let rows = [];
  for (const s of [season, season - 1]) {
    const r = await apiGet(
      `/fixtures?league=${leagueId}&season=${s}&team=${teamId}&timezone=Europe/Rome`,
      { retries: 1, delays: [800] },
    );

    if (r.ok && !r.errors && Array.isArray(r.arr) && r.arr.length) {
      rows.push(...r.arr.filter(isFinishedOrPast));
      rows = sortFixturesNewestFirst(uniqueFixtures(rows));
      if (rows.length >= n) break;
    }
  }

  if (!rows.length) {
    console.warn("fetchTeamLastFixtures: no historical fixtures found", {
      teamId,
      leagueId,
      season,
    });
  }

  return rows.slice(0, n);
}

/* =========================
   CACHE: EVENTS per fixture
   ========================= */
const __EVENTS_CACHE__ = new Map();

async function getFixtureEventsCached(fixtureId) {
  if (!fixtureId) return [];
  if (__EVENTS_CACHE__.has(fixtureId)) return __EVENTS_CACHE__.get(fixtureId);

  const r = await apiGet(`/fixtures/events?fixture=${fixtureId}`, {
    retries: 2,
    delays: [500, 1100],
  });

  const arr = r.ok && !r.errors && Array.isArray(r.arr) ? r.arr : [];
  __EVENTS_CACHE__.set(fixtureId, arr);
  return arr;
}

/* =========================
   CORNERS per fixture teams
   ========================= */
function normalizeCornersStats(statArray) {
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
  const out = new Map();
  out.set(homeId, 0);
  out.set(awayId, 0);

  const r = await apiGet(`/fixtures/statistics?fixture=${fixtureId}`, {
    retries: 2,
    delays: [650, 1300],
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

/* =========================
   RESILIENZA NEXT FIXTURES
   ========================= */
function installResilientNextFixtures() {
  if (typeof window.fetchNextFixtures !== "function") {
    setTimeout(installResilientNextFixtures, 80);
    return;
  }
  if (window.fetchNextFixtures.__crResilientNext) return;

  function isUsableFutureFixture(fx) {
    const status = String(fx?.fixture?.status?.short || "").toUpperCase();
    const blocked = new Set(["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"]);
    if (blocked.has(status)) return false;

    const ts = Number(fx?.fixture?.timestamp || 0);
    if (!ts) return false;
    return ts >= Math.floor(Date.now() / 1000) - 6 * 60 * 60;
  }

  function sortSoonest(rows) {
    return [...(rows || [])].sort((a, b) => {
      const ta = Number(a?.fixture?.timestamp || 0);
      const tb = Number(b?.fixture?.timestamp || 0);
      return ta - tb;
    });
  }

  window.fetchNextFixtures = async function (teamId, count = 2) {
    const wanted = Math.max(1, Number(count) || 2);
    const attempts = [...new Set([
      Math.max(wanted, 3),
      Math.max(wanted + 2, 5),
      10,
    ])];

    for (const nextN of attempts) {
      const r = await apiGet(
        `/fixtures?team=${encodeURIComponent(teamId)}&next=${nextN}&timezone=Europe/Rome`,
        { retries: 1, delays: [750] },
      );

      if (r.ok && !r.errors && Array.isArray(r.arr) && r.arr.length) {
        const rows = sortSoonest(
          uniqueFixtures(r.arr.filter(isUsableFutureFixture)),
        );
        if (rows.length) return rows.slice(0, wanted);
      }
    }

    console.warn("fetchNextFixtures: no future fixtures found", teamId);
    return [];
  };

  window.fetchNextFixtures.__crResilientNext = true;
  console.info("Calcio Report resilient next-fixtures attivo");
}

// teamFlow viene caricato dopo panelsShared.
setTimeout(installResilientNextFixtures, 0);
