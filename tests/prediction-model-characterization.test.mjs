import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workerSource = readFileSync(
  new URL("../worker/worker.js", import.meta.url),
  "utf8",
);

[
  'name: "poisson_v1_3_dc_cached"',
  "const W_SEASON = 0.7;",
  "const W_RECENT = 0.3;",
  "const HOME_ADV = 1.07;",
  "const maxG = 5;",
  'url.searchParams.get("rho") || "-0.10"',
  "lambdaHome = clamp(lambdaHome, 0.2, 3.2);",
  "lambdaAway = clamp(lambdaAway, 0.2, 3.2);",
].forEach((fragment) => {
  assert.ok(
    workerSource.includes(fragment),
    `Worker prediction contract changed: missing ${fragment}`,
  );
});

function avg(nums) {
  const values = (nums || []).filter(Number.isFinite);
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function nOr0(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  const number = Number(value) || 0;
  return Math.max(min, Math.min(max, number));
}

function poissonPmf(k, lambda) {
  const safeLambda = Math.max(0, Number(lambda) || 0);
  let factorial = 1;
  for (let i = 2; i <= k; i += 1) factorial *= i;
  return (
    (Math.exp(-safeLambda) * Math.pow(safeLambda, k)) / factorial
  );
}

function tauDC(homeGoals, awayGoals, lambdaHome, lambdaAway, rho) {
  if (homeGoals === 0 && awayGoals === 0)
    return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

function characterize(input) {
  const recentHomeGF = avg(input.recentHomeGF);
  const recentHomeGA = avg(input.recentHomeGA);
  const recentAwayGF = avg(input.recentAwayGF);
  const recentAwayGA = avg(input.recentAwayGA);

  const seasonHomeGF = nOr0(input.seasonHomeGF);
  const seasonHomeGA = nOr0(input.seasonHomeGA);
  const seasonAwayGF = nOr0(input.seasonAwayGF);
  const seasonAwayGA = nOr0(input.seasonAwayGA);

  const safeSeasonHomeGF =
    seasonHomeGF > 0 ? seasonHomeGF : recentHomeGF;
  const safeSeasonHomeGA =
    seasonHomeGA > 0 ? seasonHomeGA : recentHomeGA;
  const safeSeasonAwayGF =
    seasonAwayGF > 0 ? seasonAwayGF : recentAwayGF;
  const safeSeasonAwayGA =
    seasonAwayGA > 0 ? seasonAwayGA : recentAwayGA;

  const blendHomeGF = 0.7 * safeSeasonHomeGF + 0.3 * recentHomeGF;
  const blendHomeGA = 0.7 * safeSeasonHomeGA + 0.3 * recentHomeGA;
  const blendAwayGF = 0.7 * safeSeasonAwayGF + 0.3 * recentAwayGF;
  const blendAwayGA = 0.7 * safeSeasonAwayGA + 0.3 * recentAwayGA;

  const leagueHomeGoals =
    input.leagueHomeGoals > 0 ? input.leagueHomeGoals : 1.25;
  const leagueAwayGoals =
    input.leagueAwayGoals > 0 ? input.leagueAwayGoals : 1.05;

  const attackHome = blendHomeGF / leagueHomeGoals;
  const defenceAway = blendAwayGA / leagueHomeGoals;
  const attackAway = blendAwayGF / leagueAwayGoals;
  const defenceHome = blendHomeGA / leagueAwayGoals;

  const lambdaHome = clamp(
    leagueHomeGoals * attackHome * defenceAway * 1.07,
    0.2,
    3.2,
  );
  const lambdaAway = clamp(
    leagueAwayGoals * attackAway * defenceHome,
    0.2,
    3.2,
  );
  const rho = clamp(
    Number.isFinite(input.rho) ? input.rho : -0.1,
    -0.3,
    0.3,
  );

  let homeWinRaw = 0;
  let drawRaw = 0;
  let awayWinRaw = 0;
  let sumMatrix = 0;
  let negativeCellsBeforeClamp = 0;
  const scorelines = [];

  for (let homeGoals = 0; homeGoals <= 5; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 5; awayGoals += 1) {
      const unboundedProbability =
        poissonPmf(homeGoals, lambdaHome) *
        poissonPmf(awayGoals, lambdaAway) *
        tauDC(homeGoals, awayGoals, lambdaHome, lambdaAway, rho);

      if (unboundedProbability < 0) negativeCellsBeforeClamp += 1;
      const probability = Math.max(0, unboundedProbability);
      sumMatrix += probability;

      if (homeGoals > awayGoals) homeWinRaw += probability;
      else if (homeGoals === awayGoals) drawRaw += probability;
      else awayWinRaw += probability;

      scorelines.push({
        score: `${homeGoals}-${awayGoals}`,
        probability,
      });
    }
  }

  const probabilities = {
    homeWin: homeWinRaw / sumMatrix,
    draw: drawRaw / sumMatrix,
    awayWin: awayWinRaw / sumMatrix,
  };
  scorelines.sort((left, right) => right.probability - left.probability);

  const ordered1X2 = Object.values(probabilities).sort(
    (left, right) => right - left,
  );
  const confidenceEdge = Math.max(0, ordered1X2[0] - ordered1X2[1]);
  const confidenceScore = Math.round(
    Math.max(0, Math.min(1, confidenceEdge / 0.4)) * 100,
  );

  const homeMass = Array.from({ length: 6 }, (_, goals) =>
    poissonPmf(goals, lambdaHome),
  ).reduce((sum, probability) => sum + probability, 0);
  const awayMass = Array.from({ length: 6 }, (_, goals) =>
    poissonPmf(goals, lambdaAway),
  ).reduce((sum, probability) => sum + probability, 0);

  return {
    lambdaHome,
    lambdaAway,
    probabilities,
    normalizedTotal:
      probabilities.homeWin + probabilities.draw + probabilities.awayWin,
    topScore: scorelines[0].score,
    topScoreProbability: scorelines[0].probability / sumMatrix,
    confidenceScore,
    truncatedIndependentMass: homeMass * awayMass,
    discardedIndependentTail: 1 - homeMass * awayMass,
    negativeCellsBeforeClamp,
  };
}

function assertValid(result) {
  assert.ok(Number.isFinite(result.lambdaHome));
  assert.ok(Number.isFinite(result.lambdaAway));
  assert.ok(result.lambdaHome >= 0.2 && result.lambdaHome <= 3.2);
  assert.ok(result.lambdaAway >= 0.2 && result.lambdaAway <= 3.2);
  Object.values(result.probabilities).forEach((probability) => {
    assert.ok(Number.isFinite(probability));
    assert.ok(probability >= 0 && probability <= 1);
  });
  assert.ok(Math.abs(result.normalizedTotal - 1) < 1e-12);
}

const noHistory = characterize({
  leagueHomeGoals: 1.25,
  leagueAwayGoals: 1.05,
  recentHomeGF: [],
  recentHomeGA: [],
  recentAwayGF: [],
  recentAwayGA: [],
  rho: -0.1,
});
assertValid(noHistory);
assert.equal(noHistory.lambdaHome, 0.2);
assert.equal(noHistory.lambdaAway, 0.2);
assert.equal(noHistory.topScore, "0-0");
assert.ok(noHistory.probabilities.draw > 0.70);
assert.ok(noHistory.topScoreProbability > 0.67);
assert.equal(noHistory.confidenceScore, 100);

const normal = characterize({
  leagueHomeGoals: 1.45,
  leagueAwayGoals: 1.15,
  seasonHomeGF: 1.8,
  seasonHomeGA: 0.9,
  seasonAwayGF: 1.25,
  seasonAwayGA: 1.6,
  recentHomeGF: [2, 1, 3, 1, 2],
  recentHomeGA: [1, 0, 1, 2, 1],
  recentAwayGF: [1, 2, 0, 1, 1],
  recentAwayGA: [2, 1, 1, 0, 2],
  rho: -0.1,
});
assertValid(normal);

const extreme = characterize({
  leagueHomeGoals: 1.4,
  leagueAwayGoals: 1.1,
  seasonHomeGF: 8,
  seasonHomeGA: 8,
  seasonAwayGF: 8,
  seasonAwayGA: 8,
  recentHomeGF: [8],
  recentHomeGA: [8],
  recentAwayGF: [8],
  recentAwayGA: [8],
  rho: -0.1,
});
assertValid(extreme);
assert.equal(extreme.lambdaHome, 3.2);
assert.equal(extreme.lambdaAway, 3.2);
assert.ok(extreme.discardedIndependentTail > 0.19);

const positiveRhoExtreme = characterize({
  leagueHomeGoals: 1.4,
  leagueAwayGoals: 1.1,
  seasonHomeGF: 8,
  seasonHomeGA: 8,
  seasonAwayGF: 8,
  seasonAwayGA: 8,
  recentHomeGF: [8],
  recentHomeGA: [8],
  recentAwayGF: [8],
  recentAwayGA: [8],
  rho: 0.3,
});
assertValid(positiveRhoExtreme);
assert.equal(positiveRhoExtreme.negativeCellsBeforeClamp, 1);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      noHistory,
      normal,
      extreme,
      positiveRhoExtreme,
    },
    null,
    2,
  ),
);
