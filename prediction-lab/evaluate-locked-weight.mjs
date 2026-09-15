import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseFixturesCsv } from "./backtest.mjs";
import { comparePreviousSeason } from "./compare-previous-season.mjs";

function sortedStrings(values) {
  return [...new Set((values || []).map(String))].sort();
}

function sameStrings(left, right) {
  return JSON.stringify(sortedStrings(left)) === JSON.stringify(sortedStrings(right));
}

function describeFixtures(fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length === 0)
    throw new Error("Il dataset di valutazione non contiene partite.");

  const ordered = [...fixtures].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
  return {
    fixtures: fixtures.length,
    leagueKeys: sortedStrings(fixtures.map((fixture) => fixture.leagueKey)),
    leagues: sortedStrings(fixtures.map((fixture) => fixture.league)),
    seasons: sortedStrings(fixtures.map((fixture) => fixture.season)),
    firstTimestamp: ordered[0].timestamp,
    lastTimestamp: ordered.at(-1).timestamp,
    firstDate: ordered[0].date,
    lastDate: ordered.at(-1).date,
  };
}

function validateTuningReport(report) {
  if (!report || typeof report !== "object")
    throw new Error("Report di taratura mancante o non valido.");

  const weight = Number(report.selectedWeight);
  if (!Number.isFinite(weight) || weight < 0 || weight > 1)
    throw new Error("Il report non contiene un peso selezionato valido.");

  if (report.selectionRule?.finalTestSeasonUsed !== false)
    throw new Error(
      "Il report non certifica che la stagione finale sia rimasta fuori dalla taratura.",
    );

  const target = report.datasets?.target;
  if (
    !target ||
    !Number.isFinite(Number(target.firstTimestamp)) ||
    !Number.isFinite(Number(target.lastTimestamp)) ||
    !Number.isInteger(Number(target.fixtures)) ||
    Number(target.fixtures) <= 0
  ) {
    throw new Error(
      "Il report non contiene l'identità completa del dataset di sviluppo.",
    );
  }

  return { weight, target };
}

function assertSameDevelopmentDataset(expected, actual) {
  const sameIdentity =
    Number(expected.fixtures) === actual.fixtures &&
    Number(expected.firstTimestamp) === actual.firstTimestamp &&
    Number(expected.lastTimestamp) === actual.lastTimestamp &&
    sameStrings(expected.leagueKeys, actual.leagueKeys) &&
    sameStrings(expected.seasons, actual.seasons);

  if (!sameIdentity) {
    throw new Error(
      "Il CSV usato come stagione precedente non coincide con il target usato per scegliere il peso.",
    );
  }
}

export function evaluateLockedWeight(
  tuningReport,
  targetFixtures,
  previousFixtures,
) {
  const { weight, target: developmentTarget } =
    validateTuningReport(tuningReport);
  const testTarget = describeFixtures(targetFixtures);
  const testPrevious = describeFixtures(previousFixtures);

  assertSameDevelopmentDataset(developmentTarget, testPrevious);

  if (!sameStrings(testTarget.leagueKeys, testPrevious.leagueKeys))
    throw new Error(
      "La lega della stagione finale non coincide con quella di sviluppo.",
    );

  if (testTarget.firstTimestamp <= Number(developmentTarget.lastTimestamp))
    throw new Error(
      "La stagione finale deve iniziare dopo la fine del dataset di sviluppo.",
    );

  if (testPrevious.lastTimestamp >= testTarget.firstTimestamp)
    throw new Error(
      "Lo storico precedente contiene partite contemporanee o future rispetto al test.",
    );

  const comparison = comparePreviousSeason(
    targetFixtures,
    previousFixtures,
    { previousSeasonWeight: weight },
  );

  return {
    generatedAt: new Date().toISOString(),
    protocol: "locked_previous_season_weight_v1",
    lockedBeforeEvaluation: true,
    selectedWeight: weight,
    tuning: {
      generatedAt: tuningReport.generatedAt ?? null,
      target: developmentTarget,
      previous: tuningReport.datasets?.previous ?? null,
      selectionRule: tuningReport.selectionRule,
    },
    datasets: {
      testTarget,
      testPrevious,
    },
    comparison,
  };
}

function percent(value) {
  return value == null ? "n/d" : `${(value * 100).toFixed(2)}%`;
}

function metric(value) {
  return value == null ? "n/d" : value.toFixed(4);
}

function signed(value, digits = 4) {
  if (value == null) return "n/d";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function printReport(report) {
  console.log("Prediction Lab — test finale con peso bloccato");
  console.log(
    `Peso bloccato prima del test: ${report.selectedWeight.toFixed(2)}`,
  );
  console.log(
    `Target finale: ${report.datasets.testTarget.fixtures} partite, ${report.datasets.testTarget.seasons.join(", ")}`,
  );
  console.log(
    `Storico: ${report.datasets.testPrevious.fixtures} partite, ${report.datasets.testPrevious.seasons.join(", ")}`,
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
      `Poisson attuale      Acc. ${percent(result.baseline.accuracy)} | LogLoss ${metric(result.baseline.logLoss)} | Brier ${metric(result.baseline.brier)} | RPS ${metric(result.baseline.rankedProbabilityScore)} | Calib. ${metric(result.baseline.calibrationError)}`,
    );
    console.log(
      `Peso bloccato        Acc. ${percent(result.previousSeason.accuracy)} | LogLoss ${metric(result.previousSeason.logLoss)} | Brier ${metric(result.previousSeason.brier)} | RPS ${metric(result.previousSeason.rankedProbabilityScore)} | Calib. ${metric(result.previousSeason.calibrationError)}`,
    );
    console.log(
      `Delta                Acc. ${signed(result.delta.accuracy * 100, 2)} punti | LogLoss ${signed(result.delta.logLoss)} | Brier ${signed(result.delta.brier)} | RPS ${signed(result.delta.rankedProbabilityScore)} | Calib. ${signed(result.delta.calibrationError)}`,
    );
  }

  console.log(
    "\nIl peso proviene dal report di sviluppo e non è stato ricalcolato sul target finale.",
  );
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args.filter((argument) => !argument.startsWith("--"));
  const tuningReportPath = paths[0];
  const targetPath = paths[1];
  const previousPath = paths[2];
  const jsonArgument = args.find((argument) =>
    argument.startsWith("--json="),
  );

  if (!tuningReportPath || !targetPath || !previousPath) {
    console.error(
      "Uso: node prediction-lab/evaluate-locked-weight.mjs <tuning-report.json> <target-finale.csv> <precedente.csv> [--json=report.json]",
    );
    process.exitCode = 1;
    return;
  }

  const tuningReport = JSON.parse(readFileSync(tuningReportPath, "utf8"));
  const targetFixtures = parseFixturesCsv(
    readFileSync(targetPath, "utf8"),
  );
  const previousFixtures = parseFixturesCsv(
    readFileSync(previousPath, "utf8"),
  );
  const report = evaluateLockedWeight(
    tuningReport,
    targetFixtures,
    previousFixtures,
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
