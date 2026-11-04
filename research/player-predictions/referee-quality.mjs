import { refereeObservation, refereeKey } from './audit.mjs';

// Descriptive shrinkage only. This is not a player booking probability model.
export function refereeQuality(observations,{leagueId,season,asOf,priorMatches=10}={}){
 const cutoff=Date.parse(asOf);
 if(!Number.isFinite(cutoff)||!Number.isInteger(leagueId)||!Number.isInteger(season)||!Number.isFinite(priorMatches)||priorMatches<=0)throw Error('Explicit context and positive prior required');
 const seen=new Set(),duplicates=new Set();
 for(const o of observations){const id=o.fixture?.fixture?.id;if(seen.has(id))duplicates.add(id);seen.add(id);}
 const accepted=[],excluded={duplicate:0,context:0,time:0,referee:0,statistics:0};
 for(const o of observations){
  const f=o.fixture,id=f?.fixture?.id;
  if(duplicates.has(id)){excluded.duplicate++;continue;}
  if(!Number.isInteger(id)||f.league?.id!==leagueId||f.league?.season!==season||f.fixture.status?.short!=='FT'){excluded.context++;continue;}
  const played=Date.parse(f.fixture.date),observed=Date.parse(o.statistics?.observedAt);
  if(!Number.isFinite(played)||!Number.isFinite(observed)||played>=cutoff||observed>cutoff||observed<played){excluded.time++;continue;}
  const key=refereeKey(f.fixture.referee);
  if(!key||key==='—'){excluded.referee++;continue;}
  const teamIds=[f.teams?.home?.id,f.teams?.away?.id];
  if(teamIds.some(id=>!Number.isInteger(id))||teamIds[0]===teamIds[1]){excluded.context++;continue;}
  const stat=refereeObservation(o.statistics,teamIds);
  if(!stat){excluded.statistics++;continue;}
  accepted.push({id,key,...stat});
 }
 const mean=accepted.length?accepted.reduce((s,r)=>s+r.yellow,0)/accepted.length:null;
 const keys=[...new Set(accepted.map(r=>r.key))];
 return {status:'descriptive_only',matches:accepted.length,excluded,sampleMeanYellow:mean,priorMatches,
  referees:keys.map(key=>{
   const own=accepted.filter(r=>r.key===key),other=accepted.filter(r=>r.key!==key);
   const ownMean=own.reduce((s,r)=>s+r.yellow,0)/own.length;
   // Exclude this referee from the comparison mean to avoid self-comparison.
   const baseline=other.length?other.reduce((s,r)=>s+r.yellow,0)/other.length:null;
   const weight=own.length/(own.length+priorMatches);
   const shrunk=baseline===null?null:weight*ownMean+(1-weight)*baseline;
   return {key,matches:own.length,meanYellow:ownMean,otherRefereeMatches:other.length,
    baselineMean:baseline,sampleWeight:weight,shrunkMean:shrunk,
    relativeRate:baseline>0?shrunk/baseline:null,
    foulsMatches:own.filter(r=>r.fouls!==null).length};
  }),predictions:null,note:'Recent sample, not a full-league baseline. Prior strength is unvalidated. Exact referee strings only; aliases are not merged. Team/opponent assignment may confound differences.'};
}
