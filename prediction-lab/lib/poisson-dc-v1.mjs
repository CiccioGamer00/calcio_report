export const POISSON_DC_V1_DEFAULTS = Object.freeze({
  recentMatches: 10,
  seasonWeight: 0.7,
  recentWeight: 0.3,
  rho: -0.1,
  homeAdvantage: 1.07,
  minLambda: 0.2,
  maxLambda: 3.2,
  maxGoals: 5,
  fallbackLeagueHomeGoals: 1.25,
  fallbackLeagueAwayGoals: 1.05,
});

function average(values) {
  const finite = (values || []).filter(Number.isFinite);
  if (!finite.length) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  const number = Number(value) || 0;
  return Math.max(min, Math.min(max, number));
}

function poissonPmf(goals, lambda) {
  const safeLambda = Math.max(0, Number(lambda) || 0);
  let factorial = 1;
  for (let index = 2; index <= goals; index += 1) factorial *= index;
  return (
    (Math.exp(-safeLambda) * Math.pow(safeLambda, goals)) / factorial
  );
}

function dixonColesTau(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  if (homeGoals === 0 && awayGoals === 0)
    return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

export function predictPoissonDcV1(features, overrides = {}) {
  const settings = { ...POISSON_DC_V1_DEFAULTS, ...overrides };
  const rho = clamp(numberOrZero(settings.rho), -0.3, 0.3);

  const recentHomeGF = average(features.recentHomeGF);
  const recentHomeGA = average(features.recentHomeGA);
  const recentAwayGF = average(features.recentAwayGF);
  const recentAwayGA = average(features.recentAwayGA);

  const seasonHomeGF = numberOrZero(features.seasonHomeGF);
  const seasonHomeGA = numberOrZero(features.seasonHomeGA);
  const seasonAwayGF = numberOrZero(features.seasonAwayGF);
  const seasonAwayGA = numberOrZero(features.seasonAwayGA);

  const safeSeasonHomeGF =
    seasonHomeGF > 0 ? seasonHomeGF : recentHomeGF;
  const safeSeasonHomeGA =
    seasonHomeGA > 0 ? seasonHomeGA : recentHomeGA;
  const safeSeasonAwayGF =
    seasonAwayGF > 0 ? seasonAwayGF : recentAwayGF;
  const safeSeasonAwayGA =
    seasonAwayGA > 0 ? seasonAwayGA : recentAwayGA;

  const blendHomeGF =
    settings.seasonWeight * safeSeasonHomeGF +
    settings.recentWeight * recentHomeGF;
  const blendHomeGA =
    settings.seasonWeight * safeSeasonHomeGA +
    settings.recentWeight * recentHomeGA;
  const blendAwayGF =
    settings.seasonWeight * safeSeasonAwayGF +
    settings.recentWeight * recentAwayGF;
  const blendAwayGA =
    settings.seasonWeight * safeSeasonAwayGA +
    settings.recentWeight * recentAwayGA;

  const leagueHomeGoals =
    Number(features.leagueHomeGoals) > 0
      ? Number(features.leagueHomeGoals)
      : settings.fallbackLeagueHomeGoals;
  const leagueAwayGoals =
    Number(features.leagueAwayGoals) > 0
      ? Number(features.leagueAwayGoals)
      : settings.fallbackLeagueAwayGoals;

  const attackHome = blendHomeGF / leagueHomeGoals;
  const defenceAway = blendAwayGA / leagueHomeGoals;
  const attackAway = blendAwayGF / leagueAwayGoals;
  const defenceHome = blendHomeGA / leagueAwayGoals;

  let lambdaHome =
    leagueHomeGoals *
    attackHome *
    defenceAway *
    settings.homeAdvantage;
  let lambdaAway =
    leagueAwayGoals * attackAway * defenceHome;

  lambdaHome = clamp(lambdaHome, settings.minLambda, settings.maxLambda);
  lambdaAway = clamp(lambdaAway, settings.minLambda, settings.maxLambda);

  const homePmf = Array.from(
    { length: settings.maxGoals + 1 },
    (_, goals) => poissonPmf(goals, lambdaHome),
  );
  const awayPmf = Array.from(
    { length: settings.maxGoals + 1 },
    (_, goals) => poissonPmf(goals, lambdaAway),
  );

  let homeWinRaw = 0;
  let drawRaw = 0;
  let awayWinRaw = 0;
  let over25Raw = 0;
  let bttsYesRaw = 0;
  let matrixMass = 0;
  let negativeCellsBeforeClamp = 0;
  const scorelines = [];

  for (let homeGoals = 0; homeGoals <= settings.maxGoals; homeGoals += 1) {
    for (
      let awayGoals = 0;
      awayGoals <= settings.maxGoals;
      awayGoals += 1
    ) {
      const rawProbability =
        homePmf[homeGoals] *
        awayPmf[awayGoals] *
        dixonColesTau(
          homeGoals,
          awayGoals,
          lambdaHome,
          lambdaAway,
          rho,
        );

      if (rawProbability < 0) negativeCellsBeforeClamp += 1;
      const probability = Math.max(0, rawProbability);
      matrixMass += probability;

      if (homeGoals > awayGoals) homeWinRaw += probability;
      else if (homeGoals === awayGoals) drawRaw += probability;
      else awayWinRaw += probability;

      if (homeGoals + awayGoals >= 3) over25Raw += probability;
      if (homeGoals >= 1 && awayGoals >= 1) bttsYesRaw += probability;

      scorelines.push({
        homeGoals,
        awayGoals,
        score: `${homeGoals}-${awayGoals}`,
        probability,
      });
    }
  }

  const denominator = matrixMass > 0 ? matrixMass : 1;
  const probabilities = {
    homeWin: homeWinRaw / denominator,
    draw: drawRaw / denominator,
    awayWin: awayWinRaw / denominator,
  };

  const ordered1X2 = Object.values(probabilities).sort(
    (left, right) => right - left,
  );
  const confidenceEdge = Math.max(0, ordered1X2[0] - ordered1X2[1]);
  const confidenceScore = Math.round(
    clamp(confidenceEdge / 0.4, 0, 1) * 100,
  );

  scorelines.sort(
    (left, right) => right.probability - left.probability,
  );

  const independentMatrixMass =
    homePmf.reduce((sum, probability) => sum + probability, 0) *
    awayPmf.reduce((sum, probability) => sum + probability, 0);

  return {
    model: "poisson_v1_3_dc_cached",
    expectedGoals: { home: lambdaHome, away: lambdaAway },
    probabilities,
    confidence: {
      score: confidenceScore,
      edge: confidenceEdge,
    },
    extras: {
      over25: over25Raw / denominator,
      bttsYes: bttsYesRaw / denominator,
    },
    topScorelines: scorelines.slice(0, 3).map((item) => ({
      score: item.score,
      probability: item.probability / denominator,
    })),
    diagnostics: {
      matrixMass,
      independentMatrixMass,
      discardedIndependentTail: 1 - independentMatrixMass,
      negativeCellsBeforeClamp,
      sparseInput:
        !features.recentHomeGF?.length ||
        !features.recentAwayGF?.length,
    },
  };
}
