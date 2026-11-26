import test from "node:test";
import assert from "node:assert/strict";
import {guestSandbox} from "./helpers/guest-sandbox.mjs";

async function visitor(s,seed="a"){
  const response=await s.request("/guest/session","GuestSeed "+seed.repeat(64),"POST");
  assert.equal(response.status,200);
  const data=await response.json();
  const call=(path,method="GET",signal)=>s.request("/guest/"+path,"Guest "+data.token,method,null,signal);
  return {call,data};
}
test("reservation ignores errors, empty and abort; commit, retry and refresh keep one verified fixture",async()=>{
  const s=guestSandbox(),{call}=await visitor(s);
  for(const [team,status] of [[90,502],[91,502],[92,429],[93,200]]){
    assert.equal((await call("resolve?team="+team,"POST")).status,status);
  }
  assert.equal((await call("resolve?team=1","POST",AbortSignal.abort())).status,408);
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) n FROM guest_analysis").get().n,0);
  const {ticket}=await (await call("resolve?team=1","POST")).json();
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) n FROM guest_analysis").get().n,0);
  assert.equal((await call("open?ticket="+ticket,"POST",AbortSignal.abort())).status,408);
  const replies=await Promise.all([call("open?ticket="+ticket,"POST"),call("open?ticket="+ticket,"POST")]);
  for(const r of replies) assert.equal((await r.json()).fixture?.fixture.id,101);
  assert.equal((await (await call("resolve?team=2","POST")).json()).fixture.fixture.id,101);
  assert.equal((await (await call("resolve?team=3","POST")).json()).error,"GUEST_SECOND_FIXTURE");
  assert.equal((await visitor(s)).data.fixture.fixture.id,101);
  assert.equal((await visitor(s,"b")).data.fixture,null);
});
test("concurrent candidates commit at most one match",async()=>{
  const s=guestSandbox(),{call}=await visitor(s);
  const tickets=await Promise.all([1,3].map(async id=>(await (await call("resolve?team="+id,"POST")).json()).ticket));
  const opens=await Promise.all(tickets.map(ticket=>call("open?ticket="+ticket,"POST")));
  assert.deepEqual(opens.map(r=>r.status).sort(),[200,409]);
});
test("guest data scope, budget and account separation apply before relay/cache",async()=>{
  const s=guestSandbox(),{call,data}=await visitor(s);
  const ticket=(await (await call("resolve?team=1","POST")).json()).ticket;
  await call("open?ticket="+ticket,"POST");
  const count=s.calls.length;
  for(const path of ["predict","indicators","players/squads?team=1","fixtures/lineups?fixture=202","standings?league=135&season=2026&page=2","fixtures/statistics?fixture=501","teams?search=ab&search=cd"])
    assert.equal((await call(path)).status,403,path);
  assert.equal((await s.request("/predict?fixture=101","Bearer "+data.token)).status,401);
  assert.equal(count,s.calls.length);
  assert.equal((await call("fixtures?team=1&last=5&status=FT&timezone=Europe/Rome")).status,200);
  assert.equal((await call("fixtures/statistics?fixture=501")).status,200);
  const other=await visitor(s,"b");
  assert.equal((await other.call("fixtures/statistics?fixture=501")).status,403);
  const scoped=await call("standings?league=135&season=2026");
  assert.match(scoped.headers.get("cache-control"),/no-store/);
  for(let i=0;i<16;i++) await call("resolve?team=3","POST");
  assert.equal((await call("resolve?team=3","POST")).status,429);
  s.env.DB=null; assert.equal((await call("teams?search=mil")).status,503);
  s.env.GUEST_ENABLED="0"; assert.equal((await call("teams?search=mil")).status,404);
});
test("registration, five daily distinct fixtures, same-day reopen, PRO and expired account",async()=>{
  const s=guestSandbox(), account={email:"guest@example.test",password:"synthetic-password"};
  const start=Date.now();
  const res=await s.request("/auth/register","","POST",account);
  const {token}=await res.json();assert.ok(token);
  const user=s.sqlite.prepare("SELECT trial_ends_at FROM users").get();
  assert.ok(user.trial_ends_at>=start+7*86400000 && user.trial_ends_at<=Date.now()+7*86400000);
  const open=id=>s.request("/analysis/open","Bearer "+token,"POST",{fixture:id});
  for(const id of [1,2,3,4,5,1]) assert.equal((await open(id)).status,200);
  assert.equal((await open(6)).status,429);
  s.sqlite.exec("UPDATE users SET trial_ends_at=0,paid_until=0");
  assert.equal((await open(6)).status,402);
  s.sqlite.exec("UPDATE users SET paid_until=9999999999999");
  assert.equal((await open(6)).status,200);
});

test("cached public data costs no extra relay credit; semantic errors are retried and never admitted",async()=>{
  const s=guestSandbox(),{call}=await visitor(s);
  s.env.GUEST_API_DAILY_BUDGET=2;
  assert.equal((await call("teams?search=Milan")).status,200);
  assert.equal((await call("teams?search=Milan")).status,200);
  assert.equal(s.calls.length,1);
  assert.equal((await call("resolve?team=90","POST")).status,502);
  assert.equal((await call("resolve?team=90","POST")).status,429);
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) n FROM guest_analysis").get().n,0);
  assert.equal(s.calls.length,2);
});
test("reservations expire and belong to the installation that requested them",async()=>{
  const s=guestSandbox(),a=await visitor(s),b=await visitor(s,"b");
  const {ticket}=await (await a.call("resolve?team=1","POST")).json();
  assert.equal((await b.call("open?ticket="+ticket,"POST")).status,409);
  s.sqlite.prepare("UPDATE guest_candidate SET expires=0 WHERE ticket=?").run(ticket);
  assert.equal((await a.call("open?ticket="+ticket,"POST")).status,409);
  assert.equal((await visitor(s)).data.fixture,null);
});
