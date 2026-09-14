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
    const leagueId = raw.league_id ? Number(raw.league_id) : null;
    const homeTeamId = raw.home_team_id ? Number(raw.home_team_id) : null;
    const awayTeamId = raw.away_team_id ? Number(raw.away_team_id) : null;
    if (!Number.isFinite(timestamp)) throw new Error(`Riga ${rowIndex + 2}: data non valida.`);
    if (!raw.league || !raw.season || !raw.home_team || !raw.away_team)
      throw new Error(`Riga ${rowIndex + 2}: campi identificativi mancanti.`);
    if (raw.home_team === raw.away_team) throw new Error(`Riga ${rowIndex + 2}: squadra contro se stessa.`);
    if (!Number.isInteger(homeGoals) || homeGoals < 0 || !Number.isInteger(awayGoals) || awayGoals < 0)
      throw new Error(`Riga ${rowIndex + 2}: risultato non valido.`);
    if (
      (raw.league_id && !Number.isInteger(leagueId)) ||
      (raw.home_team_id && !Number.isInteger(homeTeamId)) ||
      (raw.away_team_id && !Number.isInteger(awayTeamId))
    ) {
      throw new Error(`Riga ${rowIndex + 2}: ID API non valido.`);
    }
    const leagueKey = leagueId
      ? `id:${leagueId}`
      : `name:${raw.league.toLowerCase()}`;
    const homeTeamKey = homeTeamId
      ? `id:${homeTeamId}`
      : `name:${raw.home_team.toLowerCase()}`;
    const awayTeamKey = awayTeamId
      ? `id:${awayTeamId}`
      : `name:${raw.away_team.toLowerCase()}`;
    return {
      sourceRow: rowIndex + 2,
      id: raw.fixture_id || null,
      date: new Date(timestamp).toISOString(),
      timestamp,
      leagueId,
      leagueKey,
      league: raw.league,
      season: raw.season,
      homeTeamId,
      homeTeamKey,
      homeTeam: raw.home_team,
      awayTeamId,
      awayTeamKey,
      awayTeam: raw.away_team,
      homeGoals,
      awayGoals,
    };
  });

  const keys = new Set();
  fixtures.forEach((fixture) => {
    const key = [fixture.date, fixture.leagueKey, fixture.season, fixture.homeTeamKey, fixture.awayTeamKey].join("|");
    if (keys.has(key)) throw new Error(`Partita duplicata alla riga ${fixture.sourceRow}.`);
    keys.add(key);
  });
  return fixtures;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function weightedAverage(currentValues, previousValues, previousWeight) {
  const current = currentValues.filter(Number.isFinite);
  const previous = previousValues.filter(Number.isFinite);
  const denominator = current.length + previous.length * previousWeight;
  if (!denominator) return null;
  return (
    current.reduce((sum, value) => sum + value, 0) +
    previous.reduce((sum, value) => sum + value, 0) * previousWeight
  ) / denominator;
}

function goalsForAgainst(teamKey, fixture) {
  if (fixture.homeTeamKey === teamKey) return { gf: fixture.homeGoals, ga: fixture.awayGoals };
  if (fixture.awayTeamKey === teamKey) return { gf: fixture.awayGoals, ga: fixture.homeGoals };
  throw new Error(`La squadra ${teamKey} non appartiene alla partita.`);
}

function buildFeatures(
  history,
  fixture,
  recentMatches,
  previousSeasonHistory = [],
  previousSeasonWeight = 0,
) {
  const leagueLast = history.slice(-50);
  const previousLeagueLast = previousSeasonHistory.slice(-50);
  const leagueHomeGoals =
    weightedAverage(
      leagueLast.map((match) => match.homeGoals),
      previousLeagueLast.map((match) => match.homeGoals),
      previousSeasonWeight,
    ) ?? 1.25;
  const leagueAwayGoals =
    weightedAverage(
      leagueLast.map((match) => match.awayGoals),
      previousLeagueLast.map((match) => match.awayGoals),
      previousSeasonWeight,
    ) ?? 1.05;
  const homeSeasonVenue = history.filter((match) => match.homeTeamKey === fixture.homeTeamKey);
  const awaySeasonVenue = history.filter((match) => match.awayTeamKey === fixture.awayTeamKey);
  const homeLast = history.filter((match) => match.homeTeamKey === fixture.homeTeamKey || match.awayTeamKey === fixture.homeTeamKey).slice(-recentMatches);
  const awayLast = history.filter((match) => match.homeTeamKey === fixture.awayTeamKey || match.awayTeamKey === fixture.awayTeamKey).slice(-recentMatches);
  const homeContext = homeLast.filter((match) => match.homeTeamKey === fixture.homeTeamKey);
  const awayContext = awayLast.filter((match) => match.awayTeamKey === fixture.awayTeamKey);
  const homeUse = homeContext.length >= 3 ? homeContext : homeLast;
  const awayUse = awayContext.length >= 3 ? awayContext : awayLast;

  const previousHomeLast = previousSeasonHistory
    .filter((match) => match.homeTeamKey === fixture.homeTeamKey || match.awayTeamKey === fixture.homeTeamKey)
    .slice(-recentMatches);
  const previousAwayLast = previousSeasonHistory
    .filter((match) => match.homeTeamKey === fixture.awayTeamKey || match.awayTeamKey === fixture.awayTeamKey)
    .slice(-recentMatches);
  const previousHomeContext = previousHomeLast.filter(
    (match) => match.homeTeamKey === fixture.homeTeamKey,
  );
  const previousAwayContext = previousAwayLast.filter(
    (match) => match.awayTeamKey === fixture.awayTeamKey,
  );
  const previousHomeUse =
    previousHomeContext.length >= 3 ? previousHomeContext : previousHomeLast;
  const previousAwayUse =
    previousAwayContext.length >= 3 ? previousAwayContext : previousAwayLast;

  const recentHomeGF = weightedAverage(
    homeUse.map((match) => goalsForAgainst(fixture.homeTeamKey, match).gf),
    previousHomeUse.map((match) => goalsForAgainst(fixture.homeTeamKey, match).gf),
    previousSeasonWeight,
  );
  const recentHomeGA = weightedAverage(
    homeUse.map((match) => goalsForAgainst(fixture.homeTeamKey, match).ga),
    previousHomeUse.map((match) => goalsForAgainst(fixture.homeTeamKey, match).ga),
    previousSeasonWeight,
  );
  const recentAwayGF = weightedAverage(
    awayUse.map((match) => goalsForAgainst(fixture.awayTeamKey, match).gf),
    previousAwayUse.map((match) => goalsForAgainst(fixture.awayTeamKey, match).gf),
    previousSeasonWeight,
  );
  const recentAwayGA = weightedAverage(
    awayUse.map((match) => goalsForAgainst(fixture.awayTeamKey, match).ga),
    previousAwayUse.map((match) => goalsForAgainst(fixture.awayTeamKey, match).ga),
    previousSeasonWeight,
  );

  return {
    leagueHomeGoals,
    leagueAwayGoals,
    seasonHomeGF: average(homeSeasonVenue.map((match) => match.homeGoals)),
    seasonHomeGA: average(homeSeasonVenue.map((match) => match.awayGoals)),
    seasonAwayGF: average(awaySeasonVenue.map((match) => match.awayGoals)),
    seasonAwayGA: average(awaySeasonVenue.map((match) => match.homeGoals)),
    recentHomeGF: recentHomeGF == null ? [] : [recentHomeGF],
    recentHomeGA: recentHomeGA == null ? [] : [recentHomeGA],
    recentAwayGF: recentAwayGF == null ? [] : [recentAwayGF],
    recentAwayGA: recentAwayGA == null ? [] : [recentAwayGA],
    coverage: {
      priorLeagueMatches: history.length,
      priorHomeTeamMatches: homeLast.length,
      priorAwayTeamMatches: awayLast.length,
      priorHomeVenueMatches: homeSeasonVenue.length,
      priorAwayVenueMatches: awaySeasonVenue.length,
      previousSeasonHomeMatches: previousHomeLast.length,
      previousSeasonAwayMatches: previousAwayLast.length,
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
  const previousSeasonWeight = Number.isFinite(options.previousSeasonWeight)
    ? Math.max(0, Math.min(1, options.previousSeasonWeight))
    : 0;
  const priorFixtures = Array.isArray(options.priorFixtures)
    ? options.priorFixtures
    : [];
  const groups = new Map();
  const priorGroups = new Map();

  fixtures.forEach((fixture) => {
    const key = `${fixture.leagueKey}|${fixture.season}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fixture);
  });
  priorFixtures.forEach((fixture) => {
    const key = `${fixture.leagueKey}|${fixture.season}`;
    if (!priorGroups.has(key)) priorGroups.set(key, []);
    priorGroups.get(key).push(fixture);
  });

  const predictions = [];
  for (const [competitionKey, group] of groups) {
    const ordered = [...group].sort((left, right) =>
      left.timestamp - right.timestamp || left.sourceRow - right.sourceRow);
    const history = [];
    const target = ordered[0];
    const previousSeasonKey =
      Number.isFinite(Number(target.season))
        ? `${target.leagueKey}|${Number(target.season) - 1}`
        : "";
    const previousSeasonHistory = (priorGroups.get(previousSeasonKey) || [])
      .filter((match) => match.timestamp < target.timestamp)
      .sort((left, right) => left.timestamp - right.timestamp);

    for (let index = 0; index < ordered.length;) {
      const timestamp = ordered[index].timestamp;
      const batch = [];
      while (index < ordered.length && ordered[index].timestamp === timestamp) {
        batch.push(ordered[index]);
        index += 1;
      }

      const batchPredictions = batch.map((fixture) => {
        const features = buildFeatures(
          history,
          fixture,
          recentMatches,
          previousSeasonHistory,
          previousSeasonWeight,
        );
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
    settings: {
      recentMatches,
      minLeagueMatches,
      minTeamMatches,
      previousSeasonWeight,
      sameKickoffBatching: true,
    },
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
