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
function isFinishedFixtureRow(fx) {
  const st = String(fx?.fixture?.status?.short || "").toUpperCase();
  return st === "FT" || st === "AET" || st === "PEN";
}

function sortFixturesNewestFirst(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ta = Number(a?.fixture?.timestamp || 0);
    const tb = Number(b?.fixture?.timestamp || 0);
    return tb - ta;
  });
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

function dateOnlyUTC(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchTeamLastFixtures(teamId, limit) {
  if (!teamId) return [];

  const n = Math.max(1, Number(limit) || 10);

  // Pattern ufficiale API-Football: team + last.
  // Filtriamo noi i risultati realmente conclusi per evitare combinazioni fragili
  // tipo last=N&status=FT che possono restituire vuoti anomali.
  const r = await apiGet(
    `/fixtures?team=${teamId}&last=${Math.max(n, 5)}&timezone=Europe/Rome`,
    { retries: 2, delays: [400, 900] },
  );

  let rows =
    r.ok && !r.errors && Array.isArray(r.arr)
      ? r.arr.filter(isFinishedFixtureRow)
      : [];

  rows = sortFixturesNewestFirst(uniqueFixtures(rows));
  if (rows.length >= n) return rows.slice(0, n);

  // Fallback robusto: se "last" arriva vuoto/incompleto, recupera un intervallo
  // storico e filtra lato frontend. Query diversa = non rimaniamo bloccati da
  // un eventuale risultato vuoto in cache sulla query "last".
  const to = new Date();
  const from = new Date(to.getTime() - 370 * 24 * 60 * 60 * 1000);

  const rf = await apiGet(
    `/fixtures?team=${teamId}&from=${dateOnlyUTC(from)}&to=${dateOnlyUTC(to)}&timezone=Europe/Rome`,
    { retries: 1, delays: [500] },
  );

  const fallbackRows =
    rf.ok && !rf.errors && Array.isArray(rf.arr)
      ? rf.arr.filter(isFinishedFixtureRow)
      : [];

  rows = sortFixturesNewestFirst(uniqueFixtures([...rows, ...fallbackRows]));
  return rows.slice(0, n);
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

    // Se next=N torna vuoto o incompleto, usiamo una query diversa e quindi
    // anche una cache-key diversa sul Worker.
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

// teamFlow viene caricato dopo questo file: differiamo l'aggancio.
setTimeout(installResilientNextFixtures, 0);
