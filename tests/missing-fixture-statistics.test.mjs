import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const shared = read("js/features/panelsShared.js");
const shots = read("js/features/shotsPanel.js");
const fouls = read("js/features/foulsPanel.js");
const corners = read("js/features/cornersPanel.js");
const indicators = read("js/features/indicatorsPanel.js");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Funzione ${name} non trovata.`);

  let depth = 0;
  let opened = false;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
      opened = true;
    } else if (source[i] === "}") {
      depth--;
      if (opened && depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`Funzione ${name} non chiusa.`);
}

const cornerNormalize = vm.runInNewContext(
  `(${extractFunction(shared, "normalizeCornersStats")})`,
  { Map, Number, String },
);
const shotNormalize = vm.runInNewContext(
  `(${extractFunction(shots, "normalizeStats")})`,
  { Map, Number, String, Boolean },
);
const foulNormalize = vm.runInNewContext(
  `(${extractFunction(fouls, "normalizeFouls")})`,
  { Map, Number, String, Boolean },
);

assert.equal(cornerNormalize([]).corners, null);
assert.equal(
  cornerNormalize([{ type: "Corner Kicks", value: 0 }]).corners,
  0,
  "Uno zero realmente fornito dall'API deve restare zero.",
);

assert.equal(shotNormalize([]).total, null);
assert.equal(shotNormalize([]).onTarget, null);
assert.equal(
  shotNormalize([
    { type: "Total Shots", value: 0 },
    { type: "Shots on Goal", value: 0 },
  ]).total,
  0,
);

assert.equal(foulNormalize([]).fouls, null);
assert.equal(foulNormalize([{ type: "Fouls", value: 0 }]).fouls, 0);

assert.match(
  corners,
  /if \(!map\) \{[\s\S]*?missingStats\+\+;[\s\S]*?continue;/,
  "Corner deve escludere le fixture senza statistiche.",
);
assert.match(
  shots,
  /if \(!map\) \{[\s\S]*?missingStats\+\+;[\s\S]*?continue;/,
  "Tiri deve escludere le fixture senza statistiche.",
);
assert.match(
  fouls,
  /const map = await getFoulsForFixtureTeams[\s\S]*?if \(!map\) continue;/,
  "Falli deve escludere le fixture senza statistiche.",
);
assert.match(
  indicators,
  /function avgOrNull\(arr\)/,
  "Indicatori deve preservare l'assenza di copertura.",
);
assert.match(
  indicators,
  /avgCorners: avgOrNull\(cornersFor\)/,
);
assert.match(
  indicators,
  /avgShotsFor: avgOrNull\(shotsFor\)/,
);
assert.match(
  indicators,
  /avgFoulsFor: avgOrNull\(foulsFor\)/,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      feature: "missing-fixture-statistics",
      missingIsZero: false,
      realZeroPreserved: true,
    },
    null,
    2,
  ),
);
