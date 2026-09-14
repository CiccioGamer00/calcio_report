import assert from "node:assert/strict";
import {
  parseFixturesCsv,
  runBacktest,
} from "../prediction-lab/backtest.mjs";

const historicalCsv = `fixture_id,date,league,season,home_team,away_team,home_goals,away_goals
1,2026-08-01T18:00:00Z,"Test, League",2026,A,B,2,0
2,2026-08-01T18:00:00Z,"Test, League",2026,C,D,1,1
3,2026-08-08T18:00:00Z,"Test, League",2026,B,C,0,1
4,2026-08-08T18:00:00Z,"Test, League",2026,D,A,1,3
5,2026-08-15T18:00:00Z,"Test, League",2026,A,C,2,1
6,2026-08-15T18:00:00Z,"Test, League",2026,B,D,1,0
7,2026-08-22T18:00:00Z,"Test, League",2026,C,A,0,0
8,2026-08-22T18:00:00Z,"Test, League",2026,D,B,2,2
9,2026-08-29T18:00:00Z,"Test, League",2026,A,D,1,0
10,2026-08-29T18:00:00Z,"Test, League",2026,C,B,2,0
11,2026-09-05T18:00:00Z,"Test, League",2026,B,A,1,1
12,2026-09-05T18:00:00Z,"Test, League",2026,D,C,0,2
`;

const fixtures = parseFixturesCsv(historicalCsv);
assert.equal(fixtures.length, 12);
assert.equal(fixtures[0].league, "Test, League");

const report = runBacktest(fixtures);
assert.equal(report.coverage.totalFixtures, 12);
assert.equal(report.coverage.guardedFixtures, 4);
assert.equal(report.settings.sameKickoffBatching, true);

for (const item of report.predictions) {
  const total = Object.values(item.prediction.probabilities).reduce(
    (sum, probability) => sum + probability,
    0,
  );
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.ok(Number.isFinite(item.prediction.expectedGoals.home));
  assert.ok(Number.isFinite(item.prediction.expectedGoals.away));
}

const firstKickoff = report.predictions.filter(
  (item) =>
    item.fixture.timestamp === report.predictions[0].fixture.timestamp,
);
assert.equal(firstKickoff.length, 2);
for (const item of firstKickoff) {
  assert.equal(item.features.coverage.priorLeagueMatches, 0);
  assert.equal(item.prediction.expectedGoals.home, 0.2);
  assert.equal(item.prediction.expectedGoals.away, 0.2);
  assert.equal(item.prediction.confidence.score, 100);
  assert.equal(item.prediction.topScorelines[0].score, "0-0");
}

const changedFutureCsv = historicalCsv.replace(
  "12,2026-09-05T18:00:00Z,\"Test, League\",2026,D,C,0,2",
  "12,2026-09-05T18:00:00Z,\"Test, League\",2026,D,C,7,6",
);
const changedReport = runBacktest(parseFixturesCsv(changedFutureCsv));

for (let index = 0; index < report.predictions.length; index += 1) {
  assert.deepEqual(
    changedReport.predictions[index].prediction.probabilities,
    report.predictions[index].prediction.probabilities,
    "Il risultato della partita non deve influenzare la propria previsione o quelle precedenti.",
  );
}

assert.throws(
  () =>
    parseFixturesCsv(
      historicalCsv +
        '1,2026-08-01T18:00:00Z,"Test, League",2026,A,B,2,0\n',
    ),
  /duplicata/,
);

assert.ok(Number.isFinite(report.legacy.logLoss));
assert.ok(Number.isFinite(report.legacy.brier));
assert.ok(Number.isFinite(report.legacy.rankedProbabilityScore));
assert.ok(Number.isFinite(report.legacy.calibrationError));
assert.ok(Number.isFinite(report.guarded.logLoss));

console.log(
  JSON.stringify(
    {
      status: "PASS",
      assertions: 74,
      totalFixtures: report.coverage.totalFixtures,
      guardedFixtures: report.coverage.guardedFixtures,
      legacy: report.legacy,
      guarded: report.guarded,
    },
    null,
    2,
  ),
);
