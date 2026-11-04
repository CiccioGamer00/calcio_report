import { rows, numberOrNull } from './audit.mjs';
import { participation } from './participation.mjs';

// Outcome reconstruction, not a prediction. Never use these rows as pre-match features.
export function scorerLabels({fixture,lineups,events}){
 const reasons=[];
 if(fixture?.fixture?.status?.short!=='FT'||!['success','empty'].includes(events?.kind))return {usable:false,reasons:['fixture_or_events_unavailable'],labels:null};
 const ids=[fixture.teams?.home?.id,fixture.teams?.away?.id];
 if(ids.some(id=>!Number.isInteger(id))||ids[0]===ids[1])return {usable:false,reasons:['invalid_teams'],labels:null};
 const scores=[numberOrNull(fixture.goals?.home),numberOrNull(fixture.goals?.away)];
 if(scores.some(s=>s===null||!Number.isInteger(s)))return {usable:false,reasons:['score_unavailable'],labels:null};
 const goals=rows(events).filter(e=>e.type==='Goal' && e.detail!=='Missed Penalty');
 if(goals.some(e=>!['Normal Goal','Penalty','Own Goal'].includes(e.detail)||!ids.includes(e.team?.id)))reasons.push('unknown_goal_type_or_team');
 ids.forEach((id,i)=>{if(goals.filter(e=>e.team?.id===id).length!==scores[i])reasons.push('goals_do_not_match_score');});
 const timelines=ids.map(teamId=>participation({teamId,lineups,events}));
 if(timelines.some(t=>!t.usable))reasons.push('participation_unresolved');
 const participantIds=timelines.flatMap(t=>(t.intervals||[]).map(p=>p.playerId));
 if(new Set(participantIds).size!==participantIds.length)reasons.push('player_id_shared_by_teams');
 const scorers=new Set();
 for(const e of goals){
  // Own goals count in the match score, never as a scorer success.
  if(e.detail==='Own Goal')continue;
  const team=ids.indexOf(e.team?.id),t=timelines[team];
  const span=t?.intervals?.find(p=>p.playerId===e.player?.id);
  const minute=numberOrNull(e.time?.elapsed),extra=e.time?.extra==null?0:numberOrNull(e.time.extra);
  if(!span||minute===null||minute>90||extra===null||!Number.isInteger(minute)||!Number.isInteger(extra)){reasons.push('goal_identity_or_time_unresolved');continue;}
  const key=minute*1000+extra;
  if((span.in!==0&&key<=span.in)||(span.out!==null&&key>=span.out)){reasons.push('goal_at_or_outside_participation_boundary');continue;}
  scorers.add(e.player.id);
 }
 if(reasons.length)return {usable:false,reasons:[...new Set(reasons)],labels:null};
 return {usable:true,reasons:[],labels:timelines.flatMap((t,i)=>t.intervals.map(p=>({fixtureId:fixture.fixture.id,teamId:ids[i],playerId:p.playerId,scored:scorers.has(p.playerId)?1:0}))),
  note:'Post-match scorer outcomes reconciled against score and participant IDs. No pre-match features or predictive accuracy implied.'};
}
