const productId = 'com.calcioreport.app.pro30';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Native bridge and backend are injected for deterministic interrupted-delivery
// tests. Never persist JWS or credentials in localStorage or logs.
export function createPurchases({ native, session, request, onApplied = async () => {}, environment = 'Sandbox' }) {
  if (!['Sandbox', 'Production'].includes(environment)) throw Error('PURCHASES_UNAVAILABLE');
  let busy = false;
  const delivering = new Map();
  const assertSession = token => { if (!token || session.token !== token) throw Error('LOGIN_REQUIRED'); };
  async function context() {
    await session.ready;
    const token = session.token; assertSession(token);
    const account = await request('/apple/token', token);
    assertSession(token);
    if (account.environment !== environment || account.productId !== productId ||
        typeof account.appAccountToken !== 'string' || !uuid.test(account.appAccountToken)) throw Error('PURCHASES_UNAVAILABLE');
    return { token, accountToken: account.appAccountToken.toLowerCase() };
  }
  async function deliver(transaction, ctx) {
    assertSession(ctx.token);
    if (transaction?.appAccountToken?.toLowerCase() !== ctx.accountToken) throw Error('PURCHASE_OTHER_ACCOUNT');
    if (typeof transaction.transactionId !== 'string' || !/^[0-9]{1,64}$/.test(transaction.transactionId) ||
        typeof transaction.signedPayload !== 'string') throw Error('PURCHASE_INVALID');
    const key = `${ctx.token}:${transaction.transactionId}`;
    if (delivering.has(key)) return delivering.get(key);
    const pending = (async () => {
      const result = await request('/apple/transaction', ctx.token, { signedPayload: transaction.signedPayload });
      assertSession(ctx.token);
      if (result.ok !== true || result.state !== 'applied' || result.transactionId !== transaction.transactionId ||
          !Number.isSafeInteger(result.paidUntil) || result.paidUntil < 0) throw Error('PURCHASE_NOT_APPLIED');
      await native.finish({ transactionId: transaction.transactionId, appAccountToken: ctx.accountToken });
      if (session.token === ctx.token) await onApplied(result);
      return result;
    })();
    delivering.set(key, pending);
    try { return await pending; } finally { delivering.delete(key); }
  }
  async function exclusive(action) {
    if (busy) throw Error('PURCHASE_BUSY');
    busy = true;
    try { return await action(); } finally { busy = false; }
  }
  async function replay(restore) {
    const ctx = await context();
    const list = restore ? await native.restore() : await native.unfinished();
    assertSession(ctx.token);
    if (!Array.isArray(list.transactions)) throw Error('PURCHASE_INVALID');
    const result = { applied: 0, failed: 0, otherAccount: 0 };
    for (const transaction of list.transactions) {
      if (transaction.appAccountToken?.toLowerCase() !== ctx.accountToken) { result.otherAccount++; continue; }
      try { await deliver(transaction, ctx); result.applied++; }
      catch { result.failed++; }
    }
    return result;
  }
  return Object.freeze({
    async product() {
      await context(); // A disabled/missing backend must prevent opening checkout.
      const product = await native.product();
      if (product.productId !== productId || typeof product.displayPrice !== 'string' || !product.displayPrice) throw Error('PURCHASES_UNAVAILABLE');
      return product;
    },
    purchase: () => exclusive(async () => {
      const ctx = await context();
      const result = await native.purchase({ appAccountToken: ctx.accountToken });
      assertSession(ctx.token);
      if (result.state === 'pending' || result.state === 'cancelled') return result;
      if (result.state !== 'purchased') throw Error('PURCHASE_INVALID');
      const applied = await deliver(result.transaction, ctx);
      return { state: 'applied', paidUntil: applied.paidUntil };
    }),
    resume: () => exclusive(() => replay(false)),
    restore: () => exclusive(() => replay(true)),
    async receive(transaction) { return deliver(transaction, await context()); },
  });
}
