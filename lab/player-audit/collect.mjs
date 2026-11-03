import {audit,classify,rows,refereeKey} from './audit.mjs';
const BASE='https://api.calcioreport.com';
export async function collect(fixtureId,{token,fetcher=fetch,now=()=>new Date().toISOString(),budget=40,onProgress=()=>{}}={}) {
  if (!/^\d+$/.test(String(fixtureId)) || Number(fixtureId)<=0 || !token) throw Error('Fixture ID and CR_AUDIT_TOKEN required');
  if (!Number.isInteger(budget)||budget<1||budget>40) throw Error('Request budget must be 1..40');
  let count=0; const entries=[]; const cache=new Map();
  async function get(path) {
    if(cache.has(path))return cache.get(path);
    let entry;
    if(count>=budget) entry={path,kind:'budget_exhausted',observedAt:now()};
    else {
      count++;
      try {
        const response=await fetcher(BASE+path,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20000)});
        if([401,403].includes(response.status))throw Error('AUTH_STOP');
        if(response.status===429)throw Error('LIMIT_STOP');
        const data=await response.json();
        const kind=classify(response.status,data);
        if(kind==='api_error' && /rate.?limit|too many requests|requests per minute/i.test(JSON.stringify(data.errors || data.error)))throw Error('LIMIT_STOP');
        // Never persist arbitrary error bodies, request headers or credentials.
        entry={path,kind,observedAt:now(),cache:response.headers?.get('x-cr-cache') || null,age:response.headers?.get('age') || null,data:['success','empty'].includes(kind)?data:undefined};
      } catch(e) {if(e.message==='AUTH_STOP')throw Error('Access denied: collection stopped');if(e.message==='LIMIT_STOP')throw Error('Rate limit: collection stopped');entry={path,kind:'transport_or_parse_error',observedAt:now()};}
    }
    entries.push(entry);cache.set(path,entry);onProgress({requests:count,path,kind:entry.kind});return entry;
  }
  const snapshot={schemaVersion:1,startedAt:now(),entries,teams:[],refereeHistory:[]};
  snapshot.target=await get(`/fixtures?id=${fixtureId}`);
  const f=rows(snapshot.target)[0];
  if(!f || f.fixture?.status?.short!=='NS' || !(Date.parse(f.fixture.date)>Date.parse(now())))throw Error('Only upcoming fixtures: historical season totals would leak future information');
  if(!Number.isInteger(f.league?.id)||!Number.isInteger(f.league?.season)||![f.teams?.home?.id,f.teams?.away?.id].every(Number.isInteger))throw Error('Invalid fixture context');
  snapshot.coverage=await get(`/leagues?id=${f.league.id}&season=${f.league.season}`);
  snapshot.lineups=await get(`/fixtures/lineups?fixture=${fixtureId}`);
  snapshot.injuries=await get(`/injuries?fixture=${fixtureId}`);
  for(const teamId of [f.teams.home.id,f.teams.away.id]) {
    const team={teamId,pages:[],history:[]};snapshot.teams.push(team);
    for(let page=1;page<=6;page++) {
      const result=await get(`/players?team=${teamId}&league=${f.league.id}&season=${f.league.season}&page=${page}`);team.pages.push(result);
      if(result.kind!=='success' || result.data.paging?.total<=page || !Number.isInteger(result.data.paging?.total))break;
    }
    const history=await get(`/fixtures?team=${teamId}&league=${f.league.id}&season=${f.league.season}&last=5&status=FT`);
    for(const h of rows(history).filter(h=>h.fixture?.status?.short==='FT' && h.league?.id===f.league.id && [h.teams?.home?.id,h.teams?.away?.id].includes(teamId) && Date.parse(h.fixture.date)<Date.parse(snapshot.startedAt))) {
      team.history.push({fixture:h,players:await get(`/fixtures/players?fixture=${h.fixture.id}`)});
    }
  }
  // Conservative exact referee identity. Never infer identity from a surname.
  const ref=refereeKey(f.fixture.referee);
  if(ref && ref!=='—') {
    const pool=await get(`/fixtures?league=${f.league.id}&season=${f.league.season}&last=50&status=FT`);
    for(const h of rows(pool).filter(h=>h.fixture?.status?.short==='FT' && h.league?.id===f.league.id && Date.parse(h.fixture.date)<Date.parse(snapshot.startedAt) && refereeKey(h.fixture.referee)===ref).slice(0,5)) {
      snapshot.refereeHistory.push({fixture:h,statistics:await get(`/fixtures/statistics?fixture=${h.fixture.id}`)});
    }
  }
  snapshot.completedAt=now();snapshot.requests=count;snapshot.report=audit(snapshot);return snapshot;
}
