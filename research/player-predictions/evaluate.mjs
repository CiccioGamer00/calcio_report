// Paired evaluation harness: accepts saved pre-match forecasts, never fits a model.
export function evaluateForecasts(forecasts,outcomes){
 const key=r=>`${r.fixtureId}:${r.playerId}`;
 const truth=new Map();
 for(const o of outcomes){if(truth.has(key(o))||![0,1].includes(o.outcome))throw Error('Duplicate or invalid outcome');truth.set(key(o),o);}
 const seen=new Set(),accepted=[];let unknownOutcomes=0;
 for(const p of forecasts){
  if(!Number.isInteger(p.fixtureId)||!Number.isInteger(p.playerId)||seen.has(key(p)))throw Error('Duplicate or invalid forecast identity');seen.add(key(p));
  const forecast=Date.parse(p.forecastAt),kickoff=Date.parse(p.kickoff),latest=Date.parse(p.latestInputObservedAt);
  if(![forecast,kickoff,latest].every(Number.isFinite)||forecast>=kickoff||latest>forecast)throw Error('Forecast chronology not proven');
  for(const value of [p.probability,p.baselineProbability])if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw Error('Invalid paired probability');
  const o=truth.get(key(p));if(!o){unknownOutcomes++;continue;}
  accepted.push({...p,outcome:o.outcome});
 }
 const epsilon=1e-15;
 const score=field=>accepted.length?{
  brier:accepted.reduce((s,p)=>s+(p[field]-p.outcome)**2,0)/accepted.length,
  logLoss:accepted.reduce((s,p)=>{const q=Math.max(epsilon,Math.min(1-epsilon,p[field]));return s-p.outcome*Math.log(q)-(1-p.outcome)*Math.log(1-q);},0)/accepted.length
 }:null;
 return {forecasts:forecasts.length,evaluated:accepted.length,unknownOutcomes,fixtures:new Set(accepted.map(p=>p.fixtureId)).size,
  model:score('probability'),baseline:score('baselineProbability'),logLossClip:epsilon,
  note:'Paired same-player evaluation only. Caller must preserve snapshot provenance and use fixture-grouped temporal training/tuning/test sets. Metrics alone do not establish calibration or superiority.'};
}
