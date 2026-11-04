import test from 'node:test';
import assert from 'node:assert/strict';
import {crosscheckLineup} from '../research/player-predictions/lineup-crosscheck.mjs';
const entry=response=>({kind:response.length?'success':'empty',data:{response}});
function sample(){return {teamId:1,lineups:entry([{team:{id:1},startXI:Array.from({length:11},(_,i)=>({player:{id:i+1}}))}]),events:entry([{team:{id:1},type:'subst',time:{elapsed:60,extra:null},player:{id:1},assist:{id:12}}]),players:entry([{team:{id:1},players:Array.from({length:12},(_,i)=>({player:{id:i+1},statistics:[{games:{minutes:30,substitute:false}}]}))}])};}
test('official XI plus events resolves wrong legacy flag',()=>{const r=crosscheckLineup(sample());assert.equal(r.usable,true);assert.equal(r.legacyFlagDisagreements,1);assert.equal(r.appearedIds.length,12);});
test('missing events cannot become no substitutions',()=>{const s=sample();s.events.kind='api_error';assert.equal(crosscheckLineup(s).usable,false);});
test('unexplained appearances and reversed substitutions fail',()=>{const s=sample();s.events=entry([]);assert.ok(crosscheckLineup(s).reasons.includes('unexplained_appearance'));const p=sample();p.events.data.response[0].player.id=12;p.events.data.response[0].assist.id=1;assert.equal(crosscheckLineup(p).usable,false);});
test('duplicate official XI fails',()=>{const s=sample();s.lineups.data.response[0].startXI[10].player.id=1;assert.equal(crosscheckLineup(s).usable,false);});
