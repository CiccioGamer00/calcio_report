import test from 'node:test';
import assert from 'node:assert/strict';
import {numberOrNull,classify,completeLineups,playerStats,refereeObservation,audit} from '../research/player-predictions/audit.mjs';
import {collect} from '../research/player-predictions/collect.mjs';
const before='2026-11-03T12:00:00Z', after='2026-11-04T12:00:00Z';
const target={fixture:{id:1,date:after,status:{short:'NS'},referee:'A. Example'},league:{id:135,season:2026},teams:{home:{id:10},away:{id:20}}};
const entry=response=>({kind:response.length?'success':'empty',observedAt:before,data:{response,errors:[],paging:{current:1,total:1}}});
const lineups=()=>entry([10,20].map(id=>({team:{id},startXI:Array.from({length:11},(_,i)=>({player:{id:id*100+i}}))})));
const snapshot=()=>({target:entry([target]),lineups:lineups(),injuries:entry([]),completedAt:before,entries:[],teams:[],refereeHistory:[]});
test('missing values stay unknown, genuine zero remains zero',()=>{
 for(const v of [null,undefined,'','  ',false,'bad',-1,Infinity,[],{}])assert.equal(numberOrNull(v),null);
 assert.equal(numberOrNull(0),0);assert.equal(numberOrNull('3'),3);
});
test('HTTP 200 semantic errors cannot become success or zero',()=>{
 assert.equal(classify(200,{errors:{rateLimit:'limit'},response:[]}), 'api_error');
 assert.equal(classify(200,{errors:[],response:[]}), 'empty');
 assert.equal(classify(403,{response:[]}), 'http_403');
 assert.equal(classify(200,{}),'invalid_response');
});
test('both official elevens required, no duplicates or partial lineup',()=>{
 assert.ok(completeLineups(lineups(),[10,20]));
 const p=lineups();p.data.response[1].startXI.pop();assert.equal(completeLineups(p,[10,20]),false);
 const d=lineups();d.data.response[1].startXI[0]=d.data.response[0].startXI[0];assert.equal(completeLineups(d,[10,20]),false);
 assert.equal(completeLineups(entry([]),[10,20]),false);
});
test('competition, club and season must match; no unrelated first stats fallback',()=>{
 const row={statistics:[{team:{id:99},league:{id:135,season:2026},games:{minutes:900}},
 {team:{id:10},league:{id:135,season:2026},games:{minutes:30},goals:{total:0}}]};
 assert.equal(playerStats(row,10,135,2026).minutes,30);assert.equal(playerStats(row,10,135,2026).goals,0);
 assert.equal(playerStats(row,10,135,2026).yellow,null);assert.equal(playerStats(row,10,135,2025),null);
 row.statistics.push(row.statistics[1]);assert.equal(playerStats(row,10,135,2026),null);
});
test('referee zero needs two valid team stats; missing cards or API error is not zero',()=>{
 const v=entry([10,20].map(id=>({team:{id},statistics:[{type:'Yellow Cards',value:0},{type:'Fouls',value:10}]})));
 assert.deepEqual(refereeObservation(v,[10,20]),{yellow:0,fouls:20});
 v.data.response[0].statistics[0].value=null;assert.equal(refereeObservation(v,[10,20]),null);
 assert.equal(refereeObservation({kind:'api_error'},[10,20]),null);
});
test('post-kickoff snapshot or late observations invalidate prospective use',()=>{
 const s=snapshot();assert.equal(audit(s).prospective,true);s.completedAt=after;assert.equal(audit(s).prospective,false);
 s.completedAt=before;s.entries.push({...entry([]),observedAt:after});assert.equal(audit(s).prospective,false);
});
test('unassigned referee and absent official lineups remain explicit; no predictions',()=>{
 const s=snapshot();s.target=entry([{...target,fixture:{...target.fixture,referee:null}}]);s.lineups=entry([]);
 const r=audit(s);assert.ok(r.reasons.includes('referee_unassigned'));assert.ok(r.reasons.includes('official_starting_elevens_unavailable'));assert.equal(r.predictions,null);
});
test('truncated player pages remain incomplete',()=>{
 const s=snapshot();const p=entry([{player:{id:1000},statistics:[]}]);p.data.paging.total=2;s.teams=[{teamId:10,pages:[p]}];assert.equal(audit(s).teams[0].pagesComplete,false);
 p.data.paging.total=1;assert.equal(audit(s).teams[0].pagesComplete,true);
});
function fetcherFor(handler){return async(url,options)=>{
 assert.ok(url.startsWith('https://api.calcioreport.com/'));assert.equal(options.redirect,'error');
 const x=handler(new URL(url));return {status:x.status||200,json:async()=>x.data};
};}
test('collector refuses past games before any player request',async()=>{
 let calls=0;
 await assert.rejects(collect(1,{token:'fake',now:()=>after,fetcher:fetcherFor(()=>{calls++;return {data:{response:[target]}};})}),/upcoming/);assert.equal(calls,1);
});
test('request budget caps network calls; no credential in stored snapshot',async()=>{
 let calls=0;
 const s=await collect(1,{token:'TEST_SECRET_NOT_REAL',now:()=>before,budget:1,fetcher:fetcherFor(()=>{calls++;return {data:{response:[target]}};})});
 assert.equal(calls,1);assert.equal(s.requests,1);assert.ok(s.report.reasons.includes('incomplete_season_player_pages'));
 assert.ok(!JSON.stringify(s).includes('TEST_SECRET_NOT_REAL'));assert.ok(s.entries.some(e=>e.kind==='budget_exhausted'));
});
test('401/403 abort collection immediately, no retries',async()=>{
 let calls=0;await assert.rejects(collect(1,{token:'fake',now:()=>before,fetcher:fetcherFor(()=>{calls++;return {status:403,data:{}};})}),/Access denied/);assert.equal(calls,1);
});
test('full mocked collection matches referee exactly and rejects future/history contamination',async()=>{
 const past={...target,fixture:{id:2,date:'2026-11-02T12:00:00Z',status:{short:'FT'},referee:'A. Example'}};
 const other={...past,fixture:{...past.fixture,id:3,referee:'B. Example'}};
 const s=await collect(1,{token:'fake',now:()=>before,fetcher:fetcherFor(u=>{
 let response=[],paging={current:1,total:1};
 if(u.pathname==='/fixtures')response=u.searchParams.has('id')?[target]:[past,other,{...past,fixture:{...past.fixture,id:4,date:after}}];
 if(u.pathname==='/fixtures/lineups')response=lineups().data.response;
 if(u.pathname==='/players'){const id=Number(u.searchParams.get('team'));response=[{player:{id:id*100},statistics:[{team:{id},league:target.league,games:{minutes:90},goals:{total:0}}]}];}
 if(u.pathname==='/fixtures/statistics')response=[10,20].map(id=>({team:{id},statistics:[{type:'Yellow Cards',value:1},{type:'Fouls',value:10}]}));
 return {data:{response,errors:[],paging}};
 })});
 assert.equal(s.report.official,true);assert.equal(s.report.referee.usableMatches,1);assert.equal(s.report.referee.meanYellow,2);
 assert.equal(s.report.teams[0].coverage.goals,1);assert.equal(s.report.teams[0].coverage.yellow,0);
 const paths=s.entries.map(e=>e.path);assert.equal(paths.filter(p=>p==='/fixtures/players?fixture=2').length,1);
});

test('rate limit including HTTP 200 semantics stops without retry',async()=>{
 for(const status of [200,429]){let calls=0;await assert.rejects(collect(1,{token:'fake',now:()=>before,fetcher:fetcherFor(()=>{calls++;return {status,data:{response:[],errors:{requests:'Too many requests'}}};})}),/Rate limit/);assert.equal(calls,1);}
});
