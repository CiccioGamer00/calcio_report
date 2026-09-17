import { runBacktest } from "../backtest.mjs";
import { predictFromExpectedGoals } from "./poisson-dc-v1.mjs";

export const ELO_OPPONENT_DEFAULTS = Object.freeze({
  initialRating: 1500,
  kFactor: 20,
  homeAdvantage: 65,
  seasonCarry: 0.75,
  strengthCoefficient: 0,
  maxRatingDifference: 400,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function ratingFor(ratings, teamKey, initialRating) {
  return ratings.has(teamKey) ? ratings.get(teamKey) : initialRating;
}

function expectedHomeScore(homeRating, awayRating, homeAdvantage) {
  return 1 / (
    1 + Math.pow(10, (awayRating - homeRating - homeAdvantage) / 400)
  );
}

function actualHomeScore(fixture) {
  if (fixture.homeGoals > fixture.awayGoals) return 1;
  if (fixture.homeGoals < fixture.awayGoals) return 0;
  return 0.5;
}

function updateRatings(ratings, fixtures, settings) {
  const changes = new Map();

  for (const fixture of fixtures) {
    const homeRating = ratingFor(
      ratings,
      fixture.homeTeamKey,
      settings.initialRating,
    );
    const awayRating = ratingFor(
      ratings,
      fixture.awayTeamKey,
      settings.initialRating,
    );
    const expected = expectedHomeScore(
      homeRating,
      awayRating,
      settings.homeAdvantage,
    );
    const change = settings.kFactor * (actualHomeScore(fixture) - expected);
    changes.set(
      fixture.homeTeamKey,
      (changes.get(fixture.homeTeamKey) || 0) + change,
    );
    changes.set(
      fixture.awayTeamKey,
      (changes.get(fixture.awayTeamKey) || 0) - change,
    );
  }

  for (const [teamKey, change] of changes) {
    ratings.set(
      teamKey,
      ratingFor(ratings, teamKey, settings.initialRating) + change,
    );
  }
}

function replayFixtures(fixtures, settings) {
  const ratingsByLeague = new Map();
  const ordered = [...fixtures].sort(
    (left, right) =>
      left.timestamp - right.timestamp || left.sourceRow - right.sourceRow,
  );

  for (let index = 0; index < ordered.length;) {
    const timestamp = ordered[index].timestamp;
    const batch = [];
    while (index < ordered.length && ordered[index].timestamp === timestamp) {
      batch.push(ordered[index]);
      index += 1;
    }

    const byLeague = new Map();
    for (const fixture of batch) {
      if (!byLeague.has(fixture.leagueKey))
        byLeague.set(fixture.leagueKey, []);
      byLeague.get(fixture.leagueKey).push(fixture);
    }
    for (const [leagueKey, leagueBatch] of byLeague) {
      if (!ratingsByLeague.has(leagueKey))
        ratingsByLeague.set(leagueKey, new Map());
      updateRatings(ratingsByLeague.get(leagueKey), leagueBatch, settings);
    }
  }

  return ratingsByLeague;
}

function regressRatings(ratingsByLeague, settings) {
  for (const ratings of ratingsByLeague.values()) {
    for (const [teamKey, rating] of ratings) {
      ratings.set(
        teamKey,
        settings.initialRating +
          (rating - settings.initialRating) * settings.seasonCarry,
      );
    }
  }
}

function adjustPrediction(basePrediction, ratingDifference, settings) {
  const safeDifference = clamp(
    ratingDifference,
    -settings.maxRatingDifference,
    settings.maxRatingDifference,
  );
  const multiplier = Math.exp(
    settings.strengthCoefficient * safeDifference / 400,
  );
  const prediction = predictFromExpectedGoals({
    home: basePrediction.expectedGoals.home * multiplier,
    away: basePrediction.expectedGoals.away / multiplier,
  });
  prediction.model = "poisson_v1_4_dc_elo_opponent";
  prediction.diagnostics = {
    ...prediction.diagnostics,
    baseExpectedGoals: { ...basePrediction.expectedGoals },
    eloRatingDifference: ratingDifference,
    eloMultiplier: multiplier,
  };
  return prediction;
}

export function runOpponentStrengthBacktest(fixtures, options = {}) {
  if (!Array.isArray(fixtures) || fixtures.length === 0)
    throw new Error("Il dataset target non contiene partite.");
  const settings = {
    ...ELO_OPPONENT_DEFAULTS,
    ...Object.fromEntries(
      Object.entries(options).filter(([, value]) => Number.isFinite(value)),
    ),
  };
  settings.seasonCarry = clamp(settings.seasonCarry, 0, 1);
  settings.strengthCoefficient = Math.max(
    0,
    Number(settings.strengthCoefficient) || 0,
  );

  const priorFixtures = Array.isArray(options.priorFixtures)
    ? options.priorFixtures
    : [];
  const firstTargetTimestamp = Math.min(
    ...fixtures.map((fixture) => fixture.timestamp),
  );
  const safePriorFixtures = priorFixtures.filter(
    (fixture) => fixture.timestamp < firstTargetTimestamp,
  );
  const baseReport = runBacktest(fixtures, {
    recentMatches: options.recentMatches,
    minLeagueMatches: options.minLeagueMatches,
    minTeamMatches: options.minTeamMatches,
    priorFixtures: safePriorFixtures,
    previousSeasonWeight: options.previousSeasonWeight,
  });
  const ratingsByLeague = replayFixtures(safePriorFixtures, settings);
  regressRatings(ratingsByLeague, settings);

  const predictions = [];
  const ordered = [...baseReport.predictions].sort(
    (left, right) =>
      left.fixture.timestamp - right.fixture.timestamp ||
      left.fixture.sourceRow - right.fixture.sourceRow,
  );

  for (let index = 0; index < ordered.length;) {
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
      const { fixture } = item;
      if (!ratingsByLeague.has(fixture.leagueKey))
        ratingsByLeague.set(fixture.leagueKey, new Map());
      const ratings = ratingsByLeague.get(fixture.leagueKey);
      const homeRating = ratingFor(
        ratings,
        fixture.homeTeamKey,
        settings.initialRating,
      );
      const awayRating = ratingFor(
        ratings,
        fixture.awayTeamKey,
        settings.initialRating,
      );
      const ratingDifference = homeRating - awayRating;
      predictions.push({
        ...item,
        prediction: adjustPrediction(
          item.prediction,
          ratingDifference,
          settings,
        ),
        opponentStrength: {
          homeRating,
          awayRating,
          ratingDifference,
        },
      });
    }

    const byLeague = new Map();
    for (const item of batch) {
      const { fixture } = item;
      if (!byLeague.has(fixture.leagueKey))
        byLeague.set(fixture.leagueKey, []);
      byLeague.get(fixture.leagueKey).push(fixture);
    }
    for (const [leagueKey, leagueBatch] of byLeague) {
      updateRatings(ratingsByLeague.get(leagueKey), leagueBatch, settings);
    }
  }

  predictions.sort(
    (left, right) =>
      left.fixture.timestamp - right.fixture.timestamp ||
      left.fixture.sourceRow - right.fixture.sourceRow,
  );

  return {
    generatedAt: new Date().toISOString(),
    settings: {
      ...baseReport.settings,
      initialRating: settings.initialRating,
      eloKFactor: settings.kFactor,
      eloHomeAdvantage: settings.homeAdvantage,
      eloSeasonCarry: settings.seasonCarry,
      strengthCoefficient: settings.strengthCoefficient,
      maxRatingDifference: settings.maxRatingDifference,
      priorFixturesUsed: safePriorFixtures.length,
      sameKickoffEloBatching: true,
    },
    coverage: baseReport.coverage,
    predictions,
  };
}
