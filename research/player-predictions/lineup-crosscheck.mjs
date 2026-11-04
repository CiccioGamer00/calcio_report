import { rows, numberOrNull } from './audit.mjs';

// Historical data-quality check only. Never infer XI from games.substitute.
export function crosscheckLineup({teamId,lineups,events,players}) {
  const reasons=[];
  const line=rows(lineups).filter(x=>x.team?.id===teamId);
  const sheet=rows(players).filter(x=>x.team?.id===teamId);
  if(line.length!==1 || sheet.length!==1) return {usable:false,reasons:['missing_or_ambiguous_team_sheet']};
  const xi=(line[0].startXI||[]).map(x=>x.player?.id);
  if(xi.length!==11 || new Set(xi).size!==11 || xi.some(x=>!Number.isInteger(x)||x<=0))
    return {usable:false,reasons:['invalid_official_eleven']};
  if(!['success','empty'].includes(events?.kind)) return {usable:false,reasons:['events_unavailable']};
  const substitutions=rows(events).filter(e=>e.team?.id===teamId && e.type==='subst');
  const active=new Set(xi), appeared=new Set(xi);
  let previous=-1;
  for(const e of substitutions){
    const minute=numberOrNull(e.time?.elapsed), extra=e.time?.extra==null?0:numberOrNull(e.time.extra);
    const time=minute===null||extra===null?null:minute*1000+extra;
    if(time===null || time<previous){reasons.push('invalid_substitution_order');continue;}
    previous=time;
    const out=e.player?.id, incoming=e.assist?.id;
    if(!active.has(out)||!Number.isInteger(incoming)||incoming<=0||appeared.has(incoming)){
      reasons.push('inconsistent_substitution_ids');continue;
    }
    active.delete(out);active.add(incoming);appeared.add(incoming);
  }
  let legacyFlagDisagreements=0;
  const ids=new Set();
  for(const p of sheet[0].players||[]){
    const id=p.player?.id;
    if(!Number.isInteger(id)||id<=0||ids.has(id)||p.statistics?.length!==1){reasons.push('invalid_player_sheet');continue;}
    ids.add(id);
    const s=p.statistics[0];
    if(numberOrNull(s.games?.minutes)>0 && !appeared.has(id)) reasons.push('unexplained_appearance');
    if(typeof s.games?.substitute==='boolean' && (s.games.substitute===false)!==xi.includes(id))legacyFlagDisagreements++;
  }
  if([...appeared].some(id=>!ids.has(id)))reasons.push('participant_missing_from_player_sheet');
  return {usable:reasons.length===0,reasons:[...new Set(reasons)],officialStarterIds:xi,
    appearedIds:[...appeared],substitutions:substitutions.length,legacyFlagDisagreements,
    note:'Checks identity consistency only; does not validate event completeness, minute totals or card timing.'};
}
