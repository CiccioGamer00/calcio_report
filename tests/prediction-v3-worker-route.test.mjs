import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "../worker/worker.js";

function fixture(id, date, homeId, awayId, homeGoals, awayGoals) {
  return {
    fixture: { id, date },
    league: { id: 135, season: 2025 },
    teams: {
      home: { id: homeId, name: `Team ${homeId}` },
      away: { id: awayId, name: `Team ${awayId}` },
    },
    goals: { home: homeGoals, away: awayGoals },
  };
}

const target = fixture(
  777,
  "2025-09-01T18:00:00Z",
  1,
  2,
  null,
  null,
);
const previous = [
  fixture(1, "2024-08-01T18:00:00Z", 1, 3, 3, 0),
  fixture(2, "2024-08-02T18:00:00Z", 4, 2, 0, 2),
  fixture(3, "2024-08-08T18:00:00Z", 1, 4, 2, 0),
  fixture(4, "2024-08-09T18:00:00Z", 3, 2, 0, 1),
];
const current = [
  fixture(11, "2025-08-01T18:00:00Z", 1, 4, 2, 0),
  fixture(12, "2025-08-01T18:00:00Z", 3, 2, 0, 1),
  fixture(13, "2025-08-08T18:00:00Z", 3, 1, 1, 2),
  fixture(14, "2025-08-08T18:00:00Z", 2, 4, 2, 0),
  fixture(15, "2025-08-15T18:00:00Z", 1, 2, null, null),
];

const upstreamRequests = [];
globalThis.caches = {
  default: {
    async match() {
      return null;
    },
    async put() {},
  },
};
globalThis.fetch = async (input) => {
  const url = new URL(input);
  upstreamRequests.push(`${url.pathname}${url.search}`);
  let response;
  if (url.searchParams.get("id") === "777") response = [target];
  else if (url.searchParams.get("season") === "2024") response = previous;
  else if (url.searchParams.get("season") === "2025") response = current;
  else throw new Error(`Unexpected relay request: ${url}`);

  return new Response(JSON.stringify({ response, errors: [] }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-cr-relay": "test",
    },
  });
};

const licenseSecret = "test-license-secret";
const body = Buffer.from(
  JSON.stringify({ email: "test@example.com", iat: Date.now() }),
).toString("base64url");
const signature = createHmac("sha256", licenseSecret)
  .update(body)
  .digest("base64url");
const token = `${body}.${signature}`;
const env = {
  LICENSE_SECRET: licenseSecret,
  CR_RELAY_URL: "https://relay.test",
  CR_RELAY_SECRET: "test-relay-secret",
  DB: {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return {
            trial_ends_at: Date.now() + 86_400_000,
            paid_until: 0,
            disabled: 0,
          };
        },
      };
    },
  },
};

const response = await worker.fetch(
  new Request("https://app.test/predict?fixture=777", {
    headers: { Authorization: `Bearer ${token}` },
  }),
  env,
  {},
);
const payload = await response.json();

assert.equal(response.status, 200);
assert.equal(payload.errors, null);
assert.equal(
  payload.response.model.name,
  "poisson_v1_6_dc_dynamic_team_strength",
);
assert.equal(payload.response.model.learningRate, 0.075);
assert.equal(payload.response.model.blend, 1);
assert.equal(payload.response.coverage.sufficient, false);
assert.equal(
  payload.response.coverage.leagueMatches,
  4,
  "Fixtures without a completed score must not become artificial 0-0 draws",
);
assert.equal(payload.response.confidence.score, null);
assert.ok(payload.response.confidence.signalScore >= 0);
assert.ok(payload.response.expectedGoals.home >= 0.2);
assert.ok(payload.response.expectedGoals.home <= 3.2);
assert.ok(payload.response.expectedGoals.away >= 0.2);
assert.ok(payload.response.expectedGoals.away <= 3.2);
assert.ok(
  Math.abs(
    Object.values(payload.response.probabilities).reduce(
      (sum, value) => sum + value,
      0,
    ) - 1,
  ) < 1e-12,
);
assert.equal(payload.response.topScorelines.length, 3);
assert.ok(
  payload.response.topScorelines.every(
    (item) => typeof item.score === "string" && Number.isFinite(item.p),
  ),
);
assert.equal(upstreamRequests.length, 3);
assert.equal(
  upstreamRequests.some(
    (path) => path.includes("/teams/statistics") || path.includes("last="),
  ),
  false,
  "The Serie A v3 route must not also execute legacy upstream calls",
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      model: payload.response.model.name,
      upstreamCalls: upstreamRequests.length,
      normalizedProbabilities: true,
      falseEarlySignalPrevented: true,
      legacyCallsSkippedForSerieA: true,
    },
    null,
    2,
  ),
);
