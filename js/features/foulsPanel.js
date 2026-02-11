// js/features/foulsPanel.js
// FALLI (ultime X) -> pubblica dati in Indicators

function normalizeFouls(statArray) {
  const lower = (s) => String(s || "").toLowerCase();
  const map = new Map();
  for (const s of statArray || []) map.set(lower(s?.type), s?.value);

  const get = (a, b, c) => {
    for (const k of [a, b, c].filter(Boolean).map(lower)) {
      const n = Number(map.get(k));
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };

  return {
    fouls: get("Fouls", "Fouls Committed", "Fouls committed"),
  };
}

async function getFoulsForFixtureTeams(fixtureId, homeId, awayId) {
  const out = new Map();
  out.set(homeId, { fouls: 0 });
  out.set(awayId, { fouls: 0 });

  const r = await apiGet(`/fixtures/statistics?fixture=${fixtureId}`);
  if (!r.ok || r.errors || !Array.isArray(r.arr) || r.arr.length === 0) return out;

  for (const row of r.arr) {
    const teamId = row?.team?.id ?? null;
    if (!teamId) continue;
    if (teamId !== homeId && teamId !== awayId) continue;

    const stats = normalizeFouls(row?.statistics || []);
    out.set(teamId, stats);
  }

  return out;
}

async function buildTeamFouls(team, limit) {
  const fixtures = await fetchTeamLastFixtures(team.id, limit);
  if (fixtures.length === 0) {
    return { team, limit: 0, avgFoulsFor: "0.00", avgFoulsAgainst: "0.00" };
  }

  let sumFor = 0;
  let sumAg = 0;
  let n = 0;

  for (const f of fixtures) {
    const fixtureId = f.fixture?.id ?? null;
    const homeId = f.teams?.home?.id ?? null;
    const awayId = f.teams?.away?.id ?? null;
    if (!fixtureId || !homeId || !awayId) continue;

    const map = await getFoulsForFixtureTeams(fixtureId, homeId, awayId);

    const mine = map.get(team.id) || { fouls: 0 };
    const oppId = team.id === homeId ? awayId : homeId;
    const opp = map.get(oppId) || { fouls: 0 };

    sumFor += Number(mine.fouls) || 0;
    sumAg += Number(opp.fouls) || 0;
    n++;
  }

  if (n === 0) return { team, limit: 0, avgFoulsFor: "0.00", avgFoulsAgainst: "0.00" };

  return {
    team,
    limit: n,
    avgFoulsFor: (sumFor / n).toFixed(2),
    avgFoulsAgainst: (sumAg / n).toFixed(2),
  };
}

async function loadTeamsFouls() {
  if (!selectedFixture?.home?.id || !selectedFixture?.away?.id) return;

  const limit = getLimitForTeams();

  const [homeF, awayF] = await Promise.all([
    buildTeamFouls(selectedFixture.home, limit),
    buildTeamFouls(selectedFixture.away, limit),
  ]);

  try {
    if (window.publishIndicatorData) {
      window.publishIndicatorData("fouls", {
        home: {
          avgFoulsFor: Number(homeF.avgFoulsFor),
          avgFoulsAgainst: Number(homeF.avgFoulsAgainst),
        },
        away: {
          avgFoulsFor: Number(awayF.avgFoulsFor),
          avgFoulsAgainst: Number(awayF.avgFoulsAgainst),
        },
      });
    }
  } catch (e) {
    console.error("publish indicators fouls", e);
  }
}
