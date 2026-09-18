import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseFixturesCsv,
  runBacktest,
} from "../prediction-lab/backtest.mjs";
import { runDynamicTeamStrengthBacktest } from "../prediction-lab/lib/dynamic-team-strength.mjs";
import {
  DEFAULT_DYNAMIC_BLENDS,
  DEFAULT_LEARNING_RATES,
  tuneDynamicTeamStrength,
} from "../prediction-lab/tune-team-strength.mjs";
import { evaluateLockedDynamicTeamStrength } from "../prediction-lab/evaluate-locked-team-strength.mjs";

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
const zeroBlend = runDynamicTeamStrengthBacktest(target, {
  priorFixtures: previous,
  previousSeasonWeight: 1,
  learningRate: 0.05,
  blend: 0,
});
assert.equal(zeroBlend.settings.sameKickoffBatching, true);
assert.equal(zeroBlend.settings.priorFixturesUsed, previous.length);
assert.deepEqual(
  zeroBlend.predictions.map((item) => item.prediction.probabilities),
  baseline.predictions.map((item) => item.prediction.probabilities),
  "Blend zero deve riprodurre il modello attuale.",
);

const dynamic = runDynamicTeamStrengthBacktest(target, {
  priorFixtures: previous,
  previousSeasonWeight: 1,
  learningRate: 0.075,
  blend: 1,
});
assert.equal(dynamic.settings.adjustmentTarget, "latent_attack_and_defence");
assert.ok(
  dynamic.predictions.some(
    (item, index) =>
      item.prediction.expectedGoals.home !==
        zeroBlend.predictions[index].prediction.expectedGoals.home ||
      item.prediction.expectedGoals.away !==
        zeroBlend.predictions[index].prediction.expectedGoals.away,
  ),
  "Le forze dinamiche devono modificare almeno una previsione.",
);
assert.ok(
  dynamic.predictions.some((item) =>
    Object.values(item.prediction.diagnostics.dynamicStrengths).some(
      (value) => Math.abs(value) > 1e-9,
    ),
  ),
  "Lo storico deve produrre rating attacco/difesa non neutrali.",
);

const reversedInput = runDynamicTeamStrengthBacktest(
  [...target].reverse(),
  {
    priorFixtures: [...previous].reverse(),
    previousSeasonWeight: 1,
    learningRate: 0.075,
    blend: 1,
  },
);
assert.deepEqual(
  reversedInput.predictions.map((item) => ({
    id: item.fixture.id,
    probabilities: item.prediction.probabilities,
  })),
  dynamic.predictions.map((item) => ({
    id: item.fixture.id,
    probabilities: item.prediction.probabilities,
  })),
  "L'ordine delle righe CSV non deve modificare il backtest cronologico.",
);

const extremeSettings = runDynamicTeamStrengthBacktest(target, {
  priorFixtures: previous,
  previousSeasonWeight: 1,
  learningRate: 0.25,
  blend: 1,
  maxLogStrength: 2,
});
for (const item of extremeSettings.predictions) {
  const probabilities = Object.values(item.prediction.probabilities);
  assert.ok(probabilities.every((value) => Number.isFinite(value) && value >= 0));
  assert.ok(Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(item.prediction.expectedGoals.home >= 0.2);
  assert.ok(item.prediction.expectedGoals.home <= 3.2);
  assert.ok(item.prediction.expectedGoals.away >= 0.2);
  assert.ok(item.prediction.expectedGoals.away <= 3.2);
}

const changedTarget = parseFixturesCsv(
  targetCsv.replace(
    "1,2026-08-01T18:00:00Z,\"Test, League\",2026,A,B,2,0",
    "1,2026-08-01T18:00:00Z,\"Test, League\",2026,A,B,0,7",
  ),
);
const changed = runDynamicTeamStrengthBacktest(changedTarget, {
  priorFixtures: previous,
  previousSeasonWeight: 1,
  learningRate: 0.075,
  blend: 1,
});
assert.deepEqual(
  changed.predictions[0].prediction.probabilities,
  dynamic.predictions[0].prediction.probabilities,
  "Il risultato non deve influenzare la propria previsione.",
);
assert.deepEqual(
  changed.predictions[1].prediction.probabilities,
  dynamic.predictions[1].prediction.probabilities,
  "Le partite contemporanee devono essere isolate.",
);

const futurePrevious = parseFixturesCsv(
  previousCsv.replaceAll("2025-", "2027-"),
);
const futureIgnored = runDynamicTeamStrengthBacktest(target, {
  priorFixtures: futurePrevious,
  previousSeasonWeight: 1,
  learningRate: 0.075,
  blend: 1,
});
assert.equal(futureIgnored.settings.priorFixturesUsed, 0);
assert.deepEqual(
  futureIgnored.predictions[0].prediction.diagnostics.dynamicStrengths,
  {
    homeAttack: 0,
    homeDefence: 0,
    awayAttack: 0,
    awayDefence: 0,
  },
);

const tuning = tuneDynamicTeamStrength(target, previous, {
  learningRates: [0.025, 0.075],
  blends: [0, 0.5, 1],
  previousSeasonWeight: 1,
});
assert.deepEqual(DEFAULT_LEARNING_RATES, [0.025, 0.05, 0.075]);
assert.equal(DEFAULT_DYNAMIC_BLENDS.length, 11);
assert.equal(tuning.selectionRule.finalTestSeasonUsed, false);
assert.ok(tuning.blends.includes(tuning.selectedBlend));
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
  const shouldBeAdmissible =
    candidate.metrics.all.logLoss <=
      tuning.candidates[0].metrics.all.logLoss + 1e-12 &&
    candidate.metrics.first50.logLoss <=
      tuning.candidates[0].metrics.first50.logLoss + 1e-12;
  assert.equal(candidate.admissible, shouldBeAdmissible);
}

const finalCsv = targetCsv
  .replaceAll("2026-", "2027-")
  .replaceAll(",2026,", ",2027,");
const evaluation = evaluateLockedDynamicTeamStrength(
  tuning,
  parseFixturesCsv(finalCsv),
  target,
);
assert.equal(evaluation.lockedBeforeEvaluation, true);
assert.equal(evaluation.protocol, "locked_dynamic_team_strength_v3");
assert.equal(evaluation.selectedBlend, tuning.selectedBlend);
assert.equal(evaluation.comparison.targetFixtures, target.length);
assert.throws(
  () => evaluateLockedDynamicTeamStrength(tuning, target, target),
  /deve iniziare dopo/,
);
assert.throws(
  () =>
    evaluateLockedDynamicTeamStrength(
      { ...tuning, selectedBlend: 2 },
      parseFixturesCsv(finalCsv),
      target,
    ),
  /non è valido/,
);
assert.throws(
  () =>
    evaluateLockedDynamicTeamStrength(
      { ...tuning, protocol: "schedule_strength_tuning_v2" },
      parseFixturesCsv(finalCsv),
      target,
    ),
  /mancante o non valido/,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      zeroBlendMatchesBaseline: true,
      dynamicAttackDefence: true,
      sameKickoffIsolation: true,
      rowOrderInvariant: true,
      extremeSettingsStable: true,
      futurePriorIgnored: true,
      staleReportRejected: true,
      candidates: tuning.candidates.length,
      selectedSyntheticBlend: tuning.selectedBlend,
      lockedEvaluation: true,
    },
    null,
    2,
  ),
);
