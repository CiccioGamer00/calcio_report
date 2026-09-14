import assert from "node:assert/strict";
import {
  apiFootballFixturesToRows,
  fixturesRowsToCsv,
} from "../prediction-lab/lib/api-football-fixtures.mjs";

const payload = {
  errors: [],
  response: [
    {
      fixture: {
        id: 102,
        date: "2026-08-02T18:00:00+00:00",
        status: { short: "NS" },
      },
      league: { id: 135, name: "Serie A", season: 2026 },
      teams: {
        home: { id: 1, name: "Alpha" },
        away: { id: 2, name: "Beta" },
      },
      goals: { home: null, away: null },
    },
    {
      fixture: {
        id: 101,
        date: "2026-08-01T18:00:00+00:00",
        status: { short: "FT" },
      },
      league: { id: 135, name: 'Serie "A", Italia', season: 2026 },
      teams: {
        home: { id: 1, name: "Alpha" },
        away: { id: 2, name: "Beta" },
      },
      goals: { home: 2, away: 1 },
    },
  ],
};

const rows = apiFootballFixturesToRows(payload);
assert.equal(rows.length, 1);
assert.equal(rows[0].fixture_id, 101);
assert.equal(rows[0].date, "2026-08-01T18:00:00.000Z");
assert.equal(rows[0].home_goals, 2);
assert.equal(rows[0].away_goals, 1);

const csv = fixturesRowsToCsv(rows);
assert.match(
  csv,
  /"Serie ""A"", Italia"/,
  "Virgolette e virgole devono essere codificate correttamente.",
);
assert.match(csv, /^fixture_id,date,league_id,league,season,/);

assert.throws(
  () => apiFootballFixturesToRows({ errors: { rateLimit: "limit" }, response: [] }),
  /API-Football/,
);
assert.throws(
  () => apiFootballFixturesToRows({ errors: [], response: [] }),
  /Nessuna partita/,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      convertedFixtures: rows.length,
      futureFixturesExcluded: 1,
    },
    null,
    2,
  ),
);
