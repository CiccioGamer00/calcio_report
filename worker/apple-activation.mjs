// Read-only configuration prerequisites, evaluated only after the existing
// Production enable flag and deployment/environment checks. No remote writes.
export function productionAppleReady(env, now=Date.now()) {
  const cutover=Number(env.PRO_LEDGER_CUTOVER_MS);
  return env.PRO_LEDGER_ENABLED==='1' && env.PRO_WRITES_PAUSED==='0' &&
    Number.isSafeInteger(cutover) && cutover>0 && cutover<=now &&
    /^plink_[A-Za-z0-9]+$/.test(env.STRIPE_PRO_PAYMENT_LINK_ID || '') &&
    typeof env.DB?.prepare==='function' && typeof env.DB?.batch==='function' &&
    (!env.APP_REVIEW_DB || env.APP_REVIEW_DB!==env.DB) &&
    env.APPLE_VERIFIER_URL==='https://apple.calcioreport.com' &&
    /^[0-9a-f]{64}$/i.test(env.APPLE_VERIFIER_SECRET || '');
}
