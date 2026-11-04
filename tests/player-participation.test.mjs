import test from 'node:test';
import assert from 'node:assert/strict';
import {participation} from '../research/player-predictions/participation.mjs';
const entry=response=>({kind:response.length?'success':'empty',data:{response}});
const event=(id,m,detail='Yellow Card',extra=null)=>({team:{id:1},type:'Card',detail,player:{id},time:{elapsed:m,extra}});
const sub=(out,inc,m)=>({...event(out,m),type:'subst',assist:{id:inc}});
const run=ev=>participation({teamId:1,lineups:entry([{team:{id:1},startXI:Array.from({length:11},(_,i)=>({player:{id:i+1}})),substitutes:[{player:{id:12}},{player:{id:13}}]}]),events:entry(ev)});
test('distinguishes bench, pitch, former player and anonymous card',()=>{
 const r=run([event(12,20),sub(1,12,60),event(12,70),event(1,75),event(null,80)]);
 assert.deepEqual(r.cards.map(c=>c.location),['off_pitch','on_pitch','off_pitch','unattributed']);
 assert.deepEqual(r.onPitchBookedIds,[12]);assert.equal(r.intervals.find(p=>p.playerId===12).nominalMinutes,30);
});
test('same minute card and change remains ambiguous in either source order',()=>{
 for(const ev of [[event(1,60),sub(1,12,60)],[sub(1,12,60),event(1,60)]])assert.equal(run(ev).cards[0].location,'boundary_unknown');
});
test('red ends participation but is not a yellow',()=>{
 const r=run([event(1,50,'Red Card'),event(1,70)]);
 assert.equal(r.cards[0].yellow,false);assert.equal(r.cards[1].location,'off_pitch');assert.deepEqual(r.onPitchBookedIds,[]);
});
test('second yellow does not double count a booked player',()=>{
 const r=run([event(1,20),event(1,60,'Second Yellow card')]);assert.deepEqual(r.onPitchBookedIds,[1]);assert.equal(r.uncertainCards,1);
});
test('45+2 sorts before second-half change, not after minute 46',()=>{
 const r=run([sub(1,12,46),event(1,45,'Yellow Card',2)]);assert.equal(r.cards[0].location,'on_pitch');
});
test('bad transition prevents confident card attribution',()=>{
 const r=run([sub(12,13,50),event(1,60)]);assert.equal(r.usable,false);assert.equal(r.cards[0].location,'timeline_unknown');
});
test('extra time and missing timestamps are unsupported',()=>{assert.equal(run([event(1,110)]).usable,false);assert.equal(run([event(1,null)]).usable,false);});
test('invalid roster and failed event feed block reconstruction',()=>{
 const lineups=entry([{team:{id:1},startXI:Array.from({length:11},(_,i)=>({player:{id:i+1}})),substitutes:[{player:{id:1}}]}]);
 assert.equal(participation({teamId:1,lineups,events:entry([])}).usable,false);
 assert.equal(participation({teamId:1,lineups,events:{kind:'api_error'}}).usable,false);
});
test('anonymous unused bench preserves known players but never invents identities',()=>{
 const lineups=entry([{team:{id:1},startXI:Array.from({length:11},(_,i)=>({player:{id:i+1}})),substitutes:[{player:{id:null}},{player:{id:null}}]}]);
 const r=participation({teamId:1,lineups,events:entry([event(1,30),event(null,50)])});
 assert.equal(r.usable,true);assert.deepEqual(r.warnings,['unidentified_bench_members']);assert.equal(r.cards[1].location,'unattributed');
 const bad=participation({teamId:1,lineups,events:entry([sub(1,null,60)])});assert.equal(bad.usable,false);
});
