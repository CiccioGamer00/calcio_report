// Internal accounting API: inputs must come from authenticated, trusted adapters.
// Not enabled in worker.js. No HTTP request may supply arbitrary events.
const sources = new Set(['apple', 'stripe', 'admin', 'redeem']);
const positive = n => Number.isSafeInteger(n) && n > 0;
const identifier = s => typeof s === 'string' && /^[A-Za-z0-9:_-]{1,180}$/.test(s);
function fail(code) { throw new Error(code); }

export function canonicalProEvent(event) {
  if (!event || !identifier(event.id) || !sources.has(event.source) ||
      !positive(event.at)) fail('PRO_EVENT_INVALID');
  if (event.kind === 'grant' && positive(event.durationMs) &&
      event.durationMs <= 365 * 86400000) {
    return { id: event.id, kind: 'grant', source: event.source,
      at: event.at, durationMs: event.durationMs };
  }
  if (event.kind === 'status' && event.source === 'apple' &&
      identifier(event.targetId) && typeof event.revoked === 'boolean') {
    return { id: event.id, kind: 'status', source: 'apple', at: event.at,
      targetId: event.targetId, revoked: event.revoked };
  }
  fail('PRO_EVENT_INVALID');
}

/** Replay purchases in purchase-time order, independent of delivery order.
 * Existing non-Apple entitlement is captured once as baseline. Refunding an
 * Apple purchase removes only that grant from the replay; other sources retain
 * their durations. Restores do not shift purchase time to today.
 * A newer verified status may reverse a refund. At equal signed time revocation
 * wins, so contradictory/stale delivery cannot restore access accidentally.
 */
export function projectProUntil(baselineUntil, rawEvents) {
  if (!Number.isSafeInteger(baselineUntil) || baselineUntil < 0) fail('PRO_BASELINE_INVALID');
  const events = rawEvents.map(canonicalProEvent);
  const ids = new Set();
  const statuses = new Map();
  for (const e of events) {
    if (ids.has(e.id)) fail('PRO_DUPLICATE_EVENT');
    ids.add(e.id);
    if (e.kind !== 'status') continue;
    const old = statuses.get(e.targetId);
    if (!old || e.at > old.at || (e.at === old.at && e.revoked)) statuses.set(e.targetId, e);
  }
  let until = baselineUntil;
  const grants = events.filter(e => e.kind === 'grant').sort((a, b) =>
    a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const e of grants) {
    if (e.source === 'apple' && statuses.get(e.id)?.revoked) continue;
    until = Math.max(until, e.at) + e.durationMs;
    if (!Number.isSafeInteger(until)) fail('PRO_EXPIRY_OVERFLOW');
  }
  return until;
}

function batchRows(batch) {
  if (!Array.isArray(batch) || batch.some(r => r.success !== true)) fail('PRO_STORAGE_FAILED');
  return batch;
}

/** Optimistic compare-and-swap within an atomic D1 batch. Concurrent requests
 * retry from a new snapshot; an external legacy paid_until change fails closed
 * instead of silently erasing another provider's payment.
 * Token ownership must already exist; deleted/disabled accounts cannot commit.
 */
export async function applyProEvents(db, accountId, config, inputEvents, now) {
  if (!identifier(accountId) || !positive(now) ||
      !['test', 'production'].includes(config?.deployment) ||
      config.environment !== (config.deployment === 'test' ? 'Sandbox' : 'Production')) fail('PRO_CONTEXT_INVALID');
  if (!Array.isArray(inputEvents) || !inputEvents.length || inputEvents.length > 10) fail('PRO_EVENT_INVALID');
  const events = inputEvents.map(canonicalProEvent);
  if (events.some(e => e.at > now) || new Set(events.map(e => e.id)).size !== events.length) fail('PRO_EVENT_INVALID');
  const env = config.environment;
  const seed = crypto.randomUUID();
  batchRows(await db.batch([
    db.prepare(`INSERT INTO pro_entitlement_accounts
      (environment, account_id, account_created_at, baseline_until, projected_until, revision)
      SELECT ?, u.id, u.created_at, COALESCE(u.paid_until,0), COALESCE(u.paid_until,0), ?
      FROM users u JOIN apple_account_tokens t ON t.account_id=u.id AND t.environment=?
      WHERE u.id=? AND COALESCE(u.disabled,0)=0 AND t.retired_at IS NULL
      AND u.created_at>0 AND u.created_at<=? AND COALESCE(u.paid_until,0)>=0
      ON CONFLICT(environment, account_id) DO NOTHING`).bind(env, seed, env, accountId, now),
  ]));
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await db.prepare(`SELECT p.*, COALESCE(u.paid_until,0) AS actual_until
      FROM pro_entitlement_accounts p JOIN users u ON u.id=p.account_id
      JOIN apple_account_tokens t ON t.account_id=p.account_id AND t.environment=p.environment
      WHERE p.environment=? AND p.account_id=? AND u.created_at=p.account_created_at
      AND COALESCE(u.disabled,0)=0 AND t.retired_at IS NULL`).bind(env, accountId).first();
    if (!state) fail('PRO_ACCOUNT_UNAVAILABLE');
    if (state.actual_until !== state.projected_until) fail('PRO_LEGACY_WRITE_CONFLICT');
    if (events.some(e => e.at < state.account_created_at)) fail('PRO_EVENT_PREDATES_ACCOUNT');
    const stored = await db.prepare(`SELECT event_id, account_id, event_json FROM pro_entitlement_events
      WHERE environment=? AND (account_id=? OR event_id IN (${events.map(() => '?').join(',')}))`)
      .bind(env, accountId, ...events.map(e => e.id)).all();
    if (stored.success !== true) fail('PRO_STORAGE_FAILED');
    const old = new Map(stored.results.map(r => [r.event_id, r]));
    const pending = [];
    for (const e of events) {
      const prior = old.get(e.id);
      if (prior && (prior.account_id !== accountId || prior.event_json !== JSON.stringify(e))) fail('PRO_EVENT_CONFLICT');
      if (!prior) pending.push(e);
    }
    const all = stored.results.filter(r => r.account_id === accountId).map(r => JSON.parse(r.event_json));
    const until = projectProUntil(state.baseline_until, [...all, ...pending]);
    const operation = crypto.randomUUID();
    const result = batchRows(await db.batch([
      db.prepare(`UPDATE pro_entitlement_accounts SET projected_until=?, revision=?
        WHERE environment=? AND account_id=? AND revision=?
        AND EXISTS(SELECT 1 FROM users u JOIN apple_account_tokens t ON t.account_id=u.id
          WHERE u.id=? AND u.created_at=? AND COALESCE(u.disabled,0)=0
          AND COALESCE(u.paid_until,0)=? AND t.environment=? AND t.retired_at IS NULL)`)
        .bind(until, operation, env, accountId, state.revision, accountId,
          state.account_created_at, state.projected_until, env),
      ...pending.map(e => db.prepare(`INSERT INTO pro_entitlement_events
        (environment,account_id,event_id,event_json,recorded_at)
        SELECT environment,account_id,?,?,? FROM pro_entitlement_accounts
        WHERE environment=? AND account_id=? AND revision=?`)
        .bind(e.id, JSON.stringify(e), now, env, accountId, operation)),
      db.prepare(`UPDATE users SET paid_until=? WHERE id=? AND created_at=?
        AND EXISTS(SELECT 1 FROM pro_entitlement_accounts
          WHERE environment=? AND account_id=? AND revision=?)`)
        .bind(until, accountId, state.account_created_at, env, accountId, operation),
    ]));
    if (result[0].meta.changes === 1) return Object.freeze({ state: 'applied',
      paidUntil: until, duplicate: pending.length === 0 });
  }
  fail('PRO_CONCURRENT_CHANGE_RETRY');
}
