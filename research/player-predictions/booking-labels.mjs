import {rows,numberOrNull} from './audit.mjs';
import {participation} from './participation.mjs';

// Verified historical outcomes only; unknown is never silently a negative label.
export function bookingLabels({fixture,teamId,lineups,events,players,statistics}){
 const blocked=reason=>({usable:false,reasons:[reason],labels:[],excluded:[]});
 if(fixture?.fixture?.status?.short!=='FT'||![fixture.teams?.home?.id,fixture.teams?.away?.id].includes(teamId))return blocked('invalid_fixture_context');
 const timeline=participation({teamId,lineups,events});
 if(!timeline.usable)return blocked('participation_unresolved');
 const sheet=rows(players).filter(t=>t.team?.id===teamId),totals=rows(statistics).filter(t=>t.team?.id===teamId);
 if(sheet.length!==1||totals.length!==1)return blocked('statistics_unavailable');
 const yellowRows=(totals[0].statistics||[]).filter(s=>s.type==='Yellow Cards');
 const total=yellowRows.length===1?numberOrNull(yellowRows[0].value):null;
 const recognised=timeline.cards.filter(c=>c.yellow&&c.location!=='unattributed');
 if(total===null||total!==recognised.length)return blocked('team_yellow_total_unreconciled');
 if(timeline.cards.some(c=>!['Yellow Card','Red Card','Second Yellow card','Second Yellow Card'].includes(c.detail)))return blocked('unknown_card_type');
 const labels=[],excluded=[];
 for(const span of timeline.intervals){
  const id=span.playerId,records=(sheet[0].players||[]).filter(p=>p.player?.id===id);
  const cs=timeline.cards.filter(c=>c.playerId===id&&c.yellow);
  const reported=records.length===1&&records[0].statistics?.length===1?numberOrNull(records[0].statistics[0].cards?.yellow):null;
  let reason=null;
  if(cs.some(c=>c.detail!=='Yellow Card'))reason='second_yellow_convention_unresolved';
  else if(cs.some(c=>['boundary_unknown','timeline_unknown'].includes(c.location)))reason='card_timing_unresolved';
  else if(reported===null||reported!==cs.length)reason='player_yellow_total_unreconciled';
  if(reason){excluded.push({playerId:id,reason});continue;}
  labels.push({fixtureId:fixture.fixture.id,teamId,playerId:id,bookedOnPitch:cs.some(c=>c.location==='on_pitch')?1:0});
 }
 return {usable:labels.length>0,reasons:[],labels,excluded,
  note:'Post-match reconciliation across events, team totals and player totals; shared upstream errors remain possible. No predictive validity implied.'};
}
