import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";
import vm from "node:vm";

const source = readFileSync(
  new URL("../worker/worker.js", import.meta.url),
  "utf8",
);

// Parse dell'intero Worker come ES module.
const syntax = spawnSync(
  process.execPath,
  ["--input-type=module", "--check", "-"],
  { input: source, encoding: "utf8" },
);
assert.equal(
  syntax.status,
  0,
  `Errore di sintassi Worker:\n${syntax.stderr || syntax.stdout}`,
);

function extractFunction(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}(`);
  const asyncStart = sourceText.indexOf(`async function ${name}(`);
  const actualStart =
    asyncStart >= 0 && (start < 0 || asyncStart < start) ? asyncStart : start;

  assert.ok(actualStart >= 0, `Funzione ${name} non trovata.`);

  let depth = 0;
  let opened = false;
  for (let i = actualStart; i < sourceText.length; i++) {
    if (sourceText[i] === "{") {
      depth++;
      opened = true;
    } else if (sourceText[i] === "}") {
      depth--;
      if (opened && depth === 0) return sourceText.slice(actualStart, i + 1);
    }
  }

  throw new Error(`Funzione ${name} non chiusa.`);
}

const constants = {
  AUTH_SESSION_MS: Number(
    source.match(/const AUTH_SESSION_MS = 6 \* 60 \* 60 \* 1000;/)
      ? 6 * 60 * 60 * 1000
      : NaN,
  ),
  PASSWORD_PBKDF2_ITERATIONS: Number(
    source.match(/const PASSWORD_PBKDF2_ITERATIONS = (\d+);/)?.[1],
  ),
  PASSWORD_SALT_BYTES: Number(
    source.match(/const PASSWORD_SALT_BYTES = (\d+);/)?.[1],
  ),
  PASSWORD_HASH_BYTES: Number(
    source.match(/const PASSWORD_HASH_BYTES = (\d+);/)?.[1],
  ),
};

assert.equal(constants.AUTH_SESSION_MS, 6 * 60 * 60 * 1000);
assert.equal(constants.PASSWORD_PBKDF2_ITERATIONS, 20000);
assert.equal(constants.PASSWORD_SALT_BYTES, 16);
assert.equal(constants.PASSWORD_HASH_BYTES, 32);
assert.match(source, /const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";/);

const btoaCompat = (value) =>
  Buffer.from(value, "binary").toString("base64");
const atobCompat = (value) =>
  Buffer.from(value, "base64").toString("binary");

const context = vm.createContext({
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  Number,
  String,
  Date,
  Math,
  btoa: btoaCompat,
  atob: atobCompat,
});

vm.runInContext(
  [
    'const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";',
    `const PASSWORD_PBKDF2_ITERATIONS = ${constants.PASSWORD_PBKDF2_ITERATIONS};`,
    `const PASSWORD_SALT_BYTES = ${constants.PASSWORD_SALT_BYTES};`,
    `const PASSWORD_HASH_BYTES = ${constants.PASSWORD_HASH_BYTES};`,
    `const AUTH_SESSION_MS = ${constants.AUTH_SESSION_MS};`,
    extractFunction(source, "bufToHex"),
    extractFunction(source, "base64urlFromBytes"),
    extractFunction(source, "base64urlToBytes"),
    extractFunction(source, "timingSafeBytesEq"),
    extractFunction(source, "timingSafeEq"),
    extractFunction(source, "sha256"),
    extractFunction(source, "derivePasswordHash"),
    extractFunction(source, "hashPassword"),
    extractFunction(source, "verifyPasswordHash"),
    extractFunction(source, "isSessionPayloadCurrent"),
  ].join("\n\n"),
  context,
);

const hashPassword = vm.runInContext("hashPassword", context);
const verifyPasswordHash = vm.runInContext("verifyPasswordHash", context);
const sha256 = vm.runInContext("sha256", context);
const isSessionPayloadCurrent = vm.runInContext(
  "isSessionPayloadCurrent",
  context,
);

const password = "CalcioReport-Test-2026!";
const hash1 = await hashPassword(password);
const hash2 = await hashPassword(password);

assert.match(hash1, /^pbkdf2_sha256\$20000\$[^$]+\$[^$]+$/);
assert.match(hash2, /^pbkdf2_sha256\$20000\$[^$]+\$[^$]+$/);
assert.notEqual(hash1, hash2, "Il salt deve rendere diversi due hash uguali.");

{
  const result = await verifyPasswordHash(password, hash1);
  assert.equal(result.ok, true);
  assert.equal(result.needsUpgrade, false);
}
{
  const result = await verifyPasswordHash("password-sbagliata", hash1);
  assert.equal(result.ok, false);
  assert.equal(result.needsUpgrade, false);
}

const legacyHash = await sha256(password);
assert.match(legacyHash, /^[a-f0-9]{64}$/);
{
  const result = await verifyPasswordHash(password, legacyHash);
  assert.equal(
    result.ok,
    true,
    "Un vecchio SHA-256 corretto deve restare valido.",
  );
  assert.equal(
    result.needsUpgrade,
    true,
    "Un vecchio SHA-256 corretto deve essere marcato per la migrazione.",
  );
}
{
  const result = await verifyPasswordHash("password-sbagliata", legacyHash);
  assert.equal(result.ok, false);
  assert.equal(result.needsUpgrade, false);
}

const now = Date.UTC(2026, 9, 7, 16, 0, 0);
const sixHours = constants.AUTH_SESSION_MS;

assert.equal(
  isSessionPayloadCurrent(
    {
      kind: "session",
      email: "user@example.com",
      iat: now,
      exp: now + sixHours,
    },
    now + sixHours - 1,
  ),
  true,
);
assert.equal(
  isSessionPayloadCurrent(
    { email: "user@example.com", iat: now, exp: now + sixHours },
    now + sixHours,
  ),
  false,
  "La sessione deve scadere server-side a 6 ore.",
);

// Compatibilità token già emessi prima dell'introduzione di exp.
assert.equal(
  isSessionPayloadCurrent(
    { email: "legacy@example.com", iat: now },
    now + sixHours - 1,
  ),
  true,
);
assert.equal(
  isSessionPayloadCurrent(
    { email: "legacy@example.com", iat: now },
    now + sixHours,
  ),
  false,
);
assert.equal(isSessionPayloadCurrent({ iat: now }, now), false);

assert.equal(
  isSessionPayloadCurrent(
    { email: "license@example.com", exp: now + sixHours },
    now,
  ),
  false,
  "Un codice licenza privo di iat non deve essere accettato come sessione.",
);
assert.equal(
  isSessionPayloadCurrent(
    {
      kind: "license",
      email: "license@example.com",
      iat: now,
      exp: now + sixHours,
    },
    now,
  ),
  false,
  "Un token con kind diverso da session deve essere rifiutato.",
);

assert.match(source, /const passHash = passwordV2Enabled\(env\)/);
assert.match(source, /function passwordV2Enabled\(env\)/);
assert.match(source, /verifyPasswordHash\(password, u\.pass_hash\)/);
const loginSource = source.slice(
  source.indexOf("async function handleLogin"),
  source.indexOf("async function handleForgotPassword"),
);
assert.doesNotMatch(
  loginSource,
  /UPDATE users SET pass_hash/,
  "Il login non deve riscrivere automaticamente le password legacy.",
);
assert.match(source, /makeSessionToken\(env, email, passHash, now\)/);
assert.match(source, /makeSessionToken\(env, email, u\.pass_hash, now\)/);
assert.match(source, /kind: "session"/);
assert.match(source, /ACCOUNT_DISABLED/);
assert.match(
  source,
  /COALESCE\(disabled,0\) as disabled FROM users WHERE email = \?/,
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      feature: "auth-hardening-1",
      passwordFormat: "pbkdf2_sha256",
      iterations: constants.PASSWORD_PBKDF2_ITERATIONS,
      saltBytes: constants.PASSWORD_SALT_BYTES,
      sessionHours: constants.AUTH_SESSION_MS / (60 * 60 * 1000),
      legacyCompatible: true,
      stagedPasswordV2: true,
      workerSyntax: true,
    },
    null,
    2,
  ),
);
