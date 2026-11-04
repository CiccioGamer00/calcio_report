import test from 'node:test';
import assert from 'node:assert/strict';
import { recentQuality } from '../research/player-predictions/recent-quality.mjs';
const player = (id, sub=false, minutes=90) => ({player:{id},statistics:[{games:{substitute:sub,minutes},shots:{total:0,on:null},goals:{total:null},cards:{yellow:0}}]});
const sample = players => ({teams:[{teamId:1,history:[{fixture:{fixture:{id:2}},players:{kind:'success',data:{response:[{team:{id:1},players}]}}}]}]});
test('rejects impossible starter count despite successful feed',()=>{
 const q=recentQuality(sample(Array.from({length:16},(_,i)=>player(i+1))))[0];
 assert.equal(q.matches[0].usableStartingStatus,false);
 assert.equal(q.matches[0].declaredStarters,16);
});
test('coverage denominator includes only positive known minutes; null is not zero',()=>{
 const players=Array.from({length:11},(_,i)=>player(i+1));
 players.push(player(12,true,0),player(13,true,null));
 const q=recentQuality(sample(players))[0];
 assert.equal(q.played,11);assert.equal(q.zeroMinutes,1);assert.equal(q.missingMinutes,1);
 assert.deepEqual(q.coverageAmongPlayed,{shots:11,onTarget:0,goals:0,yellow:11,fouls:0});
 assert.equal(q.matches[0].usableStartingStatus,true);
});
test('duplicate player and missing team cannot pass the gate',()=>{
 const p=Array.from({length:11},(_,i)=>player(i+1));p.push(player(1));
 assert.equal(recentQuality(sample(p))[0].matches[0].usableStartingStatus,false);
 const s=sample(p);s.teams[0].history[0].players.kind='api_error';
 assert.deepEqual(recentQuality(s)[0].matches[0].reasons,['team_sheet_unavailable']);
});
