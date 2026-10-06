import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const shared = read("js/features/panelsShared.js");
const shots = read("js/features/shotsPanel.js");
const fouls = read("js/features/foulsPanel.js");
const indicators = read("js/features/indicatorsPanel.js");

assert.match(
  shared,
  /async function getFixtureStatisticsRowsCached\(fixtureId\)/,
  "Helper condiviso per fixtures/statistics mancante.",
);
assert.match(
  shared,
  /__FIXTURE_STATS_ROWS_INFLIGHT__/,
  "Deduplicazione delle richieste simultanee mancante.",
);

for (const [name, source] of [
  ["shots", shots],
  ["fouls", fouls],
  ["indicators", indicators],
]) {
  assert.match(
    source,
    /getFixtureStatisticsRowsCached\(fixtureId\)/,
    `${name} non usa la cache condivisa delle statistiche.`,
  );
  assert.doesNotMatch(
    source,
    /apiGet\(\`\/fixtures\/statistics\?fixture=/,
    `${name} contiene ancora una chiamata diretta duplicabile a fixtures/statistics.`,
  );
}

const blockMatch = shared.match(
  /const __FIXTURE_STATS_ROWS_CACHE__[\s\S]*?(?=\/\* =========================\r?\n   CORNERS per fixture teams)/,
);
assert.ok(blockMatch, "Impossibile isolare il blocco della cache condivisa.");

let calls = 0;
let failOnce = true;
const context = vm.createContext({
  Map,
  Array,
  apiGet: async (url) => {
    calls += 1;

    if (url.includes("fixture=99") && failOnce) {
      failOnce = false;
      return { ok: false, errors: { upstream: "temporary" }, arr: [] };
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      ok: true,
      errors: null,
      arr: [
        { team: { id: 1 }, statistics: [{ type: "Total Shots", value: 10 }] },
        { team: { id: 2 }, statistics: [{ type: "Total Shots", value: 8 }] },
      ],
    };
  },
  setTimeout,
});

vm.runInContext(blockMatch[0], context);
const getRows = vm.runInContext("getFixtureStatisticsRowsCached", context);

const [first, second] = await Promise.all([getRows(42), getRows(42)]);
assert.equal(calls, 1, "Due richieste simultanee alla stessa fixture non sono state deduplicate.");
assert.equal(first.length, 2);
assert.equal(second.length, 2);

await getRows(42);
assert.equal(calls, 1, "Una fixture già risolta non è stata riusata dalla cache di sessione.");

const failed = await getRows(99);
assert.deepEqual(Array.from(failed), []);
assert.equal(calls, 2);

const retried = await getRows(99);
assert.equal(retried.length, 2);
assert.equal(calls, 3, "Un errore upstream è stato memorizzato impedendo il retry.");

console.log(
  JSON.stringify(
    {
      status: "PASS",
      feature: "shared-fixture-statistics-cache",
      concurrentRequestsForSameFixture: 1,
      cachedErrors: false,
    },
    null,
    2,
  ),
);
