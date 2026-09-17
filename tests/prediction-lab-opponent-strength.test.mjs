import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseFixturesCsv,
  runBacktest,
} from "../prediction-lab/backtest.mjs";
import { runOpponentStrengthBacktest } from "../prediction-lab/lib/elo-opponent-strength.mjs";
import {
  DEFAULT_STRENGTH_GRID,
  tuneOpponentStrength,
} from "../prediction-lab/tune-opponent-strength.mjs";
import { evaluateLockedOpponentStrength } from "../prediction-lab/evaluate-locked-opponent-strength.mjs";

const targetCsv = readFileSync(
  new URL("../prediction-lab/demo-fixtures.synthetic.csv", import.meta.url),
  "utf8",
);
const previousCsv = targetCsv
  .replaceAll("2026-", "2025-")
  .replaceAll(",2026,", ",2025,");
const target = parseFixturesCsv(targetCsv);
const previous = parseFixturesCsv(previousCsv);

const baseline = runBacktest(target, {
  priorFixtures: previous,
  previousSeasonWeight: 1,
});
const coefficientZero = runOpponentStrengthBacktest(target, {
  priorFixtures: previous,
  previousSeasonWeight: 1,
  strengthCoefficient: 0,
});

assert.equal(coefficientZero.settings.sameKickoffEloBatching, true);
assert.equal(coefficientZero.settings.priorFixturesUsed, previous.length);
assert.deepEqual(
  coefficientZero.predictions.map((item) => item.prediction.probabilities),
  baseline.predictions.map((item) => item.prediction.probabilities),
  "Il coefficiente zero deve riprodurre il Poisson con memoria precedente.",
);

const adjusted = runOpponentStrengthBacktest(target, {
  priorFixtures: previous,
  previousSeasonWeight: 1,
  strengthCoefficient: 1,
});
const aVsB = adjusted.predictions[0];
assert.ok(aVsB.opponentStrength.ratingDifference > 0);
assert.ok(
  aVsB.prediction.diagnostics.eloMultiplier > 1,
);
assert.ok(
  aVsB.prediction.expectedGoals.away <
    coefficientZero.predictions[0].prediction.expectedGoals.away,
);

const changedTarget = parseFixturesCsv(
  targetCsv.replace(
    "1,2026-08-01T18:00:00Z,\"Test, League\",2026,A,B,2,0",
    "1,2026-08-01T18:00:00Z,\"Test, League\",2026,A,B,0,7",
  ),
);
const changed = runOpponentStrengthBacktest(changedTarget, {
  priorFixtures: previous,
  previousSeasonWeight: 1,
  strengthCoefficient: 1,
});
assert.deepEqual(
  changed.predictions[0].prediction.probabilities,
  adjusted.predictions[0].prediction.probabilities,
  "Il risultato non deve influenzare la propria previsione.",
);
assert.deepEqual(
  changed.predictions[1].prediction.probabilities,
  adjusted.predictions[1].prediction.probabilities,
  "Le partite allo stesso orario devono usare rating pre-turno identici.",
);

const futurePrevious = parseFixturesCsv(
  previousCsv.replaceAll("2025-", "2027-"),
);
const futureIgnored = runOpponentStrengthBacktest(target, {
  priorFixtures: futurePrevious,
  previousSeasonWeight: 1,
  strengthCoefficient: 1,
});
assert.equal(futureIgnored.settings.priorFixturesUsed, 0);
assert.equal(futureIgnored.predictions[0].opponentStrength.ratingDifference, 0);

const tuning = tuneOpponentStrength(target, previous, {
  coefficients: [0, 0.5, 1],
  previousSeasonWeight: 1,
});
assert.deepEqual(DEFAULT_STRENGTH_GRID, [
  0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1,
]);
assert.equal(tuning.selectionRule.finalTestSeasonUsed, false);
assert.ok(tuning.coefficients.includes(tuning.selectedCoefficient));
assert.equal(tuning.datasets.target.fixtures, target.length);
assert.equal(tuning.datasets.previous.fixtures, previous.length);
for (const candidate of tuning.candidates) {
  for (const sample of Object.values(candidate.metrics)) {
    for (const name of [
      "accuracy",
      "logLoss",
      "brier",
      "rankedProbabilityScore",
      "calibrationError",
      "expectedGoalsMae",
    ]) {
      assert.ok(Number.isFinite(sample[name]));
    }
  }
}

const finalCsv = targetCsv
  .replaceAll("2026-", "2027-")
  .replaceAll(",2026,", ",2027,");
const evaluation = evaluateLockedOpponentStrength(
  tuning,
  parseFixturesCsv(finalCsv),
  target,
);
assert.equal(evaluation.lockedBeforeEvaluation, true);
assert.equal(evaluation.protocol, "locked_elo_opponent_strength_v1");
assert.equal(evaluation.selectedCoefficient, tuning.selectedCoefficient);
assert.equal(evaluation.comparison.targetFixtures, target.length);
assert.throws(
  () => evaluateLockedOpponentStrength(tuning, target, target),
  /deve iniziare dopo/,
);
assert.throws(
  () =>
    evaluateLockedOpponentStrength(
      { ...tuning, selectedCoefficient: 3 },
      parseFixturesCsv(finalCsv),
      target,
    ),
  /non è valido/,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      sameKickoffEloBatching: true,
      futurePriorIgnored: true,
      candidates: tuning.candidates.length,
      selectedSyntheticCoefficient: tuning.selectedCoefficient,
      lockedEvaluation: true,
    },
    null,
    2,
  ),
);
