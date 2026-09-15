import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFixturesCsv } from "../prediction-lab/backtest.mjs";
import {
  DEFAULT_WEIGHT_GRID,
  tunePreviousSeasonWeight,
} from "../prediction-lab/tune-previous-season-weight.mjs";

const targetCsv = readFileSync(
  new URL("../prediction-lab/demo-fixtures.synthetic.csv", import.meta.url),
  "utf8",
);
const previousCsv = targetCsv
  .replaceAll("2026-", "2025-")
  .replaceAll(",2026,", ",2025,");

const target = parseFixturesCsv(targetCsv);
const previous = parseFixturesCsv(previousCsv);
const report = tunePreviousSeasonWeight(target, previous);

assert.equal(DEFAULT_WEIGHT_GRID.length, 21);
assert.equal(DEFAULT_WEIGHT_GRID[0], 0);
assert.equal(DEFAULT_WEIGHT_GRID.at(-1), 1);
assert.ok(DEFAULT_WEIGHT_GRID.includes(0.35));
assert.equal(report.candidates.length, 21);
assert.equal(report.selectionRule.finalTestSeasonUsed, false);
assert.equal(report.datasets.target.fixtures, target.length);
assert.equal(report.datasets.previous.fixtures, previous.length);
assert.deepEqual(report.datasets.target.seasons, ["2026"]);
assert.deepEqual(report.datasets.previous.seasons, ["2025"]);
assert.ok(
  report.datasets.previous.lastTimestamp <
    report.datasets.target.firstTimestamp,
);
assert.ok(report.weights.includes(report.selectedWeight));
assert.equal(
  report.candidates.find((candidate) => candidate.weight === 0)
    .admissible,
  true,
);

for (const candidate of report.candidates) {
  for (const sample of Object.values(candidate.metrics)) {
    for (const metric of [
      "accuracy",
      "logLoss",
      "brier",
      "rankedProbabilityScore",
      "calibrationError",
      "expectedGoalsMae",
    ]) {
      assert.ok(Number.isFinite(sample[metric]));
    }
  }
}

const futurePrior = parseFixturesCsv(
  previousCsv.replaceAll("2025-", "2027-"),
);
const futureReport = tunePreviousSeasonWeight(target, futurePrior);
assert.equal(
  futureReport.selectedWeight,
  0,
  "Se tutto lo storico è futuro, ogni peso è equivalente e deve vincere zero.",
);
for (const candidate of futureReport.candidates) {
  assert.equal(candidate.deltaVsZero.allLogLoss, 0);
  assert.equal(candidate.deltaVsZero.first50LogLoss, 0);
}

const custom = tunePreviousSeasonWeight(target, previous, {
  weights: [0.35],
});
assert.deepEqual(custom.weights, [0, 0.35]);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      candidates: report.candidates.length,
      selectedSyntheticWeight: report.selectedWeight,
      futurePriorSelectedWeight: futureReport.selectedWeight,
      finalTestSeasonUsed: report.selectionRule.finalTestSeasonUsed,
    },
    null,
    2,
  ),
);
