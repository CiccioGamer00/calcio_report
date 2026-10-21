import { ensureAppleAccountToken } from './apple-purchase-ledger.mjs';
import { applyProEvents } from './pro-entitlements.mjs';
const day = 86400000;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const timestamp = value => Number.isSafeInteger(value) && value > 0;
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))]
    .map(b=>b.toString(16).padStart(2,'0')).join('');
}

// Created only inside the Worker wrapper. Core routes perform signature/session/
// administrator validation BEFORE invoking these methods. No caller-supplied events.
export function createLegacyPayments(db, config, {cutover, stripePaymentLink} = {}) {
  if (!timestamp(cutover) || !['test','production'].includes(config?.deployment) ||
      config.environment !== (config.deployment === 'test' ? 'Sandbox' : 'Production')) {
    throw Error('PRO_PAYMENT_CONFIG_INVALID');
  }
  async function apply(account, operationId, facts, event, now) {
    if (!account?.id || !timestamp(now) || now < cutover) throw Error('PRO_PAYMENT_CONTEXT_INVALID');
    await ensureAppleAccountToken(db,account.id,config,now);
    const fingerprint = await hash(JSON.stringify(facts));
    const result = await db.batch([
      db.prepare(`INSERT INTO pro_payment_operations
        (environment,operation_id,account_id,fingerprint,event_json,recorded_at)
        SELECT ?,?,id,?,?,? FROM users WHERE id=? AND created_at=? AND COALESCE(disabled,0)=0
        ON CONFLICT(environment,operation_id) DO NOTHING`)
        .bind(config.environment,operationId,fingerprint,JSON.stringify(event),now,account.id,account.created_at),
      db.prepare(`SELECT sequence,account_id,fingerprint,event_json FROM pro_payment_operations
        WHERE environment=? AND operation_id=?`).bind(config.environment,operationId),
    ]);
    if (result.some(r=>r.success!==true)) throw Error('PRO_STORAGE_FAILED');
    const stored = result[1].results?.[0];
    if (!stored || stored.account_id !== account.id || stored.fingerprint !== fingerprint) {
      throw Error('PRO_PAYMENT_OPERATION_CONFLICT');
    }
    const recordedEvent = {...JSON.parse(stored.event_json),order:stored.sequence};
    // A concurrent request with a later start time may persist the operation first.
    // Use that trusted persisted time without moving or duplicating the grant.
    const outcome = await applyProEvents(db,account.id,config,[recordedEvent],Math.max(now,recordedEvent.at));
    return {...outcome,operationId};
  }
  return Object.freeze({
    async stripe(account, session, now) {
      // Only the explicitly configured one-time PRO Payment Link is accepted.
      if (!/^plink_[A-Za-z0-9]+$/.test(stripePaymentLink || '')) throw Error('PRO_STRIPE_LINK_REQUIRED');
      if (session?.payment_link !== stripePaymentLink) throw Error('PRO_STRIPE_PRODUCT_MISMATCH');
      if (session.livemode !== (config.environment === 'Production')) throw Error('PRO_STRIPE_ENVIRONMENT_MISMATCH');
      if (session.mode !== 'payment' || session.payment_status !== 'paid') return {ignored:true};
      if (!validId(session.id) || !session.id.startsWith('cs_') ||
          !timestamp(session.created) || !timestamp(session.created*1000) || session.created*1000 > now) {
        throw Error('PRO_STRIPE_SESSION_INVALID');
      }
      if (session.created*1000 < cutover) throw Error('PRO_PRE_CUTOVER_RECONCILIATION_REQUIRED');
      const id = `stripe:${session.id}`;
      return apply(account,id,{source:'stripe',sessionId:session.id,created:session.created,
        paymentLink:stripePaymentLink}, {id,source:'stripe',kind:'grant',at:now,durationMs:30*day},now);
    },
    async redeem(account, payload, now) {
      // Old email-only codes cannot prove ownership or whether they were redeemed.
      if (payload?.v !== 2 || payload.accountId !== account.id || !validId(payload.id) ||
          !timestamp(payload.issuedAt) || payload.issuedAt < cutover ||
          payload.issuedAt < account.created_at || payload.issuedAt > now ||
          !timestamp(payload.exp) || payload.exp < now) throw Error('PRO_REDEEM_REISSUE_REQUIRED');
      const id=`redeem:${payload.id}`;
      return apply(account,id,{source:'redeem',id:payload.id,issuedAt:payload.issuedAt,exp:payload.exp},
        {id,source:'redeem',kind:'grant',at:now,durationMs:30*day},now);
    },
    async admin(account, deltaDays, requestId, now) {
      if (!validId(requestId) || !Number.isSafeInteger(deltaDays) || Math.abs(deltaDays)>365) {
        throw Error('PRO_ADMIN_OPERATION_INVALID');
      }
      const id=`admin:${requestId}`;
      return apply(account,id,{source:'admin',deltaDays},
        {id,source:'admin',kind:'adjust',at:now,deltaMs:deltaDays*day},now);
    },
  });
}
