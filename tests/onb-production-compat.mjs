// Run against the original supplied live bundle and the locally generated candidate.
// No external requests or real account data. Synthetic D1 and relay only.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
const [livePath,candidatePath]=process.argv.slice(2);
if(!livePath||!candidatePath) throw Error("Usage: node tests/onb-production-compat.mjs LIVE.mjs CANDIDATE.mjs");
const [live,candidate]=await Promise.all([livePath,candidatePath].map(p=>import(pathToFileURL(resolve(p)).href).then(m=>m.default)));
function database(){
 const sqlite=new DatabaseSync(":memory:");
 for(const f of ["./fixtures/account-schema.sql","../worker/migrations/guest-v1.sql"]) sqlite.exec(readFileSync(new URL(f,import.meta.url),"utf8"));
 const db={prepare(sql){const st=sqlite.prepare(sql);return {values:[],bind(...v){this.values=v;return this},first(){return st.get(...this.values)},run(){return st.run(...this.values)},all(){return {results:st.all(...this.values)}}}},batch(stmts){sqlite.exec("BEGIN");try{const out=stmts.map(s=>s.all());sqlite.exec("COMMIT");return out}catch(e){sqlite.exec("ROLLBACK");throw e}}};
 return {db,sqlite};
}
const prod=database(),review=database();
const env={DB:prod.db,APP_REVIEW_DB:review.db,LICENSE_SECRET:"synthetic-account-secret",GUEST_SECRET:"synthetic-guest-secret",GUEST_ENABLED:"0",CR_RELAY_URL:"https://relay.invalid",CR_RELAY_SECRET:"synthetic-relay-secret",APPLE_PRODUCTION_ENABLED:"0"};
const calls=[];const cache=new Map();
globalThis.caches={default:{match:k=>cache.get(k.url)?.clone(),put:(k,v)=>cache.set(k.url,v)}};
globalThis.fetch=async input=>{const u=new URL(input);assert.equal(u.origin,"https://relay.invalid");calls.push(u.href);const team=Number(u.searchParams.get("team"));return Response.json({response:[{fixture:{id:team===1?101:202,date:"2026-12-01T19:45:00Z"},league:{id:135,season:2026},teams:{home:{id:team,name:"Home"},away:{id:team+1,name:"Away"}}}],errors:[]})};
const req=(worker,path,method="GET",auth="",body)=>worker.fetch(new Request("https://worker.invalid"+path,{method,headers:{Authorization:auth,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}),env,{});
const baselineRoutes=[["/auth/me"],["/analysis/open","POST"],["/predict?fixture=101"],["/apple/token"],["/apple/notifications","POST"],["/admin/apple-readiness","POST"],["/community/interest","POST"],["/admin/stats"],["/stripe/webhook","POST"],["/auth/delete","POST"],["/license/redeem","POST"],["/auth/me","GET","Bearer cr-review:invalid"]];
for(const args of baselineRoutes){const a=await req(live,...args),b=await req(candidate,...args);assert.equal(b.status,a.status,args[0]);assert.equal(await b.text(),await a.text(),args[0]);}
assert.equal((await req(candidate,"/guest/session","POST","GuestSeed "+"a".repeat(64))).status,404);
env.GUEST_ENABLED="1";
for(const args of baselineRoutes){const a=await req(live,...args),b=await req(candidate,...args);assert.equal(b.status,a.status,args[0]);assert.equal(await b.text(),await a.text(),args[0]);}
const open=await req(candidate,"/guest/session","POST","GuestSeed "+"a".repeat(64));assert.equal(open.status,200);const auth="Guest "+(await open.json()).token;
const resolveMatch=await req(candidate,"/guest/resolve?team=1","POST",auth);assert.equal(resolveMatch.status,200);
const {ticket}=await resolveMatch.json();const match=await req(candidate,"/guest/open?ticket="+ticket,"POST",auth);assert.equal(match.status,200);assert.equal((await match.json()).fixture.fixture.id,101);
assert.equal((await req(candidate,"/guest/resolve?team=3","POST",auth)).status,409);
assert.equal((await req(candidate,"/guest/predict","GET",auth)).status,403);
assert.equal((await req(candidate,"/predict?fixture=101","GET",auth)).status,401);
assert.equal((await req(candidate,"/guest/session","POST","Bearer cr-review:invalid")).status,403);
assert.equal(review.sqlite.prepare("SELECT COUNT(*) n FROM guest_analysis").get().n,0);
assert.equal(review.sqlite.prepare("SELECT COUNT(*) n FROM guest_budget").get().n,0);
assert.equal(prod.sqlite.prepare("SELECT COUNT(*) n FROM guest_analysis").get().n,1);
assert.equal(calls.length,2);
console.log("PASS: 12 existing route comparisons with flag off/on, guest first/second, premium denied, public/review DB isolation, 2 mocked relay requests");
