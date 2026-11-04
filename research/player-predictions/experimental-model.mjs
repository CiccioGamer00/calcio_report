import {completeLineups,rows} from './audit.mjs';
export const MODEL_VERSION='starter-hazard-v1-experimental';
// Bernoulli likelihood for at-least-one event over exposure t=minutes/90.
// P(event | t)=1-exp(-rate*t). Prior strength is fixed research configuration.
export function fitHazard(records,{priorProbability=.5,priorWeight=1}={}){
 if(!records.length||!Number.isFinite(priorProbability)||priorProbability<=0||priorProbability>=1||!Number.isFinite(priorWeight)||priorWeight<=0)throw Error('Invalid hazard inputs');
 if(records.some(r=>![0,1].includes(r.outcome)||!Number.isFinite(r.minutes)||r.minutes<=0||r.minutes>90))throw Error('Invalid exposure');
 const derivative=rate=>records.reduce((s,r)=>{const t=r.minutes/90;return s+t*(r.outcome/Math.expm1(rate*t)-(1-r.outcome));},0)+priorWeight*(priorProbability/Math.expm1(rate)-(1-priorProbability));
 let lo=1e-9,hi=32;for(let n=0;n<100;n++){const mid=(lo+hi)/2;if(derivative(mid)>0)lo=mid;else hi=mid;}return (lo+hi)/2;
}
export function experimentalForecast({fixture,lineups,training,forecastAt,market,priorStarts=10}){
 if(!['scorer','booking'].includes(market)||!Number.isFinite(priorStarts)||priorStarts<=0)throw Error('Invalid model configuration');
 const now=Date.parse(forecastAt),kickoff=Date.parse(fixture?.fixture?.date);
 const ids=[fixture?.teams?.home?.id,fixture?.teams?.away?.id];
 if(!Number.isFinite(now)||!Number.isFinite(kickoff)||now>=kickoff||fixture.fixture.status?.short!=='NS'||ids.some(id=>!Number.isInteger(id))||ids[0]===ids[1])throw Error('Upcoming valid fixture required');
 const common={modelVersion:MODEL_VERSION,market,fixtureId:fixture.fixture.id,forecastAt,kickoff:fixture.fixture.date,predictions:[],experimental:true};
 if(!completeLineups(lineups,ids))return {...common,status:'waiting_official_lineups'};
 const lineupTime=Date.parse(lineups.observedAt);
 if(!Number.isFinite(lineupTime)||lineupTime>now)throw Error('Lineup observation time invalid');
 if(now-lineupTime>3600000)return {...common,status:'refresh_official_lineups'};
 const seen=new Set();
 const pool=training.filter(r=>r.market===market&&r.leagueId===fixture.league.id&&r.season===fixture.league.season&&r.starter===true).filter(r=>{
  const observed=Date.parse(r.observedAt),played=Date.parse(r.kickoff);
  if(!Number.isFinite(observed)||!Number.isFinite(played)||observed>now||played>=now||observed<played||r.fixtureId===fixture.fixture.id)throw Error('Training chronology invalid');
  if(!Number.isInteger(r.playerId)||!Number.isInteger(r.teamId)||!Number.isInteger(r.fixtureId))throw Error('Training identity invalid');
  const key=`${r.fixtureId}:${r.playerId}`;if(seen.has(key))throw Error('Duplicate training row');seen.add(key);return true;
 });
 if(pool.length<20)return {...common,status:'insufficient_training'};
 const poolRate=fitHazard(pool),priorProbability=-Math.expm1(-poolRate);
 const latestInputObservedAt=new Date(Math.max(lineupTime,...pool.map(r=>Date.parse(r.observedAt)))).toISOString();
 const probability=(rate,minutes)=>-Math.expm1(-rate*minutes/90);
 const poolMean=rate=>pool.reduce((s,r)=>s+probability(rate,r.minutes),0)/pool.length;
 const predictions=ids.flatMap(teamId=>rows(lineups).find(l=>l.team.id===teamId).startXI.map(p=>{
  const playerId=p.player.id;
  // Exact club avoids silently carrying a player's previous-club context.
  const history=pool.filter(r=>r.playerId===playerId&&r.teamId===teamId).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)).slice(0,5);
  const rate=history.length?fitHazard(history,{priorProbability,priorWeight:priorStarts}):poolRate;
  const personal=history.reduce((s,r)=>s+probability(rate,r.minutes),0);
  return {fixtureId:fixture.fixture.id,playerId,teamId,forecastAt,kickoff:fixture.fixture.date,latestInputObservedAt,
   probability:(personal+priorStarts*poolMean(rate))/(history.length+priorStarts),baselineProbability:poolMean(poolRate),
   priorStarts,historyStarts:history.length,minuteSource:history.length?'recent_starts_and_sample_prior':'sample_prior',
   refereeAdjustment:1,refereeStatus:'not_validated',conditionalOn:'official_starter',market};
 }));
 return {...common,status:'experimental_ready',predictions,trainingRows:pool.length,trainingFixtures:new Set(pool.map(r=>r.fixtureId)).size,
  limitations:['Uncalibrated small-sample research model','No validated referee, opponent, role or penalty-taker effects','Constant hazard and empirical minute distribution assumptions','Not for public display']};
}
