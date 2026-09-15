import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const references = [
  ...html.matchAll(
    /(?:src|href)="([^"]+\.(?:js|css))\?v=([^"]+)"/g,
  ),
].map((match) => ({ path: match[1], version: match[2] }));

assert.ok(references.length > 0, "Nessun asset locale versionato trovato.");

const versions = new Set(references.map((item) => item.version));
assert.deepEqual(
  [...versions],
  ["20260915r1"],
  "Tutti gli asset del release candidate devono avere la stessa versione.",
);

for (const reference of references) {
  assert.ok(
    existsSync(resolve(root, reference.path)),
    `Asset mancante: ${reference.path}`,
  );
}

const duplicatePaths = references
  .map((item) => item.path)
  .filter((path, index, all) => all.indexOf(path) !== index);
assert.deepEqual(duplicatePaths, [], "Uno stesso asset è incluso più volte.");

console.log(
  JSON.stringify(
    {
      status: "PASS",
      releaseVersion: [...versions][0],
      assets: references.length,
    },
    null,
    2,
  ),
);
