import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  parseFixturesCsv,
  runBacktest,
} from "./backtest.mjs";

const OUTCOMES = ["homeWin", "draw", "awayWin"];

function actualOutcome(fixture) {
  if (fixture.homeGoals > fixture.awayGoals) return "homeWin";
  if (fixture.homeGoals < fixture.awayGoals) return "awayWin";
  return "draw";
}

function evaluate(entries) {
  if (!entries.length) {
    return {
      matches: 0,
      accuracy: null,
      logLoss: null,
      brier: null,
      rankedProbabilityScore: null,
      calibrationError: null,
    };
  }

  const bins = Array.from({ length: 10 }, () => ({
    count: 0,
    confidence: 0,
    correct: 0,
  }));
  let correct = 0;
  let logLoss = 0;
  let brier = 0;
  let rps = 0;

  for (const entry of entries) {
    const outcome = actualOutcome(entry.fixture);
    const probabilities = entry.probabilities;
    const predicted = OUTCOMES.reduce((best, candidate) =>
      probabilities[candidate] > probabilities[best] ? candidate : best,
    );
    const isCorrect = predicted === outcome;
    if (isCorrect) correct += 1;

    logLoss -= Math.log(Math.max(1e-15, probabilities[outcome]));
    for (const candidate of OUTCOMES) {
      brier += Math.pow(
        probabilities[candidate] - (candidate === outcome ? 1 : 0),
        2,
      );
    }

    const observedHome = outcome === "homeWin" ? 1 : 0;
    const observedHomeOrDraw = outcome === "awayWin" ? 0 : 1;
    rps +=
      (Math.pow(probabilities.homeWin - observedHome, 2) +
        Math.pow(
          probabilities.homeWin +
            probabilities.draw -
            observedHomeOrDraw,
          2,
        )) /
      2;

    const topProbability = Math.max(...Object.values(probabilities));
    const bin = bins[Math.min(9, Math.floor(topProbability * 10))];
    bin.count += 1;
    bin.confidence += topProbability;
    if (isCorrect) bin.correct += 1;
  }

  const calibrationError = bins.reduce((total, bin) => {
    if (!bin.count) return total;
    return (
      total +
      (bin.count / entries.length) *
        Math.abs(
          bin.confidence / bin.count - bin.correct / bin.count,
        )
    );
  }, 0);

  return {
    matches: entries.length,
    accuracy: correct / entries.length,
    logLoss: logLoss / entries.length,
    brier: brier / entries.length,
    rankedProbabilityScore: rps / entries.length,
    calibrationError,
  };
}

function buildProgressiveLeaguePrior(predictions) {
  const groups = new Map();
  predictions.forEach((item) => {
    if (!groups.has(item.competitionKey))
      groups.set(item.competitionKey, []);
    groups.get(item.competitionKey).push(item);
  });

  const entries = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(
      (left, right) =>
        left.fixture.timestamp - right.fixture.timestamp ||
        left.fixture.sourceRow - right.fixture.sourceRow,
    );
    const counts = { homeWin: 1, draw: 1, awayWin: 1 };
    let total = 3;

    for (let index = 0; index < ordered.length; ) {
      const timestamp = ordered[index].fixture.timestamp;
      const batch = [];
      while (
        index < ordered.length &&
        ordered[index].fixture.timestamp === timestamp
      ) {
        batch.push(ordered[index]);
        index += 1;
      }

      for (const item of batch) {
        entries.push({
          fixture: item.fixture,
          eligible: item.eligible,
          probabilities: {
            homeWin: counts.homeWin / total,
            draw: counts.draw / total,
            awayWin: counts.awayWin / total,
          },
        });
      }

      for (const item of batch) {
        counts[actualOutcome(item.fixture)] += 1;
        total += 1;
      }
    }
  }

  return entries.sort(
    (left, right) =>
      left.fixture.timestamp - right.fixture.timestamp ||
      left.fixture.sourceRow - right.fixture.sourceRow,
  );
}

function reportFor(entries) {
  return {
    all: evaluate(entries),
    guarded: evaluate(entries.filter((entry) => entry.eligible)),
  };
}

export function compareBaselines(fixtures, options = {}) {
  const backtest = runBacktest(fixtures, options);
  const modelEntries = backtest.predictions.map((item) => ({
    fixture: item.fixture,
    eligible: item.eligible,
    probabilities: item.prediction.probabilities,
  }));
  const uniformEntries = modelEntries.map((item) => ({
    ...item,
    probabilities: {
      homeWin: 1 / 3,
      draw: 1 / 3,
      awayWin: 1 / 3,
    },
  }));
  const progressiveEntries = buildProgressiveLeaguePrior(
    backtest.predictions,
  );

  const models = {
    uniform_1x2: reportFor(uniformEntries),
    progressive_league_prior: reportFor(progressiveEntries),
    poisson_dc_v1: reportFor(modelEntries),
  };

  const reference = models.progressive_league_prior;
  const poisson = models.poisson_dc_v1;

  return {
    generatedAt: new Date().toISOString(),
    coverage: backtest.coverage,
    models,
    deltasVsProgressivePrior: {
      all: {
        accuracy: poisson.all.accuracy - reference.all.accuracy,
        logLoss: poisson.all.logLoss - reference.all.logLoss,
        brier: poisson.all.brier - reference.all.brier,
        rankedProbabilityScore:
          poisson.all.rankedProbabilityScore -
          reference.all.rankedProbabilityScore,
        calibrationError:
          poisson.all.calibrationError -
          reference.all.calibrationError,
      },
      guarded: {
        accuracy:
          poisson.guarded.accuracy - reference.guarded.accuracy,
        logLoss: poisson.guarded.logLoss - reference.guarded.logLoss,
        brier: poisson.guarded.brier - reference.guarded.brier,
        rankedProbabilityScore:
          poisson.guarded.rankedProbabilityScore -
          reference.guarded.rankedProbabilityScore,
        calibrationError:
          poisson.guarded.calibrationError -
          reference.guarded.calibrationError,
      },
    },
  };
}

function percent(value) {
  return value == null ? "n/d" : `${(value * 100).toFixed(2)}%`;
}

function decimal(value) {
  return value == null ? "n/d" : value.toFixed(4);
}

function printComparison(report) {
  console.log("Prediction Lab — confronto baseline");
  console.log(
    `Partite: ${report.coverage.totalFixtures} | copertura minima: ${report.coverage.guardedFixtures}`,
  );

  for (const sample of ["all", "guarded"]) {
    console.log(
      `\n${sample === "all" ? "Tutte le partite" : "Solo copertura minima"}`,
    );
    console.log(
      "Modello                       Acc.      LogLoss   Brier     RPS       Calib.",
    );

    for (const [name, result] of Object.entries(report.models)) {
      const metrics = result[sample];
      console.log(
        `${name.padEnd(29)} ${percent(metrics.accuracy).padStart(8)}  ${decimal(metrics.logLoss).padStart(8)}  ${decimal(metrics.brier).padStart(8)}  ${decimal(metrics.rankedProbabilityScore).padStart(8)}  ${decimal(metrics.calibrationError).padStart(8)}`,
      );
    }

    const delta = report.deltasVsProgressivePrior[sample];
    console.log(
      `Delta Poisson vs prior — LogLoss ${decimal(delta.logLoss)}, Brier ${decimal(delta.brier)}, RPS ${decimal(delta.rankedProbabilityScore)} (negativo = Poisson migliore)`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find((argument) => !argument.startsWith("--"));
  const jsonArgument = args.find((argument) =>
    argument.startsWith("--json="),
  );

  if (!inputPath) {
    console.error(
      "Uso: node prediction-lab/compare-baselines.mjs <storico.csv> [--json=report.json]",
    );
    process.exitCode = 1;
    return;
  }

  const fixtures = parseFixturesCsv(readFileSync(inputPath, "utf8"));
  const report = compareBaselines(fixtures);
  printComparison(report);

  if (jsonArgument) {
    const outputPath = jsonArgument.slice("--json=".length);
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nReport confronto salvato in ${outputPath}`);
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
