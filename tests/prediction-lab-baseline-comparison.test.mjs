import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFixturesCsv } from "../prediction-lab/backtest.mjs";
import { compareBaselines } from "../prediction-lab/compare-baselines.mjs";

const csv = readFileSync(
  new URL("../prediction-lab/demo-fixtures.synthetic.csv", import.meta.url),
  "utf8",
);
const report = compareBaselines(parseFixturesCsv(csv));

assert.deepEqual(Object.keys(report.models), [
  "uniform_1x2",
  "progressive_league_prior",
  "poisson_dc_v1",
]);
assert.equal(report.coverage.totalFixtures, 12);
assert.equal(report.coverage.guardedFixtures, 4);
assert.ok(
  Math.abs(report.models.uniform_1x2.all.logLoss - Math.log(3)) <
    1e-12,
);

for (const samples of Object.values(report.models)) {
  for (const metrics of Object.values(samples)) {
    for (const name of [
      "accuracy",
      "logLoss",
      "brier",
      "rankedProbabilityScore",
      "calibrationError",
    ]) {
      assert.ok(Number.isFinite(metrics[name]));
    }
  }
}

for (const sample of ["all", "guarded"]) {
  for (const value of Object.values(
    report.deltasVsProgressivePrior[sample],
  )) {
    assert.ok(Number.isFinite(value));
  }
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      models: Object.keys(report.models),
      totalFixtures: report.coverage.totalFixtures,
      guardedFixtures: report.coverage.guardedFixtures,
    },
    null,
    2,
  ),
);
