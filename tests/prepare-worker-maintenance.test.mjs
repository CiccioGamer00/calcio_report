import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMaintenanceConfig} from '../scripts/prepare-worker-maintenance.mjs';
const fixture=()=>({
  name:'calcio-report-proxy', main:'src/worker.js', workers_dev:false,preview_urls:false,
  compatibility_date:'2026-02-10',
  routes:[{pattern:'api.example.invalid',custom_domain:true}],
  observability:{enabled:true,head_sampling_rate:0.5},
  vars:{ACCOUNT_DELETION_ENABLED:'1',AUTH_PASSWORD_V2:'1',CR_RELAY_URL:'https://relay.example.invalid'},
  d1_databases:[{binding:'DB',database_id:'45681187-3565-4d36-8627-131c18ff1885',database_name:'calcio_users'}],
});
test('Preserves live routes, bindings, values and observability without mutating snapshot',()=>{
  const live=fixture(),before=structuredClone(live),out=prepareMaintenanceConfig(live);
  assert.deepEqual(live,before);
  for(const key of ['routes','d1_databases','observability','compatibility_date','workers_dev','preview_urls'])
    assert.deepEqual(out[key],live[key]);
  for(const [key,value] of Object.entries(live.vars)) assert.equal(out.vars[key],value);
  assert.equal(out.keep_vars,true);assert.equal(out.no_bundle,true);
  assert.equal(out.vars.PRO_WRITES_PAUSED,'1');assert.equal(out.vars.PRO_LEDGER_ENABLED,'0');
  assert.equal(out.vars.APPLE_PRODUCTION_ENABLED,'0');
  assert.equal(out.vars.PRO_LEDGER_CUTOVER_MS,undefined);
  assert.equal(out.vars.APP_REVIEW_ENABLED,undefined);
  assert.equal(out.main,'worker/dist/apple-production-candidate.mjs');
});
test('Wrong Worker, DB or changed runtime rejected',()=>{
  for(const patch of [
    {name:'another-worker'},{compatibility_date:'2026-10-24'},
    {d1_databases:[]},{d1_databases:[{binding:'DB',database_id:'review-db'}]},
    {compatibility_flags:['nodejs_compat']},
  ]) assert.throws(()=>prepareMaintenanceConfig({...fixture(),...patch}));
});
test('Unexpected deployment keys or newly configured variables require review',()=>{
  assert.throws(()=>prepareMaintenanceConfig({...fixture(),build:{command:'unexpected'}}));
  const live=fixture();live.vars.PRO_LEDGER_ENABLED='1';
  assert.throws(()=>prepareMaintenanceConfig(live),{message:'LIVE_VARIABLE_NAMES_CHANGED'});
});
test('Missing flags and empty flags accepted without inventing flags',()=>{
  assert.equal(prepareMaintenanceConfig(fixture()).compatibility_flags,undefined);
  assert.deepEqual(prepareMaintenanceConfig({...fixture(),compatibility_flags:[]}).compatibility_flags,[]);
});
