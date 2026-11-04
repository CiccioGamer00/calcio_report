import { rows, numberOrNull } from './audit.mjs';

// Minute precision cannot establish ordering at a substitution/card boundary.
const stamp=e=>{
 const m=numberOrNull(e.time?.elapsed),x=e.time?.extra==null?0:numberOrNull(e.time.extra);
 return m===null||x===null||m>90||!Number.isInteger(m)||!Number.isInteger(x)?null:{key:m*1000+x,minute:m};
};
export function participation({teamId,lineups,events}){
 const team=rows(lineups).filter(t=>t.team?.id===teamId);
 if(team.length!==1 || !['success','empty'].includes(events?.kind))return {usable:false,reasons:['feeds_unavailable']};
 const xi=(team[0].startXI||[]).map(p=>p.player?.id);
 const bench=(team[0].substitutes||[]).map(p=>p.player?.id);
 const validId=id=>Number.isInteger(id)&&id>0;
 const identifiedBench=bench.filter(validId);
 const roster=[...xi,...identifiedBench];
 const warnings=bench.length===identifiedBench.length?[]:['unidentified_bench_members'];
 if(xi.length!==11||xi.some(id=>!validId(id))||new Set(roster).size!==roster.length)return {usable:false,reasons:['invalid_roster']};
 const known=new Set(roster),active=new Map(xi.map(id=>[id,{in:0,out:null,inMinute:0,outMinute:null}]));
 const intervals=new Map(active),reasons=[],cards=[];
 const relevant=rows(events).filter(e=>e.team?.id===teamId && ['subst','Card'].includes(e.type));
 if(relevant.some(e=>stamp(e)===null))return {usable:false,reasons:['unsupported_event_time']};
 const ordered=relevant.map(e=>({...e,t:stamp(e)})).sort((a,b)=>a.t.key-b.t.key);
 for(const e of ordered){
  if(e.type==='subst'){
   const out=e.player?.id,inc=e.assist?.id;
   if(!active.has(out)||!known.has(inc)||intervals.has(inc)){reasons.push('inconsistent_substitution');continue;}
   const old=active.get(out);old.out=e.t.key;old.outMinute=e.t.minute;active.delete(out);
   const span={in:e.t.key,out:null,inMinute:e.t.minute,outMinute:null};active.set(inc,span);intervals.set(inc,span);
  }else if(['Red Card','Second Yellow card','Second Yellow Card'].includes(e.detail)){
   const id=e.player?.id;
   if(active.has(id)){const span=active.get(id);span.out=e.t.key;span.outMinute=e.t.minute;active.delete(id);}
  }
 }
 for(const e of ordered.filter(e=>e.type==='Card')){
  const id=e.player?.id,span=intervals.get(id);
  let location='off_pitch';
  if(!known.has(id))location='unattributed';
  else if(span){
   if((span.in!==0&&e.t.key===span.in)||(span.out!==null&&e.t.key===span.out))location='boundary_unknown';
   else if(e.t.key>=span.in&&(span.out===null||e.t.key<span.out))location='on_pitch';
  }
  if(reasons.length && location!=='unattributed')location='timeline_unknown';
  const yellow=['Yellow Card','Second Yellow card','Second Yellow Card'].includes(e.detail);
  cards.push({playerId:id??null,detail:e.detail,time:e.time,location,yellow});
 }
 return {usable:reasons.length===0,reasons:[...new Set(reasons)],warnings,
  intervals:[...intervals].map(([playerId,s])=>({playerId,...s,nominalMinutes:(s.outMinute??90)-s.inMinute})),cards,
  onPitchBookedIds:[...new Set(cards.filter(c=>c.yellow&&c.location==='on_pitch').map(c=>c.playerId))],
  uncertainCards:cards.filter(c=>['boundary_unknown','timeline_unknown'].includes(c.location)).length,
  note:'Regulation-only quality audit; nominal minutes exclude stoppage time. Empty events do not prove complete coverage. No player outcome labels are produced for training.'};
}
