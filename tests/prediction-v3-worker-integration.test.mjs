import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workerSource = readFileSync(
  new URL("../worker/worker.js", import.meta.url),
  "utf8",
);

[
  "const DYNAMIC_SERIE_A_LEAGUE_ID = 135;",
  "learningRate: 0.075,",
  "seasonCarry: 0.65,",
  "ratingShrinkage: 0.002,",
  "residualCap: 2.5,",
  "maxLogStrength: 0.8,",
  'name: "poisson_v1_6_dc_dynamic_team_strength"',
  "const TTL_PREVIOUS_SEASON = 7 * 24 * 3600;",
  "const TTL_CURRENT_SEASON = 10 * 60;",
  "Number(leagueId) === DYNAMIC_SERIE_A_LEAGUE_ID",
  'name: "poisson_v1_3_dc_cached"',
].forEach((fragment) => {
  assert.ok(
    workerSource.includes(fragment),
    `Worker v3 contract changed: missing ${fragment}`,
  );
});

const algorithmStart = workerSource.indexOf(
  "const DYNAMIC_SERIE_A_LEAGUE_ID = 135;",
);
const algorithmEnd = workerSource.indexOf(
  "/* =========================",
  algorithmStart,
);
assert.ok(algorithmStart >= 0 && algorithmEnd > algorithmStart);

const algorithm = new Function(
  `${workerSource.slice(algorithmStart, algorithmEnd)}
  return {
    calculateDynamicSerieAPrediction,
    settings: DYNAMIC_STRENGTH_SETTINGS,
  };`,
)();

function fixture(id, date, homeId, awayId, homeGoals, awayGoals) {
  return {
    fixture: { id, date },
    teams: { home: { id: homeId }, away: { id: awayId } },
    goals: { home: homeGoals, away: awayGoals },
  };
}

const previousFixtures = [
  fixture(1, "2024-08-01T18:00:00Z", 1, 3, 4, 0),
  fixture(2, "2024-08-02T18:00:00Z", 4, 2, 0, 3),
  fixture(3, "2024-08-08T18:00:00Z", 1, 4, 3, 0),
  fixture(4, "2024-08-09T18:00:00Z", 3, 2, 0, 2),
];
const currentFixtures = [
  fixture(11, "2025-08-01T18:00:00Z", 1, 4, 2, 0),
  fixture(12, "2025-08-01T18:00:00Z", 3, 2, 0, 1),
  fixture(13, "2025-08-08T18:00:00Z", 3, 1, 1, 2),
  fixture(14, "2025-08-08T18:00:00Z", 2, 4, 2, 0),
];
const futureFixture = fixture(
  99,
  "2025-10-01T18:00:00Z",
  1,
  2,
  0,
  9,
);
const targetTimestamp = Date.parse("2025-09-01T18:00:00Z");
const input = {
  previousFixtures,
  currentFixtures,
  targetTimestamp,
  homeTeamId: 1,
  awayTeamId: 2,
};

const result = algorithm.calculateDynamicSerieAPrediction(input);
const reordered = algorithm.calculateDynamicSerieAPrediction({
  ...input,
  previousFixtures: [...previousFixtures].reverse(),
  currentFixtures: [...currentFixtures].reverse(),
});
const withFuture = algorithm.calculateDynamicSerieAPrediction({
  ...input,
  currentFixtures: [...currentFixtures, futureFixture],
});
const withoutPreviousSeason = algorithm.calculateDynamicSerieAPrediction({
  ...input,
  previousFixtures: [],
});

for (const side of ["home", "away"]) {
  assert.ok(Number.isFinite(result.expectedGoals[side]));
  assert.ok(result.expectedGoals[side] >= 0.2);
  assert.ok(result.expectedGoals[side] <= 3.2);
  assert.ok(
    Math.abs(result.expectedGoals[side] - reordered.expectedGoals[side]) <
      1e-12,
    `Same-kickoff ordering changed ${side} expected goals`,
  );
  assert.equal(
    result.expectedGoals[side],
    withFuture.expectedGoals[side],
    `A future result leaked into ${side} expected goals`,
  );
}

assert.notDeepEqual(
  result.expectedGoals,
  withoutPreviousSeason.expectedGoals,
  "Previous-season carry must influence the dynamic state",
);
assert.equal(result.coverage.homeMatches, 2);
assert.equal(result.coverage.awayMatches, 2);
assert.equal(result.coverage.leagueMatches, 4);
assert.equal(result.coverage.previousHomeMatches, 2);
assert.equal(result.coverage.previousAwayMatches, 2);
assert.equal(result.coverage.trainingMatches, 8);
assert.equal(
  result.coverage.sufficient,
  false,
  "Previous-season history must not create a false early-season signal",
);

assert.deepEqual(
  algorithm.settings,
  {
    learningRate: 0.075,
    seasonCarry: 0.65,
    ratingShrinkage: 0.002,
    residualCap: 2.5,
    maxLogStrength: 0.8,
    fallbackHomeGoals: 1.25,
    fallbackAwayGoals: 1.05,
  },
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      serieAGate: 135,
      expectedGoals: result.expectedGoals,
      sameKickoffOrderInvariant: true,
      futureResultsExcluded: true,
      previousSeasonCarryActive: true,
      earlySeasonSignalGuarded: true,
      otherCompetitionsUseLegacyModel: true,
    },
    null,
    2,
  ),
);
