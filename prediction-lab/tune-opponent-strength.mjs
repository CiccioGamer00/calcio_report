import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  parseFixturesCsv,
  summarizePredictions,
} from "./backtest.mjs";
import { runOpponentStrengthBacktest } from "./lib/elo-opponent-strength.mjs";

export const DEFAULT_STRENGTH_GRID = Object.freeze(
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

export function sampleMetrics(predictions) {
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

export function compareOpponentStrength(
  targetFixtures,
  previousFixtures,
  options = {},
) {
  const coefficient = Number(options.strengthCoefficient) || 0;
  const sharedOptions = {
    priorFixtures: previousFixtures,
    previousSeasonWeight: Number.isFinite(options.previousSeasonWeight)
      ? options.previousSeasonWeight
      : 1,
    kFactor: options.kFactor,
    homeAdvantage: options.homeAdvantage,
    seasonCarry: options.seasonCarry,
    maxRatingDifference: options.maxRatingDifference,
  };
  const baseline = runOpponentStrengthBacktest(targetFixtures, {
    ...sharedOptions,
    strengthCoefficient: 0,
  });
  const candidate = runOpponentStrengthBacktest(targetFixtures, {
    ...sharedOptions,
    strengthCoefficient: coefficient,
  });
  const samples = {};
  const baselineSamples = sampleMetrics(baseline.predictions);
  const candidateSamples = sampleMetrics(candidate.predictions);
  for (const name of Object.keys(baselineSamples)) {
    samples[name] = {
      baseline: baselineSamples[name],
      opponentStrength: candidateSamples[name],
      delta: metricDeltas(
        baselineSamples[name],
        candidateSamples[name],
      ),
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

export function tuneOpponentStrength(
  targetFixtures,
  previousFixtures,
  options = {},
) {
  const requested =
    Array.isArray(options.coefficients) && options.coefficients.length
      ? options.coefficients
      : DEFAULT_STRENGTH_GRID;
  const coefficients = [...new Set(requested.map(Number))]
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 2)
    .sort((left, right) => left - right);
  if (!coefficients.includes(0)) coefficients.unshift(0);
  if (coefficients.length < 2)
    throw new Error("Servono il coefficiente zero e almeno un candidato.");

  const previousSeasonWeight = Number.isFinite(options.previousSeasonWeight)
    ? options.previousSeasonWeight
    : 1;
  const candidates = coefficients.map((strengthCoefficient) => {
    const report = runOpponentStrengthBacktest(targetFixtures, {
      priorFixtures: previousFixtures,
      previousSeasonWeight,
      strengthCoefficient,
      kFactor: options.kFactor,
      homeAdvantage: options.homeAdvantage,
      seasonCarry: options.seasonCarry,
      maxRatingDifference: options.maxRatingDifference,
    });
    return {
      strengthCoefficient,
      settings: report.settings,
      metrics: sampleMetrics(report.predictions),
    };
  });
  const baseline = candidates.find(
    (candidate) => candidate.strengthCoefficient === 0,
  );
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
      left.strengthCoefficient - right.strengthCoefficient,
  )[0];

  return {
    generatedAt: new Date().toISOString(),
    protocol: "elo_opponent_strength_tuning_v1",
    datasets: {
      target: describeFixtures(targetFixtures),
      previous: describeFixtures(previousFixtures),
    },
    fixedSettings: {
      previousSeasonWeight,
      eloKFactor: selected.settings.eloKFactor,
      eloHomeAdvantage: selected.settings.eloHomeAdvantage,
      eloSeasonCarry: selected.settings.eloSeasonCarry,
      maxRatingDifference: selected.settings.maxRatingDifference,
    },
    selectionRule: {
      primary: "minimum full-season log loss",
      guard:
        "first-50 and full-season log loss must not exceed coefficient-0 baseline",
      tieBreakers: ["full-season RPS", "full-season Brier", "lower coefficient"],
      finalTestSeasonUsed: false,
    },
    coefficients,
    selectedCoefficient: selected.strengthCoefficient,
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
  console.log("Prediction Lab — forza avversari (Elo)");
  console.log(
    `Target sviluppo: ${report.datasets.target.fixtures} | storico: ${report.datasets.previous.fixtures} | peso stagione precedente: ${report.fixedSettings.previousSeasonWeight}`,
  );
  console.log(
    "Coeff. Ammesso   Acc.all   LL.all   LL.prime50   Brier.all   RPS.all   Calib.all",
  );
  for (const candidate of report.candidates) {
    console.log(
      `${candidate.strengthCoefficient.toFixed(2).padStart(5)}  ${String(candidate.admissible ? "sì" : "no").padEnd(8)} ${percent(candidate.metrics.all.accuracy).padStart(8)}  ${decimal(candidate.metrics.all.logLoss).padStart(7)}    ${decimal(candidate.metrics.first50.logLoss).padStart(7)}      ${decimal(candidate.metrics.all.brier).padStart(7)}   ${decimal(candidate.metrics.all.rankedProbabilityScore).padStart(7)}    ${decimal(candidate.metrics.all.calibrationError).padStart(7)}`,
    );
  }
  const selected = report.candidates.find(
    (candidate) =>
      candidate.strengthCoefficient === report.selectedCoefficient,
  );
  console.log(
    `\nCoefficiente selezionato: ${report.selectedCoefficient.toFixed(2)}`,
  );
  console.log(
    `Delta vs zero — LogLoss intera ${signed(selected.deltaVsZero.allLogLoss)}, prime50 ${signed(selected.deltaVsZero.first50LogLoss)}, Brier ${signed(selected.deltaVsZero.allBrier)}, RPS ${signed(selected.deltaVsZero.allRps)}, calibrazione ${signed(selected.deltaVsZero.allCalibration)}`,
  );
  console.log(
    "La stagione finale non viene letta da questo comando.",
  );
}

function parseCoefficients(argument) {
  if (!argument) return DEFAULT_STRENGTH_GRID;
  const values = argument
    .slice("--coefficients=".length)
    .split(",")
    .map((value) => Number(value.trim()));
  if (
    !values.length ||
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 2)
  ) {
    throw new Error(
      "I coefficienti devono essere numeri tra 0 e 2 separati da virgola.",
    );
  }
  return values;
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args.filter((argument) => !argument.startsWith("--"));
  const targetPath = paths[0];
  const previousPath = paths[1];
  const coefficientsArgument = args.find((argument) =>
    argument.startsWith("--coefficients="),
  );
  const previousWeightArgument = args.find((argument) =>
    argument.startsWith("--previous-weight="),
  );
  const jsonArgument = args.find((argument) =>
    argument.startsWith("--json="),
  );
  if (!targetPath || !previousPath) {
    console.error(
      "Uso: node prediction-lab/tune-opponent-strength.mjs <target.csv> <precedente.csv> [--previous-weight=1] [--coefficients=0,0.1,...,1] [--json=report.json]",
    );
    process.exitCode = 1;
    return;
  }
  const previousSeasonWeight = previousWeightArgument
    ? Number(previousWeightArgument.slice("--previous-weight=".length))
    : 1;
  if (
    !Number.isFinite(previousSeasonWeight) ||
    previousSeasonWeight < 0 ||
    previousSeasonWeight > 1
  ) {
    throw new Error("Il peso della stagione precedente deve essere tra 0 e 1.");
  }
  const report = tuneOpponentStrength(
    parseFixturesCsv(readFileSync(targetPath, "utf8")),
    parseFixturesCsv(readFileSync(previousPath, "utf8")),
    {
      previousSeasonWeight,
      coefficients: parseCoefficients(coefficientsArgument),
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

