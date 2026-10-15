import { registerPlugin, Capacitor } from '@capacitor/core';
import { createPurchases } from './purchases.mjs';

// Fixed isolated backend. The server's explicit Sandbox switch gates purchases.
const base = 'https://calcio-report-test.stemoro84.workers.dev';
export function installPurchases(session) {
  const native = registerPlugin('CRStoreKit');
  const notice = text => window.showToast({ title: 'PRO 30 giorni', text, allowDisable: false });
  const errorText = error => ({
    LOGIN_REQUIRED: 'Accedi al tuo account prima di acquistare o ripristinare PRO.',
    PURCHASE_BUSY: 'Attendi il completamento dell’operazione in corso.',
    PURCHASE_OTHER_ACCOUNT: 'Questo acquisto appartiene a un altro account Calcio Report.',
  }[error?.message] || 'Operazione non completata. Se Apple ha già confermato l’acquisto, non acquistare di nuovo: usa Ripristina acquisti.');
  const request = async (path, token, body) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    if (response.status === 401) throw Error('LOGIN_REQUIRED');
    if (!response.ok) throw Error('PURCHASES_UNAVAILABLE');
    return response.json();
  };
  const manager = createPurchases({ native, session, request,
    onApplied: async () => { await window.refreshTopAuthUI?.(); } });
  let opening = false;
  window.CRNativePurchase = async () => {
    if (opening) return;
    opening = true;
    try {
      if (!session.token) { window.openAuthModal?.('Accedi per acquistare PRO.'); return; }
      if (!Capacitor.isPluginAvailable('CRStoreKit')) { notice('Acquisti Apple non disponibili in questa build.'); return; }
      const product = await manager.product();
      if (!window.confirm(`PRO per 30 giorni: ${product.displayPrice}. Nessun rinnovo automatico.\n\nContinuare con Apple?`)) return;
      const result = await manager.purchase();
      if (result.state === 'pending') notice('Acquisto in attesa di approvazione Apple. Non serve ripeterlo.');
      else if (result.state === 'applied') notice('Acquisto verificato. Il tuo stato PRO è stato aggiornato.');
    } catch (error) { notice(errorText(error)); }
    finally { opening = false; }
  };
  const restore = document.createElement('button');
  restore.type = 'button'; restore.id = 'nativeRestorePurchases';
  restore.textContent = 'Ripristina acquisti Apple';
  restore.addEventListener('click', async () => {
    restore.disabled = true;
    try {
      const result = await manager.restore();
      notice(result.failed ? 'Alcuni acquisti non sono ancora verificati. Riprova tra poco.' :
        result.applied ? 'Acquisti verificati. Il tuo stato PRO è stato aggiornato.' :
        result.otherAccount ? 'Gli acquisti trovati appartengono a un altro account Calcio Report.' :
        'Nessun acquisto Apple trovato per questo account.');
    } catch (error) { notice(errorText(error)); }
    finally { restore.disabled = false; }
  });
  document.querySelector('footer')?.append(restore);
  const resume = async () => {
    if (!session.token || !Capacitor.isPluginAvailable('CRStoreKit')) return;
    try { await manager.resume(); } catch { /* Remain unfinished for a later retry. */ }
  };
  native.addListener('transaction', transaction => {
    manager.receive(transaction).catch(() => {}); // StoreKit retains unfinished purchases.
  }).catch(() => {});
  window.addEventListener('cr:session-changed', resume);
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  session.ready.then(resume).catch(() => {});
}
