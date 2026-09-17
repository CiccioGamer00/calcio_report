import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  parseFixturesCsv,
  summarizePredictions,
} from "./backtest.mjs";
import { runDynamicTeamStrengthBacktest } from "./lib/dynamic-team-strength.mjs";

export const DEFAULT_LEARNING_RATES = Object.freeze([0.025, 0.05, 0.075]);
export const DEFAULT_DYNAMIC_BLENDS = Object.freeze(
  Array.from({ length: 11 }, (_, index) => index / 10),
);

function describeFixtures(fixtures) {
  if (!fixtures.length) throw new Error("Il dataset non contiene partite.");
  const ordered = [...fixtures].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
  return {
    fixtures: fixtures.length,
    leagueKeys: [...new Set(fixtures.map((fixture) => fixture.leagueKey))].sort(),
    seasons: [...new Set(fixtures.map((fixture) => fixture.season))].sort(),
    firstTimestamp: ordered[0].timestamp,
    lastTimestamp: ordered.at(-1).timestamp,
    firstDate: ordered[0].date,
    lastDate: ordered.at(-1).date,
  };
}

function sampleMetrics(predictions) {
  return {
    all: summarizePredictions(predictions),
    first30: summarizePredictions(predictions.slice(0, 30)),
    first50: summarizePredictions(predictions.slice(0, 50)),
    guarded: summarizePredictions(
      predictions.filter((item) => item.eligible),
    ),
  };
}

function metricDeltas(baseline, candidate) {
  return Object.fromEntries(
    [
      "accuracy",
      "logLoss",
      "brier",
      "rankedProbabilityScore",
      "calibrationError",
      "expectedGoalsMae",
      "exactScoreAccuracy",
    ].map((name) => [name, candidate[name] - baseline[name]]),
  );
}

function uniqueGrid(values, min, max, name) {
  const grid = [...new Set(values.map(Number))]
    .filter((value) => Number.isFinite(value) && value >= min && value <= max)
    .sort((left, right) => left - right);
  if (!grid.length) throw new Error(`Griglia ${name} non valida.`);
  return grid;
}

export function compareDynamicTeamStrength(
  targetFixtures,
  previousFixtures,
  options = {},
) {
  const shared = {
    priorFixtures: previousFixtures,
    previousSeasonWeight: Number.isFinite(options.previousSeasonWeight)
      ? options.previousSeasonWeight
      : 1,
    learningRate: options.learningRate,
    seasonCarry: options.seasonCarry,
    ratingShrinkage: options.ratingShrinkage,
    residualCap: options.residualCap,
    maxLogStrength: options.maxLogStrength,
  };
  const baseline = runDynamicTeamStrengthBacktest(targetFixtures, {
    ...shared,
    blend: 0,
  });
  const candidate = runDynamicTeamStrengthBacktest(targetFixtures, {
    ...shared,
    blend: options.blend,
  });
  const baselineSamples = sampleMetrics(baseline.predictions);
  const candidateSamples = sampleMetrics(candidate.predictions);
  const samples = {};
  for (const name of Object.keys(baselineSamples)) {
    samples[name] = {
      baseline: baselineSamples[name],
      dynamicStrength: candidateSamples[name],
      delta: metricDeltas(baselineSamples[name], candidateSamples[name]),
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    targetFixtures: targetFixtures.length,
    previousFixtures: previousFixtures.length,
    settings: candidate.settings,
    samples,
  };
}

export function tuneDynamicTeamStrength(
  targetFixtures,
  previousFixtures,
  options = {},
) {
  const learningRates = uniqueGrid(
    options.learningRates ?? DEFAULT_LEARNING_RATES,
    0.001,
    0.25,
    "learning-rate",
  );
  const blends = uniqueGrid(
    options.blends ?? DEFAULT_DYNAMIC_BLENDS,
    0,
    1,
    "blend",
  );
  if (!blends.includes(0)) blends.unshift(0);
  if (blends.length < 2) {
    throw new Error("Servono blend zero e almeno un candidato positivo.");
  }
  const previousSeasonWeight = Number.isFinite(options.previousSeasonWeight)
    ? options.previousSeasonWeight
    : 1;
  const shared = {
    priorFixtures: previousFixtures,
    previousSeasonWeight,
    seasonCarry: options.seasonCarry,
    ratingShrinkage: options.ratingShrinkage,
    residualCap: options.residualCap,
    maxLogStrength: options.maxLogStrength,
  };
  const candidates = [];
  const baselineReport = runDynamicTeamStrengthBacktest(targetFixtures, {
    ...shared,
    learningRate: learningRates[0],
    blend: 0,
  });
  candidates.push({
    learningRate: null,
    blend: 0,
    settings: baselineReport.settings,
    metrics: sampleMetrics(baselineReport.predictions),
  });
  for (const learningRate of learningRates) {
    for (const blend of blends.filter((value) => value > 0)) {
      const report = runDynamicTeamStrengthBacktest(targetFixtures, {
        ...shared,
        learningRate,
        blend,
      });
      candidates.push({
        learningRate,
        blend,
        settings: report.settings,
        metrics: sampleMetrics(report.predictions),
      });
    }
  }

  const baseline = candidates[0];
  const tolerance = 1e-12;
  const admissible = candidates.filter(
    (candidate) =>
      candidate.metrics.all.logLoss <=
        baseline.metrics.all.logLoss + tolerance &&
      candidate.metrics.first50.logLoss <=
        baseline.metrics.first50.logLoss + tolerance,
  );
  const selected = [...(admissible.length ? admissible : [baseline])].sort(
    (left, right) =>
      left.metrics.all.logLoss - right.metrics.all.logLoss ||
      left.metrics.all.rankedProbabilityScore -
        right.metrics.all.rankedProbabilityScore ||
      left.metrics.all.brier - right.metrics.all.brier ||
      left.blend - right.blend ||
      (left.learningRate ?? 0) - (right.learningRate ?? 0),
  )[0];

  return {
    generatedAt: new Date().toISOString(),
    protocol: "dynamic_team_strength_tuning_v3",
    datasets: {
      target: describeFixtures(targetFixtures),
      previous: describeFixtures(previousFixtures),
    },
    fixedSettings: {
      previousSeasonWeight,
      seasonCarry: selected.settings.seasonCarry,
      ratingShrinkage: selected.settings.ratingShrinkage,
      residualCap: selected.settings.residualCap,
      maxLogStrength: selected.settings.maxLogStrength,
    },
    selectionRule: {
      primary: "minimum full-season log loss",
      guard:
        "first-50 and full-season log loss must not exceed blend-0 baseline",
      tieBreakers: [
        "full-season RPS",
        "full-season Brier",
        "lower blend",
        "lower learning rate",
      ],
      finalTestSeasonUsed: false,
    },
    learningRates,
    blends,
    selectedLearningRate: selected.learningRate,
    selectedBlend: selected.blend,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      admissible: admissible.includes(candidate),
      deltaVsZero: {
        allLogLoss:
          candidate.metrics.all.logLoss - baseline.metrics.all.logLoss,
        first50LogLoss:
          candidate.metrics.first50.logLoss -
          baseline.metrics.first50.logLoss,
        allBrier: candidate.metrics.all.brier - baseline.metrics.all.brier,
        allRps:
          candidate.metrics.all.rankedProbabilityScore -
          baseline.metrics.all.rankedProbabilityScore,
        allCalibration:
          candidate.metrics.all.calibrationError -
          baseline.metrics.all.calibrationError,
      },
    })),
  };
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function decimal(value) {
  return value.toFixed(4);
}

function signed(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
}

function printReport(report) {
  console.log("Prediction Lab — forza dinamica attacco/difesa");
  console.log(
    `Target sviluppo: ${report.datasets.target.fixtures} | storico: ${report.datasets.previous.fixtures} | peso stagione precedente: ${report.fixedSettings.previousSeasonWeight}`,
  );
  console.log(
    "LR      Blend Ammesso   Acc.all   LL.all   LL.prime50   Brier.all   RPS.all   Calib.all",
  );
  for (const candidate of report.candidates) {
    const learningRate = candidate.learningRate == null
      ? "base"
      : candidate.learningRate.toFixed(3);
    console.log(
      `${learningRate.padStart(5)}   ${candidate.blend.toFixed(2).padStart(5)}  ${String(candidate.admissible ? "sì" : "no").padEnd(8)} ${percent(candidate.metrics.all.accuracy).padStart(8)}  ${decimal(candidate.metrics.all.logLoss).padStart(7)}    ${decimal(candidate.metrics.first50.logLoss).padStart(7)}      ${decimal(candidate.metrics.all.brier).padStart(7)}   ${decimal(candidate.metrics.all.rankedProbabilityScore).padStart(7)}    ${decimal(candidate.metrics.all.calibrationError).padStart(7)}`,
    );
  }
  const selected = report.candidates.find(
    (candidate) =>
      candidate.learningRate === report.selectedLearningRate &&
      candidate.blend === report.selectedBlend,
  );
  console.log(
    `\nSelezione: learning-rate ${report.selectedLearningRate ?? "baseline"}, blend ${report.selectedBlend.toFixed(2)}`,
  );
  console.log(
    `Delta vs zero — LogLoss intera ${signed(selected.deltaVsZero.allLogLoss)}, prime50 ${signed(selected.deltaVsZero.first50LogLoss)}, Brier ${signed(selected.deltaVsZero.allBrier)}, RPS ${signed(selected.deltaVsZero.allRps)}, calibrazione ${signed(selected.deltaVsZero.allCalibration)}`,
  );
  console.log("La stagione finale non viene letta da questo comando.");
}

function parseGrid(argument, prefix, fallback) {
  if (!argument) return fallback;
  const values = argument
    .slice(prefix.length)
    .split(",")
    .map((value) => Number(value.trim()));
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Valori non validi per ${prefix}`);
  }
  return values;
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args.filter((argument) => !argument.startsWith("--"));
  const targetPath = paths[0];
  const previousPath = paths[1];
  const jsonArgument = args.find((argument) => argument.startsWith("--json="));
  const weightArgument = args.find((argument) =>
    argument.startsWith("--previous-weight="),
  );
  const ratesArgument = args.find((argument) =>
    argument.startsWith("--learning-rates="),
  );
  const blendsArgument = args.find((argument) =>
    argument.startsWith("--blends="),
  );
  if (!targetPath || !previousPath) {
    console.error(
      "Uso: node prediction-lab/tune-team-strength.mjs <target.csv> <precedente.csv> [--previous-weight=1] [--json=report.json]",
    );
    process.exitCode = 1;
    return;
  }
  const previousSeasonWeight = weightArgument
    ? Number(weightArgument.slice("--previous-weight=".length))
    : 1;
  if (
    !Number.isFinite(previousSeasonWeight) ||
    previousSeasonWeight < 0 ||
    previousSeasonWeight > 1
  ) {
    throw new Error("Il peso della stagione precedente deve essere tra 0 e 1.");
  }
  const report = tuneDynamicTeamStrength(
    parseFixturesCsv(readFileSync(targetPath, "utf8")),
    parseFixturesCsv(readFileSync(previousPath, "utf8")),
    {
      previousSeasonWeight,
      learningRates: parseGrid(
        ratesArgument,
        "--learning-rates=",
        DEFAULT_LEARNING_RATES,
      ),
      blends: parseGrid(
        blendsArgument,
        "--blends=",
        DEFAULT_DYNAMIC_BLENDS,
      ),
    },
  );
  printReport(report);
  if (jsonArgument) {
    const outputPath = jsonArgument.slice("--json=".length);
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nReport salvato in ${outputPath}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
