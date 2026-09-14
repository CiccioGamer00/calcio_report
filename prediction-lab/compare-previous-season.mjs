import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  parseFixturesCsv,
  runBacktest,
  summarizePredictions,
} from "./backtest.mjs";

const LOSS_METRICS = [
  "logLoss",
  "brier",
  "rankedProbabilityScore",
  "calibrationError",
  "expectedGoalsMae",
];

function sample(predictions, name) {
  if (name === "first30") return predictions.slice(0, 30);
  if (name === "first50") return predictions.slice(0, 50);
  if (name === "guarded")
    return predictions.filter((item) => item.eligible);
  return predictions;
}

function deltas(baseline, candidate) {
  return {
    accuracy: candidate.accuracy - baseline.accuracy,
    ...Object.fromEntries(
      LOSS_METRICS.map((name) => [
        name,
        candidate[name] - baseline[name],
      ]),
    ),
    exactScoreAccuracy:
      candidate.exactScoreAccuracy - baseline.exactScoreAccuracy,
  };
}

export function comparePreviousSeason(
  targetFixtures,
  previousFixtures,
  options = {},
) {
  const previousSeasonWeight = Number.isFinite(options.previousSeasonWeight)
    ? options.previousSeasonWeight
    : 0.35;
  const baseline = runBacktest(targetFixtures);
  const withPreviousSeason = runBacktest(targetFixtures, {
    priorFixtures: previousFixtures,
    previousSeasonWeight,
  });

  const samples = {};
  for (const name of ["all", "first30", "first50", "guarded"]) {
    const baselineMetrics = summarizePredictions(
      sample(baseline.predictions, name),
    );
    const candidateMetrics = summarizePredictions(
      sample(withPreviousSeason.predictions, name),
    );
    samples[name] = {
      baseline: baselineMetrics,
      previousSeason: candidateMetrics,
      delta: deltas(baselineMetrics, candidateMetrics),
    };
  }

  const first30 = withPreviousSeason.predictions.slice(0, 30);
  const completePriorCoverage = first30.filter(
    (item) =>
      item.features.coverage.previousSeasonHomeMatches > 0 &&
      item.features.coverage.previousSeasonAwayMatches > 0,
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    targetFixtures: targetFixtures.length,
    previousFixtures: previousFixtures.length,
    previousSeasonWeight,
    first30PriorCoverage: {
      bothTeams: completePriorCoverage,
      total: first30.length,
      rate: first30.length ? completePriorCoverage / first30.length : 0,
    },
    samples,
  };
}

function percent(value) {
  return value == null ? "n/d" : `${(value * 100).toFixed(2)}%`;
}

function signed(value, digits = 4) {
  if (value == null) return "n/d";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function metric(value) {
  return value == null ? "n/d" : value.toFixed(4);
}

function printMetrics(label, metrics) {
  console.log(
    `${label.padEnd(21)} Acc. ${percent(metrics.accuracy).padStart(7)} | LogLoss ${metric(metrics.logLoss)} | Brier ${metric(metrics.brier)} | RPS ${metric(metrics.rankedProbabilityScore)} | Calib. ${metric(metrics.calibrationError)}`,
  );
}

function printReport(report) {
  console.log("Prediction Lab — memoria stagione precedente");
  console.log(
    `Target: ${report.targetFixtures} | storico precedente: ${report.previousFixtures} | peso: ${report.previousSeasonWeight}`,
  );
  console.log(
    `Prime 30 con storico per entrambe le squadre: ${report.first30PriorCoverage.bothTeams}/${report.first30PriorCoverage.total} (${percent(report.first30PriorCoverage.rate)})`,
  );

  const labels = {
    all: "Intera stagione",
    first30: "Prime 30 partite",
    first50: "Prime 50 partite",
    guarded: "Copertura minima",
  };

  for (const [name, result] of Object.entries(report.samples)) {
    console.log(`\n${labels[name]}`);
    printMetrics("Poisson attuale", result.baseline);
    printMetrics("Con stagione prec.", result.previousSeason);
    console.log(
      `Delta: Acc. ${signed(result.delta.accuracy * 100, 2)} punti | LogLoss ${signed(result.delta.logLoss)} | Brier ${signed(result.delta.brier)} | RPS ${signed(result.delta.rankedProbabilityScore)} | Calib. ${signed(result.delta.calibrationError)}`,
    );
    console.log(
      "Per LogLoss/Brier/RPS/Calibrazione un delta negativo è migliore.",
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args.filter((argument) => !argument.startsWith("--"));
  const targetPath = paths[0];
  const previousPath = paths[1];
  const weightArgument = args.find((argument) =>
    argument.startsWith("--weight="),
  );
  const jsonArgument = args.find((argument) =>
    argument.startsWith("--json="),
  );

  if (!targetPath || !previousPath) {
    console.error(
      "Uso: node prediction-lab/compare-previous-season.mjs <target.csv> <precedente.csv> [--weight=0.35] [--json=report.json]",
    );
    process.exitCode = 1;
    return;
  }

  const weight = weightArgument
    ? Number(weightArgument.slice("--weight=".length))
    : 0.35;
  if (!Number.isFinite(weight) || weight < 0 || weight > 1)
    throw new Error("Il peso deve essere compreso tra 0 e 1.");

  const targetFixtures = parseFixturesCsv(
    readFileSync(targetPath, "utf8"),
  );
  const previousFixtures = parseFixturesCsv(
    readFileSync(previousPath, "utf8"),
  );
  const report = comparePreviousSeason(
    targetFixtures,
    previousFixtures,
    { previousSeasonWeight: weight },
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
