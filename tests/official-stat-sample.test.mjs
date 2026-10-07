import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const shared = read("js/features/panelsShared.js");
const corners = read("js/features/cornersPanel.js");
const shots = read("js/features/shotsPanel.js");
const fouls = read("js/features/foulsPanel.js");
const indicators = read("js/features/indicatorsPanel.js");

const block = shared.match(
  /function isFriendlyFixture\(fixtureRow\)[\s\S]*?(?=\/\* =========================\r?\n   CACHE: EVENTS per fixture)/,
);
assert.ok(block, "Helper fixture ufficiali non trovato.");

let requestedUrl = "";
const context = vm.createContext({
  String,
  Number,
  Math,
  Array,
  apiGet: async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      errors: null,
      arr: [
        { fixture: { id: 1 }, league: { name: "Friendlies Clubs" } },
        { fixture: { id: 2 }, league: { name: "Serie A" } },
        { fixture: { id: 3 }, league: { name: "UEFA Champions League" } },
        { fixture: { id: 4 }, league: { name: "Club Friendlies Women" } },
        { fixture: { id: 5 }, league: { name: "Coppa Italia" } },
        { fixture: { id: 6 }, league: { name: "Serie A" } },
        { fixture: { id: 7 }, league: { name: "Serie A" } },
      ],
    };
  },
});

vm.runInContext(block[0], context);
const fetchCandidates = vm.runInContext("fetchTeamStatCandidates", context);
const result = await fetchCandidates(123, 5);

assert.match(requestedUrl, /last=15/);
assert.deepEqual(
  Array.from(result, (x) => x.fixture.id),
  [2, 3, 5, 6, 7],
  "Le amichevoli devono essere escluse dal campione statistico.",
);

for (const [name, source] of [
  ["corners", corners],
  ["shots", shots],
  ["fouls", fouls],
  ["indicators", indicators],
]) {
  assert.match(
    source,
    /fetchTeamStatCandidates/,
    `${name} non usa il campione di gare ufficiali.`,
  );
}

assert.match(
  corners,
  /if \(perFixture\.length >= limit\) break;/,
  "Corner non continua finché raggiunge N gare valide.",
);
assert.match(
  shots,
  /if \(perFixture\.length >= limit\) break;/,
  "Tiri non continua finché raggiunge N gare valide.",
);
assert.match(
  fouls,
  /if \(n >= limit\) break;/,
  "Falli non continua finché raggiunge N gare valide.",
);
assert.match(
  indicators,
  /if \(cornersMap\) \{/,
  "Il bookmaker Indicatori non gestisce correttamente statistiche corner mancanti.",
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      feature: "official-stat-sample",
      friendliesExcluded: true,
      requestedFiveUsesLookback: 15,
    },
    null,
    2,
  ),
);
