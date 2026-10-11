import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('function goToPayment('), app.indexOf('// PRO upsell'));
function harness({ token = 'session', expired = false, response = { ok:true, json:{ok:true} }, paymentUrl = 'https://payment.test' } = {}) {
  let current = token, calls = 0, logins = 0;
  const opened = [], toasts = [], messages = [];
  const context = vm.createContext({
    getToken: () => current, isSessionExpired: () => expired,
    fetchMe: async () => { calls++; return typeof response === 'function' ? response() : response; },
    openAuthModal: () => logins++, closeAuthModal() {}, setAuthMsg: m => messages.push(m),
    showToast: t => toasts.push(t),
    window: { API_CONFIG:{paymentUrl}, open: (...args) => opened.push(args) },
  });
  vm.runInContext(source, context);
  return { start: () => context.goToPayment(), opened, toasts, messages,
    changeToken: t => { current=t; }, calls: () => calls, logins: () => logins };
}

test('anonymous and expired sessions must log in before any payment request', async () => {
  for (const opts of [{token:''}, {expired:true}]) {
    const h=harness(opts); await h.start();
    assert.equal(h.calls(),0); assert.equal(h.logins(),1); assert.equal(h.opened.length,0);
  }
});

test('deleted/disabled accounts and network errors cannot open checkout', async () => {
  for (const response of [{ok:true,json:{ok:false}}, {ok:false}, () => {throw Error('offline');}]) {
    const h=harness({response}); await h.start();
    assert.equal(h.opened.length,0); assert.ok(h.logins() || h.toasts.length);
    assert.ok(h.toasts.every(t=>!t.ctaAction && !t.ctaUrl));
  }
});

test('valid account, including expired entitlement, opens only on explicit confirmation', async () => {
  const h=harness({response:{ok:true,json:{ok:true,trialEndsAt:1,paidUntil:0}}});
  await h.start(); assert.equal(h.opened.length,0);
  assert.equal(h.toasts[0].allowDisable,false);
  h.toasts[0].ctaAction();
  assert.deepEqual(h.opened,[['https://payment.test','_blank','noopener']]);
});

test('duplicate requests and account changes cannot reuse a previous payment confirmation', async () => {
  let resolve;
  const h=harness({response:()=>new Promise(r=>{resolve=r;})});
  const first=h.start(); await h.start(); assert.equal(h.calls(),1);
  h.changeToken('replacement'); resolve({ok:true,json:{ok:true}}); await first;
  assert.equal(h.toasts.length,0);
  const next=harness(); await next.start(); next.changeToken(''); next.toasts[0].ctaAction();
  assert.equal(next.opened.length,0); assert.equal(next.logins(),1);
});

test('test environment with payment URLs disabled never offers a checkout', async () => {
  const h=harness({paymentUrl:''}); await h.start();
  assert.equal(h.opened.length,0); assert.ok(h.toasts.every(t=>!t.ctaAction && !t.ctaUrl));
});

test('toast action closes the old toast before invoking the authenticated payment path', () => {
  let hidden=false, actionCalled=false, handler;
  const el={innerHTML:'',classList:{remove(){hidden=false;},add(){hidden=true;}},
    querySelector(selector){return selector.includes('tcta') ? {addEventListener(name,cb){handler=cb;}} : null;}};
  const context=vm.createContext({document:{getElementById:()=>el}, getHintsOff:()=>({}),
    window:{open(){throw Error('Direct URL must not override action');}}});
  vm.runInContext(app.slice(app.indexOf('function showToast('),app.indexOf('const PANEL_HINTS')),context);
  context.showToast({ctaLabel:'Buy',ctaUrl:'https://payment.test',ctaAction:()=>{
    assert.equal(hidden,true); assert.equal(el.innerHTML,''); actionCalled=true;
  }});
  handler(); assert.equal(actionCalled,true);
});
