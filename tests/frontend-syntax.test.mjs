import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");

const scripts = [
  ...html.matchAll(/<script\s+src="([^"]+\.js)(?:\?v=[^"]+)?"[^>]*><\/script>/g),
].map((match) => match[1]);

assert.ok(scripts.length > 0, "Nessuno script frontend trovato in index.html.");

for (const path of scripts) {
  const source = readFileSync(resolve(root, path), "utf8");
  assert.doesNotThrow(
    () => new vm.Script(source, { filename: path }),
    `Errore di sintassi JavaScript in ${path}`,
  );
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      feature: "frontend-syntax",
      scriptsParsed: scripts.length,
    },
    null,
    2,
  ),
);
