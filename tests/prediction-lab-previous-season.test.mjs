import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFixturesCsv } from "../prediction-lab/backtest.mjs";
import { comparePreviousSeason } from "../prediction-lab/compare-previous-season.mjs";

const targetCsv = readFileSync(
  new URL("../prediction-lab/demo-fixtures.synthetic.csv", import.meta.url),
  "utf8",
);
const previousCsv = targetCsv
  .replaceAll("2026-", "2025-")
  .replaceAll(",2026,", ",2025,");

const target = parseFixturesCsv(targetCsv);
const previous = parseFixturesCsv(previousCsv);
const report = comparePreviousSeason(target, previous, {
  previousSeasonWeight: 0.35,
});

assert.equal(report.targetFixtures, 12);
assert.equal(report.previousFixtures, 12);
assert.equal(report.previousSeasonWeight, 0.35);
assert.equal(report.first30PriorCoverage.bothTeams, 12);
assert.equal(report.first30PriorCoverage.total, 12);

for (const result of Object.values(report.samples)) {
  for (const version of ["baseline", "previousSeason"]) {
    for (const metric of [
      "accuracy",
      "logLoss",
      "brier",
      "rankedProbabilityScore",
      "calibrationError",
    ]) {
      assert.ok(Number.isFinite(result[version][metric]));
    }
  }
}

assert.notEqual(
  report.samples.first30.baseline.logLoss,
  report.samples.first30.previousSeason.logLoss,
);

const futurePrior = parseFixturesCsv(
  previousCsv.replaceAll("2025-", "2027-"),
);
const rejectedFuture = comparePreviousSeason(target, futurePrior, {
  previousSeasonWeight: 0.35,
});
assert.equal(rejectedFuture.first30PriorCoverage.bothTeams, 0);
assert.equal(
  rejectedFuture.samples.all.baseline.logLoss,
  rejectedFuture.samples.all.previousSeason.logLoss,
  "Uno storico successivo al target deve essere ignorato.",
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      previousSeasonWeight: report.previousSeasonWeight,
      first30PriorCoverage: report.first30PriorCoverage,
    },
    null,
    2,
  ),
);
