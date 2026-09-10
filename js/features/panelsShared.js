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

function dateOnlyUTC(d) {
  return d.toISOString().slice(0, 10);
}

/* =========================
   FIXTURES (last N) per team
   ========================= */
async function fetchTeamLastFixtures(teamId, limit) {
  if (!teamId) return [];

  const n = Math.max(1, Number(limit) || 10);

  // API-Football documenta team + last come pattern per i risultati recenti.
  // Non rifiltriamo lo status lato client: "last" ci deve già restituire i match recenti.
  const primary = await apiGet(
    `/fixtures?team=${teamId}&last=${n}&timezone=Europe/Rome`,
    { retries: 2, delays: [400, 900] },
  );

  let rows =
    primary.ok && !primary.errors && Array.isArray(primary.arr)
      ? uniqueFixtures(primary.arr)
      : [];

  if (rows.length) {
    return sortFixturesNewestFirst(rows).slice(0, n);
  }

  // Fallback: stessa competizione del match selezionato.
  // Serve soprattutto quando una risposta "last" vuota rimane nella cache del Worker.
  const leagueId =
    typeof selectedFixture !== "undefined" ? selectedFixture?.leagueId : null;
  const season =
    typeof selectedFixture !== "undefined" ? Number(selectedFixture?.season) : null;

  if (!leagueId || !Number.isFinite(season)) {
    console.warn("fetchTeamLastFixtures: primary empty and no league/season fallback", teamId);
    return [];
  }

  const seasonQueries = [season, season - 1];
  for (const s of seasonQueries) {
    const r = await apiGet(
      `/fixtures?league=${leagueId}&season=${s}&team=${teamId}&timezone=Europe/Rome`,
      { retries: 1, delays: [500] },
    );

    if (r.ok && !r.errors && Array.isArray(r.arr) && r.arr.length) {
      rows = rows.concat(
        r.arr.filter((fx) => {
          const ts = Number(fx?.fixture?.timestamp || 0);
          const status = String(fx?.fixture?.status?.short || "").toUpperCase();
          const finished = status === "FT" || status === "AET" || status === "PEN";
          return finished || (ts > 0 && ts < Math.floor(Date.now() / 1000));
        }),
      );
    }

    rows = sortFixturesNewestFirst(uniqueFixtures(rows));
    if (rows.length >= n) break;
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

/* =========================
   RESILIENZA NEXT FIXTURES
   ========================= */
function installResilientNextFixtures() {
  if (typeof window.fetchNextFixtures !== "function") {
    setTimeout(installResilientNextFixtures, 80);
    return;
  }
  if (window.fetchNextFixtures.__crResilientNext) return;

  const original = window.fetchNextFixtures;

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
    let primary = [];

    try {
      primary = await original.call(this, teamId, Math.max(wanted, 3));
    } catch (err) {
      console.warn("Primary next fixtures failed", teamId, err);
    }

    primary = sortSoonest(
      uniqueFixtures((primary || []).filter(isUsableFutureFixture)),
    );

    if (primary.length >= wanted) return primary.slice(0, wanted);

    const from = new Date();
    const to = new Date(from.getTime() + 180 * 24 * 60 * 60 * 1000);

    try {
      const rf = await apiGet(
        `/fixtures?team=${encodeURIComponent(teamId)}&from=${dateOnlyUTC(from)}&to=${dateOnlyUTC(to)}&timezone=Europe/Rome`,
        { retries: 1, delays: [500] },
      );

      const fallbackRows =
        rf.ok && !rf.errors && Array.isArray(rf.arr)
          ? rf.arr.filter(isUsableFutureFixture)
          : [];

      const merged = sortSoonest(uniqueFixtures([...primary, ...fallbackRows]));
      return merged.slice(0, wanted);
    } catch (err) {
      console.warn("Fallback next fixtures failed", teamId, err);
      return primary.slice(0, wanted);
    }
  };

  window.fetchNextFixtures.__crResilientNext = true;
  console.info("Calcio Report resilient next-fixtures attivo");
}

setTimeout(installResilientNextFixtures, 0);
