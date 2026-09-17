import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseFixturesCsv } from "./backtest.mjs";
import { compareOpponentStrength } from "./tune-opponent-strength.mjs";

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
  if (!report || report.protocol !== "elo_opponent_strength_tuning_v1")
    throw new Error("Report di taratura Elo mancante o non valido.");
  const coefficient = Number(report.selectedCoefficient);
  if (!Number.isFinite(coefficient) || coefficient < 0 || coefficient > 2)
    throw new Error("Il coefficiente Elo selezionato non è valido.");
  if (report.selectionRule?.finalTestSeasonUsed !== false)
    throw new Error(
      "Il report non certifica che la stagione finale sia rimasta fuori dalla taratura.",
    );
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
  return { coefficient, target };
}

function assertSameDataset(expected, actual) {
  const matches =
    Number(expected.fixtures) === actual.fixtures &&
    Number(expected.firstTimestamp) === actual.firstTimestamp &&
    Number(expected.lastTimestamp) === actual.lastTimestamp &&
    sameStrings(expected.leagueKeys, actual.leagueKeys) &&
    sameStrings(expected.seasons, actual.seasons);
  if (!matches)
    throw new Error(
      "Il CSV precedente non coincide con il target usato per scegliere il coefficiente.",
    );
}

export function evaluateLockedOpponentStrength(
  tuningReport,
  targetFixtures,
  previousFixtures,
) {
  const { coefficient, target: developmentTarget } =
    validateTuningReport(tuningReport);
  const testTarget = describeFixtures(targetFixtures);
  const testPrevious = describeFixtures(previousFixtures);
  assertSameDataset(developmentTarget, testPrevious);
  if (!sameStrings(testTarget.leagueKeys, testPrevious.leagueKeys))
    throw new Error("La lega finale non coincide con quella di sviluppo.");
  if (testTarget.firstTimestamp <= Number(developmentTarget.lastTimestamp))
    throw new Error(
      "La stagione finale deve iniziare dopo la fine dello sviluppo.",
    );
  if (testPrevious.lastTimestamp >= testTarget.firstTimestamp)
    throw new Error(
      "Lo storico contiene partite contemporanee o future rispetto al test.",
    );

  const settings = tuningReport.fixedSettings || {};
  const comparison = compareOpponentStrength(
    targetFixtures,
    previousFixtures,
    {
      strengthCoefficient: coefficient,
      previousSeasonWeight: Number(settings.previousSeasonWeight),
      kFactor: Number(settings.eloKFactor),
      homeAdvantage: Number(settings.eloHomeAdvantage),
      seasonCarry: Number(settings.eloSeasonCarry),
      maxRatingDifference: Number(settings.maxRatingDifference),
    },
  );
  return {
    generatedAt: new Date().toISOString(),
    protocol: "locked_elo_opponent_strength_v1",
    lockedBeforeEvaluation: true,
    selectedCoefficient: coefficient,
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
  console.log("Prediction Lab — test finale forza avversari");
  console.log(
    `Coefficiente bloccato prima del test: ${report.selectedCoefficient.toFixed(2)}`,
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
      `Solo memoria        Acc. ${percent(result.baseline.accuracy)} | LogLoss ${decimal(result.baseline.logLoss)} | Brier ${decimal(result.baseline.brier)} | RPS ${decimal(result.baseline.rankedProbabilityScore)} | Calib. ${decimal(result.baseline.calibrationError)}`,
    );
    console.log(
      `Con forza avversari Acc. ${percent(result.opponentStrength.accuracy)} | LogLoss ${decimal(result.opponentStrength.logLoss)} | Brier ${decimal(result.opponentStrength.brier)} | RPS ${decimal(result.opponentStrength.rankedProbabilityScore)} | Calib. ${decimal(result.opponentStrength.calibrationError)}`,
    );
    console.log(
      `Delta              Acc. ${signed(result.delta.accuracy * 100, 2)} punti | LogLoss ${signed(result.delta.logLoss)} | Brier ${signed(result.delta.brier)} | RPS ${signed(result.delta.rankedProbabilityScore)} | Calib. ${signed(result.delta.calibrationError)}`,
    );
  }
  console.log(
    "\nIl coefficiente proviene dallo sviluppo e non è stato ricalcolato sul target finale.",
  );
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args.filter((argument) => !argument.startsWith("--"));
  const reportPath = paths[0];
  const targetPath = paths[1];
  const previousPath = paths[2];
  const jsonArgument = args.find((argument) =>
    argument.startsWith("--json="),
  );
  if (!reportPath || !targetPath || !previousPath) {
    console.error(
      "Uso: node prediction-lab/evaluate-locked-opponent-strength.mjs <tuning-report.json> <target-finale.csv> <precedente.csv> [--json=report.json]",
    );
    process.exitCode = 1;
    return;
  }
  const report = evaluateLockedOpponentStrength(
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

