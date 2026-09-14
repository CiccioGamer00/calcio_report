import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { predictPoissonDcV1 } from "./lib/poisson-dc-v1.mjs";

const REQUIRED_COLUMNS = ["date", "league", "season", "home_team", "away_team", "home_goals", "away_goals"];

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += character;
  }
  if (quoted) throw new Error("CSV non valido: virgolette non chiuse.");
  values.push(value);
  return values;
}

export function parseFixturesCsv(source) {
  const lines = String(source)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  if (lines.length < 2) throw new Error("Il CSV deve contenere intestazione e almeno una partita.");

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  REQUIRED_COLUMNS.forEach((column) => {
    if (!headers.includes(column)) throw new Error(`Colonna obbligatoria mancante: ${column}`);
  });

  const fixtures = lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const raw = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
    const timestamp = Date.parse(raw.date);
    const homeGoals = Number(raw.home_goals);
    const awayGoals = Number(raw.away_goals);
    if (!Number.isFinite(timestamp)) throw new Error(`Riga ${rowIndex + 2}: data non valida.`);
    if (!raw.league || !raw.season || !raw.home_team || !raw.away_team)
      throw new Error(`Riga ${rowIndex + 2}: campi identificativi mancanti.`);
    if (raw.home_team === raw.away_team) throw new Error(`Riga ${rowIndex + 2}: squadra contro se stessa.`);
    if (!Number.isInteger(homeGoals) || homeGoals < 0 || !Number.isInteger(awayGoals) || awayGoals < 0)
      throw new Error(`Riga ${rowIndex + 2}: risultato non valido.`);
    return {
      sourceRow: rowIndex + 2,
      id: raw.fixture_id || null,
      date: new Date(timestamp).toISOString(),
      timestamp,
      league: raw.league,
      season: raw.season,
      homeTeam: raw.home_team,
      awayTeam: raw.away_team,
      homeGoals,
      awayGoals,
    };
  });

  const keys = new Set();
  fixtures.forEach((fixture) => {
    const key = [fixture.date, fixture.league, fixture.season, fixture.homeTeam, fixture.awayTeam].join("|");
    if (keys.has(key)) throw new Error(`Partita duplicata alla riga ${fixture.sourceRow}.`);
    keys.add(key);
  });
  return fixtures;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function goalsForAgainst(team, fixture) {
  if (fixture.homeTeam === team) return { gf: fixture.homeGoals, ga: fixture.awayGoals };
  if (fixture.awayTeam === team) return { gf: fixture.awayGoals, ga: fixture.homeGoals };
  throw new Error(`La squadra ${team} non appartiene alla partita.`);
}

function buildFeatures(history, fixture, recentMatches) {
  const leagueLast = history.slice(-50);
  const leagueHomeGoals = leagueLast.length ? average(leagueLast.map((match) => match.homeGoals)) : 1.25;
  const leagueAwayGoals = leagueLast.length ? average(leagueLast.map((match) => match.awayGoals)) : 1.05;
  const homeSeasonVenue = history.filter((match) => match.homeTeam === fixture.homeTeam);
  const awaySeasonVenue = history.filter((match) => match.awayTeam === fixture.awayTeam);
  const homeLast = history.filter((match) => match.homeTeam === fixture.homeTeam || match.awayTeam === fixture.homeTeam).slice(-recentMatches);
  const awayLast = history.filter((match) => match.homeTeam === fixture.awayTeam || match.awayTeam === fixture.awayTeam).slice(-recentMatches);
  const homeContext = homeLast.filter((match) => match.homeTeam === fixture.homeTeam);
  const awayContext = awayLast.filter((match) => match.awayTeam === fixture.awayTeam);
  const homeUse = homeContext.length >= 3 ? homeContext : homeLast;
  const awayUse = awayContext.length >= 3 ? awayContext : awayLast;

  return {
    leagueHomeGoals,
    leagueAwayGoals,
    seasonHomeGF: average(homeSeasonVenue.map((match) => match.homeGoals)),
    seasonHomeGA: average(homeSeasonVenue.map((match) => match.awayGoals)),
    seasonAwayGF: average(awaySeasonVenue.map((match) => match.awayGoals)),
    seasonAwayGA: average(awaySeasonVenue.map((match) => match.homeGoals)),
    recentHomeGF: homeUse.map((match) => goalsForAgainst(fixture.homeTeam, match).gf),
    recentHomeGA: homeUse.map((match) => goalsForAgainst(fixture.homeTeam, match).ga),
    recentAwayGF: awayUse.map((match) => goalsForAgainst(fixture.awayTeam, match).gf),
    recentAwayGA: awayUse.map((match) => goalsForAgainst(fixture.awayTeam, match).ga),
    coverage: {
      priorLeagueMatches: history.length,
      priorHomeTeamMatches: homeLast.length,
      priorAwayTeamMatches: awayLast.length,
      priorHomeVenueMatches: homeSeasonVenue.length,
      priorAwayVenueMatches: awaySeasonVenue.length,
    },
  };
}

function actualOutcome(fixture) {
  if (fixture.homeGoals > fixture.awayGoals) return "homeWin";
  if (fixture.homeGoals < fixture.awayGoals) return "awayWin";
  return "draw";
}

function summarize(predictions) {
  if (!predictions.length) return {
    matches: 0, accuracy: null, logLoss: null, brier: null,
    rankedProbabilityScore: null, exactScoreAccuracy: null,
    expectedGoalsMae: null, calibrationError: null,
  };

  const epsilon = 1e-15;
  let correct = 0, logLoss = 0, brier = 0, rps = 0, exactScores = 0, goalsMae = 0;
  const bins = Array.from({ length: 10 }, () => ({ count: 0, confidenceSum: 0, correct: 0 }));

  predictions.forEach((item) => {
    const outcome = actualOutcome(item.fixture);
    const probabilities = item.prediction.probabilities;
    const predictedOutcome = Object.entries(probabilities).sort((left, right) => right[1] - left[1])[0][0];
    const isCorrect = predictedOutcome === outcome;
    if (isCorrect) correct += 1;
    logLoss -= Math.log(Math.max(epsilon, probabilities[outcome]));

    for (const candidate of ["homeWin", "draw", "awayWin"]) {
      const observed = candidate === outcome ? 1 : 0;
      brier += Math.pow(probabilities[candidate] - observed, 2);
    }

    const observedHome = outcome === "homeWin" ? 1 : 0;
    const observedHomeOrDraw = outcome === "awayWin" ? 0 : 1;
    rps += (
      Math.pow(probabilities.homeWin - observedHome, 2) +
      Math.pow(probabilities.homeWin + probabilities.draw - observedHomeOrDraw, 2)
    ) / 2;

    if (item.prediction.topScorelines[0].score === `${item.fixture.homeGoals}-${item.fixture.awayGoals}`) exactScores += 1;
    goalsMae += (
      Math.abs(item.prediction.expectedGoals.home - item.fixture.homeGoals) +
      Math.abs(item.prediction.expectedGoals.away - item.fixture.awayGoals)
    ) / 2;

    const topProbability = Math.max(...Object.values(probabilities));
    const binIndex = Math.min(9, Math.floor(topProbability * 10));
    bins[binIndex].count += 1;
    bins[binIndex].confidenceSum += topProbability;
    if (isCorrect) bins[binIndex].correct += 1;
  });

  const calibrationError = bins.reduce((total, bin) => {
    if (!bin.count) return total;
    return total + (bin.count / predictions.length) *
      Math.abs(bin.confidenceSum / bin.count - bin.correct / bin.count);
  }, 0);

  return {
    matches: predictions.length,
    accuracy: correct / predictions.length,
    logLoss: logLoss / predictions.length,
    brier: brier / predictions.length,
    rankedProbabilityScore: rps / predictions.length,
    exactScoreAccuracy: exactScores / predictions.length,
    expectedGoalsMae: goalsMae / predictions.length,
    calibrationError,
  };
}

export function runBacktest(fixtures, options = {}) {
  const recentMatches = Number.isInteger(options.recentMatches) ? options.recentMatches : 10;
  const minLeagueMatches = Number.isInteger(options.minLeagueMatches) ? options.minLeagueMatches : 8;
  const minTeamMatches = Number.isInteger(options.minTeamMatches) ? options.minTeamMatches : 3;
  const groups = new Map();

  fixtures.forEach((fixture) => {
    const key = `${fixture.league}|${fixture.season}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fixture);
  });

  const predictions = [];
  for (const [competitionKey, group] of groups) {
    const ordered = [...group].sort((left, right) =>
      left.timestamp - right.timestamp || left.sourceRow - right.sourceRow);
    const history = [];

    for (let index = 0; index < ordered.length;) {
      const timestamp = ordered[index].timestamp;
      const batch = [];
      while (index < ordered.length && ordered[index].timestamp === timestamp) {
        batch.push(ordered[index]);
        index += 1;
      }

      const batchPredictions = batch.map((fixture) => {
        const features = buildFeatures(history, fixture, recentMatches);
        const prediction = predictPoissonDcV1(features);
        const eligible =
          features.coverage.priorLeagueMatches >= minLeagueMatches &&
          features.coverage.priorHomeTeamMatches >= minTeamMatches &&
          features.coverage.priorAwayTeamMatches >= minTeamMatches;
        return { competitionKey, fixture, features, prediction, eligible };
      });

      predictions.push(...batchPredictions);
      history.push(...batch);
    }
  }

  predictions.sort((left, right) =>
    left.fixture.timestamp - right.fixture.timestamp ||
    left.fixture.sourceRow - right.fixture.sourceRow);
  const guardedPredictions = predictions.filter((item) => item.eligible);

  return {
    generatedAt: new Date().toISOString(),
    settings: { recentMatches, minLeagueMatches, minTeamMatches, sameKickoffBatching: true },
    coverage: {
      totalFixtures: predictions.length,
      guardedFixtures: guardedPredictions.length,
      guardedRate: predictions.length ? guardedPredictions.length / predictions.length : 0,
    },
    legacy: summarize(predictions),
    guarded: summarize(guardedPredictions),
    predictions,
  };
}

function percent(value) { return value == null ? "n/d" : `${(value * 100).toFixed(2)}%`; }
function decimal(value) { return value == null ? "n/d" : value.toFixed(4); }

function printSummary(report) {
  console.log("Prediction Lab — poisson_dc_v1");
  console.log(`Partite: ${report.coverage.totalFixtures} | con copertura minima: ${report.coverage.guardedFixtures} (${percent(report.coverage.guardedRate)})`);
  for (const [label, metrics] of [
    ["Tutte (comportamento legacy)", report.legacy],
    ["Solo copertura minima", report.guarded],
  ]) {
    console.log(`\n${label}`);
    console.log(`  Campione: ${metrics.matches}`);
    console.log(`  Accuratezza 1X2: ${percent(metrics.accuracy)}`);
    console.log(`  Log loss: ${decimal(metrics.logLoss)}`);
    console.log(`  Brier: ${decimal(metrics.brier)}`);
    console.log(`  Ranked Probability Score: ${decimal(metrics.rankedProbabilityScore)}`);
    console.log(`  Errore calibrazione: ${decimal(metrics.calibrationError)}`);
    console.log(`  Risultato esatto: ${percent(metrics.exactScoreAccuracy)}`);
    console.log(`  MAE gol attesi: ${decimal(metrics.expectedGoalsMae)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find((argument) => !argument.startsWith("--"));
  const jsonArgument = args.find((argument) => argument.startsWith("--json="));
  if (!inputPath) {
    console.error("Uso: node prediction-lab/backtest.mjs <storico.csv> [--json=report.json]");
    process.exitCode = 1;
    return;
  }
  const fixtures = parseFixturesCsv(readFileSync(inputPath, "utf8"));
  const report = runBacktest(fixtures);
  printSummary(report);
  if (jsonArgument) {
    const outputPath = jsonArgument.slice("--json=".length);
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nReport completo salvato in ${outputPath}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
