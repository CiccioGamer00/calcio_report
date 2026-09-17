import { runBacktest } from "../backtest.mjs";

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

function replayFixtures(
  fixtures,
  settings,
  ratingsByLeague = new Map(),
  snapshots = new WeakMap(),
) {
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
      const ratings = ratingsByLeague.get(leagueKey);
      for (const fixture of leagueBatch) {
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
        snapshots.set(fixture, {
          homeRating,
          awayRating,
          ratingDifference: homeRating - awayRating,
        });
      }
      updateRatings(ratings, leagueBatch, settings);
    }
  }

  return { ratingsByLeague, snapshots };
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

export function adjustGoalsByOpponentRating(values, options = {}) {
  const initialRating = Number.isFinite(options.initialRating)
    ? options.initialRating
    : ELO_OPPONENT_DEFAULTS.initialRating;
  const maxRatingDifference = Number.isFinite(options.maxRatingDifference)
    ? Math.max(0, options.maxRatingDifference)
    : ELO_OPPONENT_DEFAULTS.maxRatingDifference;
  const coefficient = Math.max(
    0,
    Number(options.strengthCoefficient) || 0,
  );
  const opponentDifference = clamp(
    Number(values?.opponentRating) - initialRating,
    -maxRatingDifference,
    maxRatingDifference,
  );
  const multiplier = Math.exp(coefficient * opponentDifference / 400);
  return {
    gf: Math.max(0, Number(values?.gf) || 0) * multiplier,
    ga: Math.max(0, Number(values?.ga) || 0) / multiplier,
    opponentDifference,
    multiplier,
  };
}

function createHistoryAdjuster(snapshots, settings) {
  return ({ teamKey, fixture, gf, ga }) => {
    const snapshot = snapshots.get(fixture);
    if (!snapshot) return { gf, ga };
    const opponentRating =
      fixture.homeTeamKey === teamKey
        ? snapshot.awayRating
        : snapshot.homeRating;
    return adjustGoalsByOpponentRating(
      { gf, ga, opponentRating },
      settings,
    );
  };
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

  const snapshots = new WeakMap();
  const replayedPrior = replayFixtures(
    safePriorFixtures,
    settings,
    new Map(),
    snapshots,
  );
  regressRatings(replayedPrior.ratingsByLeague, settings);
  replayFixtures(
    fixtures,
    settings,
    replayedPrior.ratingsByLeague,
    snapshots,
  );

  const baseReport = runBacktest(fixtures, {
    recentMatches: options.recentMatches,
    minLeagueMatches: options.minLeagueMatches,
    minTeamMatches: options.minTeamMatches,
    priorFixtures: safePriorFixtures,
    previousSeasonWeight: options.previousSeasonWeight,
    adjustTeamMatch: createHistoryAdjuster(snapshots, settings),
  });

  const predictions = baseReport.predictions.map((item) => {
    const snapshot = snapshots.get(item.fixture) || {
      homeRating: settings.initialRating,
      awayRating: settings.initialRating,
      ratingDifference: 0,
    };
    return {
      ...item,
      prediction: {
        ...item.prediction,
        model: "poisson_v1_5_dc_schedule_adjusted",
        diagnostics: {
          ...item.prediction.diagnostics,
          scheduleStrengthCoefficient: settings.strengthCoefficient,
        },
      },
      opponentStrength: snapshot,
    };
  });

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
      adjustmentTarget: "historical_goals_by_opponent_rating",
    },
    coverage: baseReport.coverage,
    predictions,
  };
}
