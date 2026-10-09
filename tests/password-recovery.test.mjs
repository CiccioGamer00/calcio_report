import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const worker = readFileSync(resolve(root, "worker/worker.js"), "utf8");
const app = readFileSync(resolve(root, "app.js"), "utf8");
const html = readFileSync(resolve(root, "index.html"), "utf8");

assert.match(worker, /url\.pathname === "\/auth\/forgot"/);
assert.match(worker, /url\.pathname === "\/auth\/reset"/);
assert.match(worker, /PASSWORD_RESET_TTL_MS = 20 \* 60 \* 1000/);
assert.match(worker, /PASSWORD_RESET_TOKEN_SCOPE = "password-reset-v1"/);
assert.match(worker, /RESET_PASSWORD_VERSION_SCOPE = "reset-password-version-v1"/);

assert.match(
  worker,
  /PASSWORD_RESET_GENERIC_MESSAGE[\s\S]*Se l'email è registrata, riceverai un link/,
);
assert.match(
  worker,
  /return json\([\s\S]*PASSWORD_RESET_GENERIC_MESSAGE[\s\S]*200,[\s\S]*corsHeaders\(\)/,
);

assert.match(
  worker,
  /hmacSha256\([\s\S]*env\.LICENSE_SECRET,[\s\S]*PASSWORD_RESET_TOKEN_SCOPE/,
  "Il token reset deve usare firma con scope separato.",
);
assert.match(
  worker,
  /UPDATE users SET pass_hash = \? WHERE email = \? AND pass_hash = \?/,
  "Il reset deve essere single-use anche con richieste concorrenti.",
);
assert.match(worker, /passwordV2Enabled\(env\)[\s\S]*hashPassword\(password\)/);

assert.match(worker, /RESEND_API_KEY/);
assert.match(worker, /https:\/\/api\.resend\.com\/emails/);
assert.match(worker, /PASSWORD_RESET_FROM/);
assert.match(worker, /#reset=\$\{encodeURIComponent\(resetToken\)\}/);

assert.match(
  worker,
  /makeSessionToken\(env, email, passHash, now/,
  "Le nuove sessioni devono essere legate alla versione password.",
);
assert.match(worker, /sessionPasswordVersionMatches\(env, sess, u\.pass_hash\)/);
assert.match(worker, /if \(!session\?\.av\) return true/);

assert.match(html, /id="btnForgotPassword"/);
assert.match(html, /id="authResetBox" class="hidden"/);
assert.match(html, /id="resetPassConfirm"/);
assert.match(app, /authPost\("\/auth\/forgot", \{ email \}\)/);
assert.match(app, /Controlla anche la cartella Spam \/ Posta indesiderata\./);
assert.match(app, /authPost\("\/auth\/reset",/);
assert.match(app, /password !== confirm/);
assert.match(app, /passwordResetTokenFromHash/);
assert.match(app, /clearPasswordResetHash/);
assert.match(app, /setupPasswordRecovery\(\)/);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      feature: "password-recovery",
      resetTtlMinutes: 20,
      genericForgotResponse: true,
      scopedResetToken: true,
      singleUseReset: true,
      sessionRevocationForNewTokens: true,
      resendAdapter: true,
      fragmentResetLink: true,
      frontendFlow: true,
    },
    null,
    2,
  ),
);
