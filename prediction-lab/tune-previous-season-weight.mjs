import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  parseFixturesCsv,
  runBacktest,
  summarizePredictions,
} from "./backtest.mjs";

export const DEFAULT_WEIGHT_GRID = Object.freeze(
  Array.from({ length: 21 }, (_, index) => index / 20),
);

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

function finiteMetrics(metrics) {
  return [
    metrics.accuracy,
    metrics.logLoss,
    metrics.brier,
    metrics.rankedProbabilityScore,
    metrics.calibrationError,
    metrics.expectedGoalsMae,
  ].every(Number.isFinite);
}

export function tunePreviousSeasonWeight(
  targetFixtures,
  previousFixtures,
  options = {},
) {
  const requestedWeights =
    Array.isArray(options.weights) && options.weights.length
      ? options.weights
      : DEFAULT_WEIGHT_GRID;
  const weights = [...new Set(requestedWeights.map(Number))]
    .filter((weight) => Number.isFinite(weight) && weight >= 0 && weight <= 1)
    .sort((left, right) => left - right);

  if (!weights.includes(0)) weights.unshift(0);
  if (weights.length < 2)
    throw new Error("Servono almeno il peso zero e un peso candidato.");

  const candidates = weights.map((weight) => {
    const report = runBacktest(targetFixtures, {
      priorFixtures: previousFixtures,
      previousSeasonWeight: weight,
    });
    const metrics = sampleMetrics(report.predictions);
    for (const sample of Object.values(metrics)) {
      if (!finiteMetrics(sample))
        throw new Error(
          `Metriche non valide per il peso ${weight}.`,
        );
    }
    return {
      weight,
      coverage: report.coverage,
      metrics,
    };
  });

  const baseline = candidates.find((candidate) => candidate.weight === 0);
  const tolerance = 1e-12;
  const admissible = candidates.filter(
    (candidate) =>
      candidate.metrics.all.logLoss <=
        baseline.metrics.all.logLoss + tolerance &&
      candidate.metrics.first50.logLoss <=
        baseline.metrics.first50.logLoss + tolerance,
  );

  const rankingPool = admissible.length ? admissible : [baseline];
  const selected = [...rankingPool].sort(
    (left, right) =>
      left.metrics.all.logLoss - right.metrics.all.logLoss ||
      left.metrics.all.rankedProbabilityScore -
        right.metrics.all.rankedProbabilityScore ||
      left.metrics.all.brier - right.metrics.all.brier ||
      left.weight - right.weight,
  )[0];

  return {
    generatedAt: new Date().toISOString(),
    targetFixtures: targetFixtures.length,
    previousFixtures: previousFixtures.length,
    selectionRule: {
      primary: "minimum full-season log loss",
      guard:
        "first-50 and full-season log loss must not exceed weight-0 baseline",
      tieBreakers: ["full-season RPS", "full-season Brier", "lower weight"],
      finalTestSeasonUsed: false,
    },
    weights,
    baselineWeight: 0,
    selectedWeight: selected.weight,
    selectedMetrics: selected.metrics,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      admissible: admissible.includes(candidate),
      deltaVsZero: {
        allLogLoss:
          candidate.metrics.all.logLoss -
          baseline.metrics.all.logLoss,
        first50LogLoss:
          candidate.metrics.first50.logLoss -
          baseline.metrics.first50.logLoss,
        allBrier:
          candidate.metrics.all.brier - baseline.metrics.all.brier,
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

function number(value) {
  return value.toFixed(4);
}

function signed(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
}

function printReport(report) {
  console.log("Prediction Lab — selezione peso stagione precedente");
  console.log(
    `Target sviluppo: ${report.targetFixtures} | storico: ${report.previousFixtures}`,
  );
  console.log(
    "Peso   Ammesso   Acc.all   LL.all   LL.prime50   Brier.all   RPS.all   Calib.all",
  );

  for (const candidate of report.candidates) {
    console.log(
      `${candidate.weight.toFixed(2).padStart(4)}    ${String(candidate.admissible ? "sì" : "no").padEnd(7)} ${percent(candidate.metrics.all.accuracy).padStart(8)}  ${number(candidate.metrics.all.logLoss).padStart(7)}    ${number(candidate.metrics.first50.logLoss).padStart(7)}      ${number(candidate.metrics.all.brier).padStart(7)}   ${number(candidate.metrics.all.rankedProbabilityScore).padStart(7)}    ${number(candidate.metrics.all.calibrationError).padStart(7)}`,
    );
  }

  const selected = report.candidates.find(
    (candidate) => candidate.weight === report.selectedWeight,
  );
  console.log(
    `\nPeso selezionato sul 2024/25: ${report.selectedWeight.toFixed(2)}`,
  );
  console.log(
    `Delta vs peso 0 — LogLoss intera ${signed(selected.deltaVsZero.allLogLoss)}, prime50 ${signed(selected.deltaVsZero.first50LogLoss)}, Brier ${signed(selected.deltaVsZero.allBrier)}, RPS ${signed(selected.deltaVsZero.allRps)}, calibrazione ${signed(selected.deltaVsZero.allCalibration)}`,
  );
  console.log(
    "Il 2025/26 non viene letto da questo comando e resta fuori dalla selezione.",
  );
}

function parseWeights(argument) {
  if (!argument) return DEFAULT_WEIGHT_GRID;
  const values = argument
    .slice("--weights=".length)
    .split(",")
    .map((value) => Number(value.trim()));
  if (
    !values.length ||
    values.some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1,
    )
  ) {
    throw new Error(
      "I pesi devono essere numeri tra 0 e 1 separati da virgola.",
    );
  }
  return values;
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args.filter((argument) => !argument.startsWith("--"));
  const targetPath = paths[0];
  const previousPath = paths[1];
  const weightsArgument = args.find((argument) =>
    argument.startsWith("--weights="),
  );
  const jsonArgument = args.find((argument) =>
    argument.startsWith("--json="),
  );

  if (!targetPath || !previousPath) {
    console.error(
      "Uso: node prediction-lab/tune-previous-season-weight.mjs <target.csv> <precedente.csv> [--weights=0,0.05,...,1] [--json=report.json]",
    );
    process.exitCode = 1;
    return;
  }

  const targetFixtures = parseFixturesCsv(
    readFileSync(targetPath, "utf8"),
  );
  const previousFixtures = parseFixturesCsv(
    readFileSync(previousPath, "utf8"),
  );
  const report = tunePreviousSeasonWeight(
    targetFixtures,
    previousFixtures,
    { weights: parseWeights(weightsArgument) },
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
