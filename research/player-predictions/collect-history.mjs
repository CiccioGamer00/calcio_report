import { classify } from './audit.mjs';

// Explicit research action only: never invoked during ordinary app search.
export async function collectHistory(snapshot,{token,fetcher=fetch,budget=30,existing=[]}={}){
 if(!token || !Number.isInteger(budget)||budget<1||budget>30)throw Error('Access and budget 1..30 required');
 const fixtures=new Map();
 for(const team of snapshot.teams||[])for(const h of team.history||[]){
  const f=h.fixture;
  if(Number.isInteger(f?.fixture?.id)&&f.fixture.status?.short==='FT'&&Date.parse(f.fixture.date)<Date.parse(snapshot.completedAt))fixtures.set(f.fixture.id,f);
 }
 if(fixtures.size>10)throw Error('Maximum ten historical fixtures per research batch');
 const paths=[...fixtures.keys()].flatMap(id=>['lineups','events','statistics'].map(e=>`/fixtures/${e}?fixture=${id}`));
 const allowed=new Set(paths),cached=new Map();
 for(const e of existing){
  // Reuse only explicit successful sports entries, preserving observation time.
  if(allowed.has(e.path)&&Number.isFinite(Date.parse(e.observedAt))&&['success','empty'].includes(classify(200,e.data)))cached.set(e.path,{...e,kind:classify(200,e.data)});
 }
 const entries=[];let requests=0;
 for(const path of paths){
  if(cached.has(path)){entries.push(cached.get(path));continue;}
  if(requests>=budget){entries.push({path,kind:'budget_exhausted'});continue;}
  requests++;
  let response;
  try{response=await fetcher('https://api.calcioreport.com'+path,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{entries.push({path,kind:'transport_error',observedAt:new Date().toISOString()});continue;}
  if([401,403,429].includes(response.status))throw Error('Access or rate limit: stopped');
  let data;try{data=await response.json();}catch{entries.push({path,kind:'parse_error',observedAt:new Date().toISOString()});continue;}
  const kind=classify(response.status,data);
  if(kind==='api_error' && /rate.?limit|too many requests|requests per minute/i.test(JSON.stringify(data.errors||data.error)))throw Error('Rate limit: stopped');
  entries.push({path,kind,observedAt:new Date().toISOString(),...(['success','empty'].includes(kind)?{data}:{})});
 }
 return {purpose:'historical_quality_only',requests,entries,fixtures:[...fixtures.values()],note:'Collected after the matches: not a historical pre-match feature snapshot.'};
}
