import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import core from '../worker/worker.js';
import {countCommunityInterest,withCommunityInterest} from '../worker/community-interest.mjs';
import {createAppReviewRouter} from '../worker/app-review-router.mjs';

function fixture(t, schema = true) {
  const sql = new DatabaseSync(':memory:');
  t.after(()=>sql.close());
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(readFileSync(new URL('./fixtures/account-schema.sql',import.meta.url),'utf8'));
  if (schema) sql.exec(readFileSync(new URL('../worker/schema/community-interest.sql',import.meta.url),'utf8'));
  const env = {LICENSE_SECRET:'local-test-secret', ADMIN_KEY:'local-admin', DB:{prepare(query){
    let args=[];
    const statement={bind(...values){args=values;return statement;},
      async first(){return sql.prepare(query).get(...args)||null;},
      async all(){return {results:sql.prepare(query).all(...args)};},
      async run(){return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};}};
    return statement;
  }}};
  const handler=withCommunityInterest(core,core);
  const request=(path,token,body,method='POST')=>handler.fetch(new Request('https://api.example'+path,{
    method,headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    ...(body?{body:JSON.stringify(body)}:{})}),env,{});
  const register=async email=>{
    const response=await request('/auth/register',null,{email,password:'Test-password-123!'});
    assert.equal(response.status,200);return (await response.json()).token;
  };
  return {sql,env,handler,request,register};
}

test('real sessions, retries and concurrent clicks count one authenticated account, ignoring supplied identity',async t=>{
  const h=fixture(t), token=await h.register('one@example.invalid');
  await h.register('other@example.invalid');
  h.sql.prepare('UPDATE users SET trial_ends_at=0, paid_until=0').run();
  const requests=await Promise.all(Array.from({length:5},()=>h.request('/community/interest',token,{accountId:'other',email:'other@example.invalid'})));
  for(const response of requests) assert.deepEqual(await response.json(),{ok:true,recorded:true});
  assert.equal(await countCommunityInterest(h.env),1);
  assert.equal(h.sql.prepare('SELECT email FROM users WHERE id=(SELECT account_id FROM community_interest)').get().email,'one@example.invalid');
  const timestamp=h.sql.prepare('SELECT created_at FROM community_interest').get().created_at;
  await h.request('/community/interest',token);
  assert.equal(h.sql.prepare('SELECT created_at FROM community_interest').get().created_at,timestamp);
  assert.equal(h.sql.prepare('SELECT SUM(paid_until) n FROM users').get().n,0);
});

test('missing/forged sessions and wrong method cannot write or expose counts',async t=>{
  const h=fixture(t);
  for(const token of [null,'forged']) assert.equal((await h.request('/community/interest',token)).status,401);
  assert.equal((await h.request('/community/interest',null,null,'GET')).status,405);
  assert.equal((await h.request('/admin/stats',null,null,'GET')).status,403);
  assert.equal(await countCommunityInterest(h.env),0);
});

test('review and Sandbox do not require schema or touch metric storage',async t=>{
  const h=fixture(t,false), token=await h.register('review@example.invalid');
  h.env.APP_REVIEW_ACCOUNT_ID=h.sql.prepare('SELECT id FROM users').get().id;
  assert.deepEqual(await (await h.request('/community/interest',token)).json(),{ok:true,recorded:false});
  delete h.env.APP_REVIEW_ACCOUNT_ID;h.env.APPLE_DEPLOYMENT='test';
  assert.deepEqual(await (await h.request('/community/interest',token)).json(),{ok:true,recorded:false});
});

test('public review router acknowledges interest without reaching live or review metric handlers',async()=>{
  let metricCalls=0;
  const handler={fetch:async()=>{metricCalls++;throw Error('metric must not run');}};
  const auth={authenticatePurchaseAccount:async()=>({id:'review-id'})};
  const router=createAppReviewRouter(handler,handler,auth);
  const env={DB:{},APP_REVIEW_DB:{},APP_REVIEW_ENABLED:'1',LICENSE_SECRET:'live',
    APP_REVIEW_LICENSE_SECRET:'review',APP_REVIEW_ACCOUNT_ID:'review-id',
    APP_REVIEW_ACCOUNT_EMAIL:'review@example.invalid',APP_REVIEW_VERIFIER_URL:'https://example.invalid',APP_REVIEW_VERIFIER_SECRET:'review-verifier'};
  const response=await router.fetch(new Request('https://api.example/community/interest',{
    method:'POST',headers:{Authorization:'Bearer cr-review:signed'}}),env,{});
  assert.deepEqual(await response.json(),{ok:true,recorded:false});
  assert.equal(metricCalls,0);
});

test('disabled and deleted accounts are excluded; cascade cleans data and old sessions stay invalid',async t=>{
  const h=fixture(t), token=await h.register('one@example.invalid');
  await h.request('/community/interest',token);
  h.sql.prepare('UPDATE users SET disabled=1').run();
  assert.equal(await countCommunityInterest(h.env),0);
  assert.equal((await h.request('/community/interest',token)).status,401);
  h.sql.prepare('DELETE FROM users').run();
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM community_interest').get().n,0);
  await h.register('one@example.invalid');
  assert.equal((await h.request('/community/interest',token)).status,401);
});

test('schema is repeatable and missing storage reports unavailable rather than success or zero',async t=>{
  const h=fixture(t,false), token=await h.register('one@example.invalid');
  assert.equal((await h.request('/community/interest',token)).status,503);
  const stats=await h.handler.fetch(new Request('https://api.example/admin/stats',{headers:{'x-admin-key':'local-admin'}}),h.env,{});
  const data=await stats.json();assert.equal(data.ok,true);assert.equal(data.communityInterested,null);
  const schema=readFileSync(new URL('../worker/schema/community-interest.sql',import.meta.url),'utf8');
  h.sql.exec(schema);h.sql.exec(schema);
  assert.equal(await countCommunityInterest(h.env),0);
});

function ui({token='session',response={ok:true,recorded:true},status=200,networkError=false,url=''}={}) {
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('function setupTelegramHeader()'),source.indexOf('function setupTabsStage()'));
  let click;const toasts=[],calls=[];
  const button={textContent:'',addEventListener(event,fn){click=fn;},setAttribute(){},removeAttribute(){}};
  const context={document:{getElementById:()=>button},window:{API_CONFIG:{baseUrl:'https://api.example',telegramUrl:url},open:(...args)=>calls.push(args)},
    getToken:()=>token,openAuthModal(){},showToast:message=>toasts.push(message),AbortController,setTimeout,clearTimeout,
    fetch:async(...args)=>{calls.push(args);if(networkError)throw Error('offline');return {ok:status<400,status,json:async()=>response};}};
  vm.runInNewContext(block+'\nsetupTelegramHeader();',context);
  return {button,toasts,calls,click:()=>click({preventDefault(){}})};
}

test('UI only confirms persisted interest; anonymous/review/failure paths never claim registration',async()=>{
  const good=ui();await good.click();assert.match(good.toasts[0].text,/interesse è registrato/);
  for(const options of [{token:''},{response:{ok:true,recorded:false}},{status:503,response:{error:'unavailable'}},{networkError:true},{response:{ok:true}}]) {
    const h=ui(options);await h.click();assert.ok(!h.toasts.some(x=>x.text.includes('interesse è registrato')));
    if(options.token==='')assert.equal(h.calls.length,0);
  }
  const h=ui();await Promise.all([h.click(),h.click()]);assert.equal(h.calls.length,1);
});
