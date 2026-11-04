import test from 'node:test';import assert from 'node:assert/strict';import {buildTraining} from '../research/player-predictions/build-training.mjs';
function data(){
 const f={fixture:{id:1,status:{short:'FT'},date:'2026-11-01T12:00:00Z'},league:{id:135,season:2026},teams:{home:{id:1},away:{id:2}},goals:{home:0,away:0}};
 const e=(path,response)=>({path,kind:response.length?'success':'empty',observedAt:'2026-11-02T12:00:00Z',data:{response}});
 const lineups=e('/fixtures/lineups?fixture=1',[1,2].map(id=>({team:{id},startXI:Array.from({length:11},(_,i)=>({player:{id:id*100+i}})),substitutes:[]})));
 const players=e('/fixtures/players?fixture=1',[1,2].map(id=>({team:{id},players:Array.from({length:11},(_,i)=>({player:{id:id*100+i},statistics:[{games:{minutes:90},cards:{yellow:0}}]}))})));
 const stats=e('/fixtures/statistics?fixture=1',[1,2].map(id=>({team:{id},statistics:[{type:'Yellow Cards',value:0}]})));
 return [{entries:[players]},{fixtures:[f],entries:[lineups,e('/fixtures/events?fixture=1',[]),stats]}];
}
test('bank keeps source times and markets separate',()=>{const [s,h]=data();const r=buildTraining(s,h);assert.equal(r.records.length,44);assert.ok(r.records.every(x=>x.observedAt==='2026-11-02T12:00:00.000Z'&&x.starter));});
test('missing or inconsistent minutes never become exposure',()=>{const [s,h]=data();s.entries[0].data.response[0].players[0].statistics[0].games.minutes=null;const r=buildTraining(s,h);assert.equal(r.records.length,42);assert.equal(r.excluded.length,2);});
test('missing source timestamp blocks affected training records',()=>{const [s,h]=data();delete s.entries[0].observedAt;assert.equal(buildTraining(s,h).records.length,0);});
