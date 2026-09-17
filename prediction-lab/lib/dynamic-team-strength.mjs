import {
  runBacktest,
  summarizePredictions,
} from "../backtest.mjs";
import { predictFromExpectedGoals } from "./poisson-dc-v1.mjs";

export const DYNAMIC_TEAM_STRENGTH_DEFAULTS = Object.freeze({
  learningRate: 0.05,
  blend: 0.5,
  seasonCarry: 0.65,
  ratingShrinkage: 0.002,
  residualCap: 2.5,
  maxLogStrength: 0.8,
  fallbackLeagueHomeGoals: 1.25,
  fallbackLeagueAwayGoals: 1.05,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function average(values, fallback) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return fallback;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function stateFor(states, leagueKey) {
  if (!states.has(leagueKey)) {
    states.set(leagueKey, { teams: new Map(), history: [] });
  }
  return states.get(leagueKey);
}

function teamFor(state, teamKey) {
  if (!state.teams.has(teamKey)) {
    state.teams.set(teamKey, { attack: 0, defence: 0 });
  }
  return state.teams.get(teamKey);
}

function rollingLeagueBase(state, settings) {
  const recent = state.history.slice(-50);
  return {
    home: average(
      recent.map((fixture) => fixture.homeGoals),
      settings.fallbackLeagueHomeGoals,
    ),
    away: average(
      recent.map((fixture) => fixture.awayGoals),
      settings.fallbackLeagueAwayGoals,
    ),
  };
}

function expectedFromState(state, fixture, base, settings) {
  const home = teamFor(state, fixture.homeTeamKey);
  const away = teamFor(state, fixture.awayTeamKey);
  return {
    home: clamp(
      base.home * Math.exp(home.attack + away.defence),
      0.2,
      3.2,
    ),
    away: clamp(
      base.away * Math.exp(away.attack + home.defence),
      0.2,
      3.2,
    ),
    strengths: {
      homeAttack: home.attack,
      homeDefence: home.defence,
      awayAttack: away.attack,
      awayDefence: away.defence,
    },
  };
}

function recenterAndClamp(state, settings) {
  const teams = [...state.teams.values()];
  if (!teams.length) return;
  const meanAttack = average(teams.map((team) => team.attack), 0);
  const meanDefence = average(teams.map((team) => team.defence), 0);
  for (const team of teams) {
    team.attack = clamp(
      team.attack - meanAttack,
      -settings.maxLogStrength,
      settings.maxLogStrength,
    );
    team.defence = clamp(
      team.defence - meanDefence,
      -settings.maxLogStrength,
      settings.maxLogStrength,
    );
  }
}

function updateBatch(state, entries, settings) {
  const changes = new Map();
  const changeFor = (teamKey) => {
    if (!changes.has(teamKey)) {
      changes.set(teamKey, { attack: 0, defence: 0 });
    }
    return changes.get(teamKey);
  };

  for (const { fixture, base } of entries) {
    const expected = expectedFromState(
      state,
      fixture,
      base ?? rollingLeagueBase(state, settings),
      settings,
    );
    const homeResidual = clamp(
      fixture.homeGoals - expected.home,
      -settings.residualCap,
      settings.residualCap,
    );
    const awayResidual = clamp(
      fixture.awayGoals - expected.away,
      -settings.residualCap,
      settings.residualCap,
    );
    changeFor(fixture.homeTeamKey).attack += homeResidual;
    changeFor(fixture.awayTeamKey).defence += homeResidual;
    changeFor(fixture.awayTeamKey).attack += awayResidual;
    changeFor(fixture.homeTeamKey).defence += awayResidual;
  }

  for (const team of state.teams.values()) {
    team.attack *= 1 - settings.ratingShrinkage;
    team.defence *= 1 - settings.ratingShrinkage;
  }
  for (const [teamKey, change] of changes) {
    const team = teamFor(state, teamKey);
    team.attack += settings.learningRate * change.attack;
    team.defence += settings.learningRate * change.defence;
  }
  recenterAndClamp(state, settings);
  state.history.push(...entries.map((entry) => entry.fixture));
}

function chronologicalBatches(fixtures) {
  const ordered = [...fixtures].sort(
    (left, right) =>
      left.timestamp - right.timestamp || left.sourceRow - right.sourceRow,
  );
  const batches = [];
  for (let index = 0; index < ordered.length;) {
    const timestamp = ordered[index].timestamp;
    const batch = [];
    while (index < ordered.length && ordered[index].timestamp === timestamp) {
      batch.push(ordered[index]);
      index += 1;
    }
    batches.push(batch);
  }
  return batches;
}

function replayPrior(states, fixtures, settings) {
  for (const batch of chronologicalBatches(fixtures)) {
    const byLeague = new Map();
    for (const fixture of batch) {
      if (!byLeague.has(fixture.leagueKey)) {
        byLeague.set(fixture.leagueKey, []);
      }
      byLeague.get(fixture.leagueKey).push(fixture);
    }
    for (const [leagueKey, leagueFixtures] of byLeague) {
      const state = stateFor(states, leagueKey);
      const base = rollingLeagueBase(state, settings);
      updateBatch(
        state,
        leagueFixtures.map((fixture) => ({ fixture, base })),
        settings,
      );
    }
  }
}

function regressForNewSeason(states, settings) {
  for (const state of states.values()) {
    for (const team of state.teams.values()) {
      team.attack *= settings.seasonCarry;
      team.defence *= settings.seasonCarry;
    }
    state.history = [];
  }
}

function geometricBlend(base, dynamic, blend) {
  const safeBase = Math.max(0.01, Number(base) || 0.01);
  const safeDynamic = Math.max(0.01, Number(dynamic) || 0.01);
  return Math.exp(
    (1 - blend) * Math.log(safeBase) + blend * Math.log(safeDynamic),
  );
}

export function runDynamicTeamStrengthBacktest(fixtures, options = {}) {
  if (!Array.isArray(fixtures) || !fixtures.length) {
    throw new Error("Il target deve contenere almeno una partita.");
  }
  const settings = {
    ...DYNAMIC_TEAM_STRENGTH_DEFAULTS,
    learningRate: clamp(
      options.learningRate ?? DYNAMIC_TEAM_STRENGTH_DEFAULTS.learningRate,
      0.001,
      0.25,
    ),
    blend: clamp(
      options.blend ?? DYNAMIC_TEAM_STRENGTH_DEFAULTS.blend,
      0,
      1,
    ),
    seasonCarry: clamp(
      options.seasonCarry ?? DYNAMIC_TEAM_STRENGTH_DEFAULTS.seasonCarry,
      0,
      1,
    ),
    ratingShrinkage: clamp(
      options.ratingShrinkage ??
        DYNAMIC_TEAM_STRENGTH_DEFAULTS.ratingShrinkage,
      0,
      0.1,
    ),
    residualCap: clamp(
      options.residualCap ?? DYNAMIC_TEAM_STRENGTH_DEFAULTS.residualCap,
      0.1,
      5,
    ),
    maxLogStrength: clamp(
      options.maxLogStrength ?? DYNAMIC_TEAM_STRENGTH_DEFAULTS.maxLogStrength,
      0.1,
      2,
    ),
    fallbackLeagueHomeGoals:
      DYNAMIC_TEAM_STRENGTH_DEFAULTS.fallbackLeagueHomeGoals,
    fallbackLeagueAwayGoals:
      DYNAMIC_TEAM_STRENGTH_DEFAULTS.fallbackLeagueAwayGoals,
  };
  const previousSeasonWeight = Number.isFinite(options.previousSeasonWeight)
    ? clamp(options.previousSeasonWeight, 0, 1)
    : 1;
  const firstTargetTimestamp = Math.min(
    ...fixtures.map((fixture) => fixture.timestamp),
  );
  const priorFixtures = Array.isArray(options.priorFixtures)
    ? options.priorFixtures
    : [];
  const safePriorFixtures = priorFixtures.filter(
    (fixture) => fixture.timestamp < firstTargetTimestamp,
  );

  const baseline = runBacktest(fixtures, {
    priorFixtures: safePriorFixtures,
    previousSeasonWeight,
    recentMatches: options.recentMatches,
    minLeagueMatches: options.minLeagueMatches,
    minTeamMatches: options.minTeamMatches,
  });
  const states = new Map();
  replayPrior(states, safePriorFixtures, settings);
  regressForNewSeason(states, settings);

  const predictions = [];
  for (const batch of chronologicalBatches(baseline.predictions.map(
    (item) => item.fixture,
  ))) {
    const items = batch.map((fixture) =>
      baseline.predictions.find((item) => item.fixture === fixture),
    );
    const updateEntries = new Map();
    for (const item of items) {
      const state = stateFor(states, item.fixture.leagueKey);
      const base = {
        home: item.features.leagueHomeGoals,
        away: item.features.leagueAwayGoals,
      };
      const dynamic = expectedFromState(
        state,
        item.fixture,
        base,
        settings,
      );
      const expectedGoals = {
        home: geometricBlend(
          item.prediction.expectedGoals.home,
          dynamic.home,
          settings.blend,
        ),
        away: geometricBlend(
          item.prediction.expectedGoals.away,
          dynamic.away,
          settings.blend,
        ),
      };
      const prediction = predictFromExpectedGoals(expectedGoals);
      prediction.model = "poisson_v1_6_dc_dynamic_team_strength";
      prediction.diagnostics = {
        ...prediction.diagnostics,
        baselineExpectedGoals: { ...item.prediction.expectedGoals },
        dynamicExpectedGoals: {
          home: dynamic.home,
          away: dynamic.away,
        },
        dynamicStrengths: dynamic.strengths,
        dynamicBlend: settings.blend,
        learningRate: settings.learningRate,
      };
      predictions.push({ ...item, prediction });
      if (!updateEntries.has(item.fixture.leagueKey)) {
        updateEntries.set(item.fixture.leagueKey, []);
      }
      updateEntries.get(item.fixture.leagueKey).push({
        fixture: item.fixture,
        base,
      });
    }
    for (const [leagueKey, entries] of updateEntries) {
      updateBatch(stateFor(states, leagueKey), entries, settings);
    }
  }

  predictions.sort(
    (left, right) =>
      left.fixture.timestamp - right.fixture.timestamp ||
      left.fixture.sourceRow - right.fixture.sourceRow,
  );
  const guardedPredictions = predictions.filter((item) => item.eligible);
  return {
    generatedAt: new Date().toISOString(),
    settings: {
      learningRate: settings.learningRate,
      blend: settings.blend,
      seasonCarry: settings.seasonCarry,
      ratingShrinkage: settings.ratingShrinkage,
      residualCap: settings.residualCap,
      maxLogStrength: settings.maxLogStrength,
      previousSeasonWeight,
      priorFixturesUsed: safePriorFixtures.length,
      sameKickoffBatching: true,
      adjustmentTarget: "latent_attack_and_defence",
    },
    coverage: baseline.coverage,
    legacy: summarizePredictions(predictions),
    guarded: summarizePredictions(guardedPredictions),
    predictions,
  };
}
