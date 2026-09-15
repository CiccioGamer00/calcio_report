import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFixturesCsv } from "../prediction-lab/backtest.mjs";
import { tunePreviousSeasonWeight } from "../prediction-lab/tune-previous-season-weight.mjs";
import { evaluateLockedWeight } from "../prediction-lab/evaluate-locked-weight.mjs";

const finalCsv = readFileSync(
  new URL("../prediction-lab/demo-fixtures.synthetic.csv", import.meta.url),
  "utf8",
);
const developmentCsv = finalCsv
  .replaceAll("2026-", "2025-")
  .replaceAll(",2026,", ",2025,");
const priorCsv = finalCsv
  .replaceAll("2026-", "2024-")
  .replaceAll(",2026,", ",2024,");

const finalFixtures = parseFixturesCsv(finalCsv);
const developmentFixtures = parseFixturesCsv(developmentCsv);
const priorFixtures = parseFixturesCsv(priorCsv);

const tuning = tunePreviousSeasonWeight(
  developmentFixtures,
  priorFixtures,
  { weights: [0, 0.35, 0.7] },
);
const evaluation = evaluateLockedWeight(
  tuning,
  finalFixtures,
  developmentFixtures,
);

assert.equal(evaluation.lockedBeforeEvaluation, true);
assert.equal(evaluation.protocol, "locked_previous_season_weight_v1");
assert.equal(evaluation.selectedWeight, tuning.selectedWeight);
assert.equal(
  evaluation.comparison.previousSeasonWeight,
  tuning.selectedWeight,
);
assert.deepEqual(
  evaluation.datasets.testPrevious.seasons,
  tuning.datasets.target.seasons,
);
assert.ok(
  evaluation.datasets.testTarget.firstTimestamp >
    tuning.datasets.target.lastTimestamp,
);
assert.equal(evaluation.comparison.targetFixtures, finalFixtures.length);

assert.throws(
  () =>
    evaluateLockedWeight(
      tuning,
      developmentFixtures,
      developmentFixtures,
    ),
  /deve iniziare dopo/,
);

assert.throws(
  () =>
    evaluateLockedWeight(
      tuning,
      finalFixtures,
      developmentFixtures.slice(1),
    ),
  /non coincide/,
);

assert.throws(
  () =>
    evaluateLockedWeight(
      { ...tuning, selectedWeight: 1.2 },
      finalFixtures,
      developmentFixtures,
    ),
  /peso selezionato valido/,
);

assert.throws(
  () =>
    evaluateLockedWeight(
      {
        ...tuning,
        selectionRule: {
          ...tuning.selectionRule,
          finalTestSeasonUsed: true,
        },
      },
      finalFixtures,
      developmentFixtures,
    ),
  /rimasta fuori dalla taratura/,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      selectedSyntheticWeight: tuning.selectedWeight,
      lockedWeight: evaluation.selectedWeight,
      lockedBeforeEvaluation: evaluation.lockedBeforeEvaluation,
      chronologyGuard: true,
      datasetIdentityGuard: true,
    },
    null,
    2,
  ),
);
