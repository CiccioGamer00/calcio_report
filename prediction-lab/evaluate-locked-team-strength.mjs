import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseFixturesCsv } from "./backtest.mjs";
import { compareDynamicTeamStrength } from "./tune-team-strength.mjs";

function sortedStrings(values) {
  return [...new Set((values || []).map(String))].sort();
}

function sameStrings(left, right) {
  return JSON.stringify(sortedStrings(left)) ===
    JSON.stringify(sortedStrings(right));
}

function describeFixtures(fixtures) {
  if (!fixtures.length) throw new Error("Il dataset non contiene partite.");
  const ordered = [...fixtures].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
  return {
    fixtures: fixtures.length,
    leagueKeys: sortedStrings(fixtures.map((fixture) => fixture.leagueKey)),
    seasons: sortedStrings(fixtures.map((fixture) => fixture.season)),
    firstTimestamp: ordered[0].timestamp,
    lastTimestamp: ordered.at(-1).timestamp,
    firstDate: ordered[0].date,
    lastDate: ordered.at(-1).date,
  };
}

function validateTuningReport(report) {
  if (!report || report.protocol !== "dynamic_team_strength_tuning_v3") {
    throw new Error("Report di taratura attacco/difesa mancante o non valido.");
  }
  const blend = Number(report.selectedBlend);
  const learningRate = Number(report.selectedLearningRate);
  if (!Number.isFinite(blend) || blend < 0 || blend > 1) {
    throw new Error("Il blend selezionato non è valido.");
  }
  if (blend > 0 && (!Number.isFinite(learningRate) || learningRate <= 0)) {
    throw new Error("Il learning-rate selezionato non è valido.");
  }
  if (report.selectionRule?.finalTestSeasonUsed !== false) {
    throw new Error(
      "Il report non certifica che la stagione finale sia rimasta fuori dalla taratura.",
    );
  }
  const target = report.datasets?.target;
  if (
    !target ||
    !Number.isInteger(Number(target.fixtures)) ||
    Number(target.fixtures) <= 0 ||
    !Number.isFinite(Number(target.firstTimestamp)) ||
    !Number.isFinite(Number(target.lastTimestamp))
  ) {
    throw new Error("Identità del dataset di sviluppo incompleta.");
  }
  return { blend, learningRate, target };
}

function assertSameDataset(expected, actual) {
  const matches =
    Number(expected.fixtures) === actual.fixtures &&
    Number(expected.firstTimestamp) === actual.firstTimestamp &&
    Number(expected.lastTimestamp) === actual.lastTimestamp &&
    sameStrings(expected.leagueKeys, actual.leagueKeys) &&
    sameStrings(expected.seasons, actual.seasons);
  if (!matches) {
    throw new Error(
      "Il CSV precedente non coincide con il target usato per scegliere i parametri.",
    );
  }
}

export function evaluateLockedDynamicTeamStrength(
  tuningReport,
  targetFixtures,
  previousFixtures,
) {
  const {
    blend,
    learningRate,
    target: developmentTarget,
  } = validateTuningReport(tuningReport);
  const testTarget = describeFixtures(targetFixtures);
  const testPrevious = describeFixtures(previousFixtures);
  assertSameDataset(developmentTarget, testPrevious);
  if (!sameStrings(testTarget.leagueKeys, testPrevious.leagueKeys)) {
    throw new Error("La lega finale non coincide con quella di sviluppo.");
  }
  if (testTarget.firstTimestamp <= Number(developmentTarget.lastTimestamp)) {
    throw new Error(
      "La stagione finale deve iniziare dopo la fine dello sviluppo.",
    );
  }
  if (testPrevious.lastTimestamp >= testTarget.firstTimestamp) {
    throw new Error(
      "Lo storico contiene partite contemporanee o future rispetto al test.",
    );
  }

  const settings = tuningReport.fixedSettings || {};
  const comparison = compareDynamicTeamStrength(
    targetFixtures,
    previousFixtures,
    {
      blend,
      learningRate: blend > 0 ? learningRate : 0.05,
      previousSeasonWeight: Number(settings.previousSeasonWeight),
      seasonCarry: Number(settings.seasonCarry),
      ratingShrinkage: Number(settings.ratingShrinkage),
      residualCap: Number(settings.residualCap),
      maxLogStrength: Number(settings.maxLogStrength),
    },
  );
  return {
    generatedAt: new Date().toISOString(),
    protocol: "locked_dynamic_team_strength_v3",
    lockedBeforeEvaluation: true,
    selectedLearningRate: blend > 0 ? learningRate : null,
    selectedBlend: blend,
    tuning: {
      generatedAt: tuningReport.generatedAt ?? null,
      target: developmentTarget,
      previous: tuningReport.datasets?.previous ?? null,
      fixedSettings: settings,
      selectionRule: tuningReport.selectionRule,
    },
    datasets: { testTarget, testPrevious },
    comparison,
  };
}

function percent(value) {
  return value == null ? "n/d" : `${(value * 100).toFixed(2)}%`;
}

function decimal(value) {
  return value == null ? "n/d" : value.toFixed(4);
}

function signed(value, digits = 4) {
  return value == null
    ? "n/d"
    : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function printReport(report) {
  console.log("Prediction Lab — test finale forza dinamica attacco/difesa");
  console.log(
    `Parametri bloccati: learning-rate ${report.selectedLearningRate ?? "baseline"}, blend ${report.selectedBlend.toFixed(2)}`,
  );
  console.log(
    `Target finale: ${report.datasets.testTarget.fixtures} | storico: ${report.datasets.testPrevious.fixtures}`,
  );
  const labels = {
    all: "Intera stagione",
    first30: "Prime 30 partite",
    first50: "Prime 50 partite",
    guarded: "Copertura minima",
  };
  for (const [name, result] of Object.entries(report.comparison.samples)) {
    console.log(`\n${labels[name]}`);
    console.log(
      `Modello attuale Acc. ${percent(result.baseline.accuracy)} | LogLoss ${decimal(result.baseline.logLoss)} | Brier ${decimal(result.baseline.brier)} | RPS ${decimal(result.baseline.rankedProbabilityScore)} | Calib. ${decimal(result.baseline.calibrationError)}`,
    );
    console.log(
      `Attacco/difesa Acc. ${percent(result.dynamicStrength.accuracy)} | LogLoss ${decimal(result.dynamicStrength.logLoss)} | Brier ${decimal(result.dynamicStrength.brier)} | RPS ${decimal(result.dynamicStrength.rankedProbabilityScore)} | Calib. ${decimal(result.dynamicStrength.calibrationError)}`,
    );
    console.log(
      `Delta          Acc. ${signed(result.delta.accuracy * 100, 2)} punti | LogLoss ${signed(result.delta.logLoss)} | Brier ${signed(result.delta.brier)} | RPS ${signed(result.delta.rankedProbabilityScore)} | Calib. ${signed(result.delta.calibrationError)}`,
    );
  }
  console.log(
    "\nI parametri provengono dallo sviluppo e non sono stati ricalcolati sul target finale.",
  );
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args.filter((argument) => !argument.startsWith("--"));
  const reportPath = paths[0];
  const targetPath = paths[1];
  const previousPath = paths[2];
  const jsonArgument = args.find((argument) => argument.startsWith("--json="));
  if (!reportPath || !targetPath || !previousPath) {
    console.error(
      "Uso: node prediction-lab/evaluate-locked-team-strength.mjs <tuning-report.json> <target-finale.csv> <precedente.csv> [--json=report.json]",
    );
    process.exitCode = 1;
    return;
  }
  const report = evaluateLockedDynamicTeamStrength(
    JSON.parse(readFileSync(reportPath, "utf8")),
    parseFixturesCsv(readFileSync(targetPath, "utf8")),
    parseFixturesCsv(readFileSync(previousPath, "utf8")),
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
