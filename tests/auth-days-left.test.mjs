import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../app.js", import.meta.url),
  "utf8",
);

const match = source.match(
  /function daysLeft\(ts, referenceNow = Date\.now\(\)\) \{[\s\S]*?\n\}/,
);
assert.ok(match, "La funzione daysLeft con orario di riferimento deve esistere.");

const daysLeft = vm.runInNewContext(
  `(${match[0]})`,
  { Date, Math, Number },
);

const day = 24 * 60 * 60 * 1000;
const serverNow = Date.UTC(2026, 8, 15, 17, 0, 0);

assert.equal(daysLeft(serverNow + 7 * day, serverNow), 7);
assert.equal(daysLeft(serverNow + 7 * day - 1, serverNow), 7);
assert.equal(daysLeft(serverNow, serverNow), 0);
assert.equal(daysLeft(serverNow - 1, serverNow), 0);

assert.match(source, /daysLeft\(paidUntil, now\)/);
assert.match(source, /daysLeft\(trialEndsAt, now\)/);
assert.match(
  source,
  /daysLeft\(json\.trialEndsAt, Number\(json\.now \|\| Date\.now\(\)\)\)/,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      exactSevenDays: daysLeft(serverNow + 7 * day, serverNow),
      serverClockUsed: true,
    },
    null,
    2,
  ),
);
