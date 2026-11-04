import test from 'node:test';import assert from 'node:assert/strict';
import {refereeQuality} from '../research/player-predictions/referee-quality.mjs';
const ctx={leagueId:135,season:2026,asOf:'2026-11-04T12:00:00Z'};
const obs=(id,ref,yellow)=>({fixture:{fixture:{id,referee:ref,date:'2026-11-01T12:00:00Z',status:{short:'FT'}},league:{id:135,season:2026},teams:{home:{id:1},away:{id:2}}},statistics:{kind:'success',observedAt:'2026-11-03T12:00:00Z',data:{response:[1,2].map(id=>({team:{id},statistics:[{type:'Yellow Cards',value:yellow},{type:'Fouls',value:0}]}))}}});
test('small sample shrinks toward other referees, no probability output',()=>{
 const r=refereeQuality([obs(1,'A',4),obs(2,'B',1)],ctx);const a=r.referees[0];
 assert.equal(a.meanYellow,8);assert.equal(a.baselineMean,2);assert.ok(a.shrunkMean>2&&a.shrunkMean<3);assert.equal(r.predictions,null);
});
test('late data and later fixtures cannot enter historical cutoff',()=>{
 const a=obs(1,'A',1);a.statistics.observedAt='2026-11-05T12:00:00Z';const b=obs(2,'B',1);b.fixture.fixture.date='2026-11-06T12:00:00Z';
 assert.equal(refereeQuality([a,b],ctx).matches,0);
});
test('duplicate fixtures excluded; same surname does not join identities',()=>{
 const a=obs(1,'A Rossi',1);const r=refereeQuality([a,a,obs(2,'A Rossi',1),obs(3,'B Rossi',1)],ctx);
 assert.equal(r.excluded.duplicate,2);assert.equal(r.referees.length,2);
});
test('missing cards remain unknown and zero baseline cannot become ratio',()=>{
 const a=obs(1,'A',null);const r=refereeQuality([a,obs(2,'B',0),obs(3,'C',0)],ctx);
 assert.equal(r.excluded.statistics,1);assert.equal(r.sampleMeanYellow,0);assert.equal(r.referees[0].relativeRate,null);
});
test('one referee cannot supply own baseline',()=>{assert.equal(refereeQuality([obs(1,'A',1)],ctx).referees[0].shrunkMean,null);});
