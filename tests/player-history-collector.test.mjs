import test from 'node:test';
import assert from 'node:assert/strict';
import {collectHistory} from '../research/player-predictions/collect-history.mjs';
const snapshot={completedAt:'2026-11-04T10:00:00Z',teams:[{history:[{fixture:{fixture:{id:1,date:'2026-11-01T10:00:00Z',status:{short:'FT'}}}}]}]};
const ok={status:200,json:async()=>({errors:[],response:[]})};
test('reuses successful existing sports responses and respects budget',async()=>{
 const s=structuredClone(snapshot);s.teams.push(s.teams[0]);let calls=0;
 const existing=[{path:'/fixtures/lineups?fixture=1',observedAt:'2026-11-03T10:00:00Z',data:{errors:[],response:[]}}];
 const r=await collectHistory(s,{token:'test',budget:1,existing,fetcher:async url=>{calls++;assert.equal(url,'https://api.calcioreport.com/fixtures/events?fixture=1');return ok;}});
 assert.equal(calls,1);assert.equal(r.entries.length,3);assert.equal(r.entries[2].kind,'budget_exhausted');assert.ok(!JSON.stringify(r).includes('Bearer'));
});
test('auth and semantic limits stop without retries',async()=>{
 for(const res of [{status:401},{status:403},{status:429},{status:200,json:async()=>({errors:{rate:'Too many requests'},response:[]})}]){
 let calls=0;await assert.rejects(collectHistory(snapshot,{token:'test',fetcher:async()=>{calls++;return res;}}));assert.equal(calls,1);
 }
});
test('error bodies never saved or reused',async()=>{
 const r=await collectHistory(snapshot,{token:'test',budget:1,existing:[{path:'/fixtures/lineups?fixture=1',observedAt:'2026-11-03T10:00:00Z',data:{errors:{bad:'private error'},response:[]}}],fetcher:async()=>({status:500,json:async()=>({error:'private error'})})});
 assert.equal(r.requests,1);assert.ok(!JSON.stringify(r).includes('private error'));
});
