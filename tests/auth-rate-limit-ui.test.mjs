import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");

const match = source.match(
  /function authErrorMessage\(res, fallback\) \{[\s\S]*?\n\}/,
);
assert.ok(match, "authErrorMessage deve esistere.");

const authErrorMessage = vm.runInNewContext(
  `(${match[0]})`,
  { Number },
);

assert.equal(
  authErrorMessage({ status: 429, json: {} }, "Errore login."),
  "Troppi tentativi. Riprova tra qualche secondo.",
);
assert.equal(
  authErrorMessage(
    { status: 401, json: { message: "Credenziali errate." } },
    "Errore login.",
  ),
  "Credenziali errate.",
);
assert.equal(
  authErrorMessage({ status: 500, json: {} }, "Errore login."),
  "Errore login.",
);

assert.match(
  source,
  /setAuthMsg\(authErrorMessage\(res, "Errore login\."\)\);/,
);
assert.match(
  source,
  /setAuthMsg\(authErrorMessage\(res, "Errore registrazione\."\)\);/,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      feature: "auth-rate-limit-ui",
      rateLimitMessage: true,
      loginCovered: true,
      registerCovered: true,
    },
    null,
    2,
  ),
);
