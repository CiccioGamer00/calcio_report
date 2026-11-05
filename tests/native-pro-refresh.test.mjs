import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchApp } from '../mobile/src/patch-frontend.mjs';

test('native entitlement refresh removes stale PRO overlays without logging in again', async () => {
  const app = patchApp(readFileSync(new URL('../app.js', import.meta.url), 'utf8'));
  const classes = () => {
    const set = new Set();
    return { add: (...names) => names.forEach(n => set.add(n)),
      remove: (...names) => names.forEach(n => set.delete(n)),
      toggle: (name, value) => value ? set.add(name) : set.delete(name),
      contains: name => set.has(name) };
  };
  const blocks = [0, 1, 2].map(() => ({ classList: classes() }));
  blocks.forEach(b => b.classList.add('pro-locked'));
  const elements = new Map();
  let json = { ok: true, now: 1000, paidUntil: 2000, trialEndsAt: 1500 };
  const context = vm.createContext({
    document: { querySelectorAll: () => blocks, getElementById: id => {
      if (!elements.has(id)) elements.set(id, { classList: classes() });
      return elements.get(id);
    } },
    getToken: () => 'existing-session', isSessionExpired: () => false,
    fetchMe: async () => ({ json }), setBadge: () => {}, daysLeft: () => 30,
    __IS_PRO__: false,
  });
  vm.runInContext(app.slice(app.indexOf('function applyProLocks('), app.indexOf('async function authPost(')), context);
  await context.refreshTopAuthUI();
  assert.equal(context.__IS_PRO__, true);
  assert.ok(blocks.every(b => !b.classList.contains('pro-locked')));
  json = { ok: true, now: 1000, paidUntil: 0, trialEndsAt: 1500 };
  await context.refreshTopAuthUI();
  assert.equal(context.__IS_PRO__, false);
  assert.ok(blocks.every(b => b.classList.contains('pro-locked')));
  json = { ok: false };
  await context.refreshTopAuthUI();
  assert.ok(blocks.every(b => b.classList.contains('pro-locked')));
});
