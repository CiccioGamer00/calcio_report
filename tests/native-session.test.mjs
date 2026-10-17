import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, recoveryToken } from '../mobile/src/session.mjs';
const time = 100000000;
function fixture() {
  const records = new Map(), flags = new Map();
  const vault = {
    get: async k => records.get(k) ?? null,
    set: async (k, v) => { records.set(k, v); },
    remove: async k => records.delete(k),
  };
  const storage = { getItem: k => flags.get(k) ?? null, setItem: (k,v) => flags.set(k,v), removeItem: k => flags.delete(k) };
  return { records, flags, vault, storage, start: () => createSession(vault, storage, () => time) };
}
test('native session persists through vault, never plaintext browser storage', async () => {
  const f = fixture(), s = f.start(); await s.ready;
  await s.save('secret', time);
  assert.equal(s.token, 'secret');
  assert.deepEqual([...f.flags.values()], ['1']);
  const restart = f.start(); await restart.ready;
  assert.equal(restart.token, 'secret');
});
test('logout prevents restoration even when Keychain deletion fails', async () => {
  const f = fixture(), s = f.start(); await s.ready; await s.save('secret', time);
  f.vault.remove = async () => { throw Error('locked'); };
  await assert.rejects(s.clear());
  assert.equal(s.token, '');
  const restart = f.start(); await assert.rejects(restart.ready);
  assert.equal(restart.token, '');
});
test('failed save does not authenticate or restore old session', async () => {
  const f = fixture(), s = f.start(); await s.ready; await s.save('old', time);
  f.vault.set = async () => { throw Error('locked'); };
  await assert.rejects(s.save('new', time));
  assert.equal(s.token, '');
  const restart = f.start(); await restart.ready;
  assert.equal(restart.token, '');
});
test('reinstall and legacy plaintext credentials require fresh login', async () => {
  const f = fixture(), s = f.start(); await s.ready; await s.save('old', time);
  f.flags.clear(); f.flags.set('CR_TOKEN', 'legacy'); f.flags.set('CR_LOGIN_TS', String(time));
  const restart = f.start(); await restart.ready;
  assert.equal(restart.token, ''); assert.equal(f.records.size, 0);
  assert.equal(f.flags.has('CR_TOKEN'), false); assert.equal(f.flags.has('CR_LOGIN_TS'), false);
});
test('expired, future and malformed sessions are discarded', async () => {
  for (const value of [{token:'x',timestamp:1}, {token:'x',timestamp:time+1}, {token:42,timestamp:time}]) {
    const f = fixture(); f.flags.set('CR_NATIVE_SESSION_ACTIVE','1');
    f.records.set('calcio-report.test.session.v1',value);
    const s = f.start(); await s.ready; assert.equal(s.token,''); assert.equal(f.records.size,0);
  }
});
test('queued logout wins over pending login persistence', async () => {
  const f=fixture(), s=f.start(); await s.ready;
  let release; const gate=new Promise(r=>{release=r;});
  f.vault.set=async(k,v)=>{await gate; f.records.set(k,v);};
  const login=s.save('secret',time); const logout=s.clear(); release();
  await Promise.all([login,logout]); assert.equal(s.token,''); assert.equal(f.records.size,0);
});
test('recovery accepts only exact expected HTTPS origin and reset token', () => {
  assert.equal(recoveryToken('https://app.calcioreport.com/#reset=abc_def.123-456'),'abc_def.123-456');
  for(const link of ['javascript:alert(1)','https://evil.com/#reset=abc.def',
    'https://app.calcioreport.com.evil.com/#reset=abc.def','https://user@app.calcioreport.com/#reset=abc.def',
    'https://app.calcioreport.com/other#reset=abc.def','http://app.calcioreport.com/#reset=abc.def',
    'https://app.calcioreport.com/?redirect=evil#reset=abc.def','https://app.calcioreport.com/#reset=%ZZ',
    'https://app.calcioreport.com/#reset=<script>', 'x'.repeat(9000)]) assert.equal(recoveryToken(link),'');
});
