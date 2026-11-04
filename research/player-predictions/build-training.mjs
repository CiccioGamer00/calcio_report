import {scorerLabels} from './scorer-labels.mjs';
import {bookingLabels} from './booking-labels.mjs';
import {participation} from './participation.mjs';
import {rows,numberOrNull,classify} from './audit.mjs';
export function buildTraining(snapshot,history){
 const entries=new Map([...snapshot.entries,...history.entries].map(e=>[e.path,e]));
 const get=path=>{const e=entries.get(path);return e?{...e,kind:e.kind??classify(200,e.data)}:null;};
 const records=[],excluded=[];
 for(const f of history.fixtures){
  const id=f.fixture.id;
  const lineups=get(`/fixtures/lineups?fixture=${id}`),events=get(`/fixtures/events?fixture=${id}`),players=get(`/fixtures/players?fixture=${id}`),statistics=get(`/fixtures/statistics?fixture=${id}`);
  const scorer=scorerLabels({fixture:f,lineups,events});
  for(const teamId of [f.teams.home.id,f.teams.away.id]){
   const timeline=participation({teamId,lineups,events});
   if(!timeline.usable){excluded.push({fixtureId:id,teamId,reason:'timeline'});continue;}
   const booking=bookingLabels({fixture:f,teamId,lineups,events,players,statistics});
   const sheets=rows(players).filter(t=>t.team?.id===teamId);
   const xi=rows(lineups).find(t=>t.team?.id===teamId)?.startXI.map(p=>p.player.id)||[];
   for(const [market,outcomeRows] of [['scorer',scorer.labels||[]],['booking',booking.labels]]){
    const source=[lineups,events,players,...(market==='booking'?[statistics]:[])];
    const times=source.map(e=>Date.parse(e?.observedAt));
    if(times.some(t=>!Number.isFinite(t))){excluded.push({fixtureId:id,teamId,market,reason:'source_timestamp'});continue;}
    for(const label of outcomeRows.filter(r=>r.teamId===teamId)){
     const span=timeline.intervals.find(r=>r.playerId===label.playerId);
     const found=sheets.length===1?sheets[0].players.filter(p=>p.player.id===label.playerId):[];
     const reported=found.length===1&&found[0].statistics.length===1?numberOrNull(found[0].statistics[0].games?.minutes):null;
     if(!span||span.nominalMinutes<=0||reported===null||Math.abs(reported-span.nominalMinutes)>1){excluded.push({fixtureId:id,teamId,playerId:label.playerId,market,reason:'minutes_unreconciled'});continue;}
     records.push({fixtureId:id,teamId,playerId:label.playerId,leagueId:f.league.id,season:f.league.season,market,
      outcome:market==='scorer'?label.scored:label.bookedOnPitch,minutes:span.nominalMinutes,
      starter:xi.includes(label.playerId),kickoff:f.fixture.date,observedAt:new Date(Math.max(...times)).toISOString()});
    }
   }
  }
 }
 return {schemaVersion:1,records,excluded,minutePolicy:'Nominal regulation minutes; reported minutes required within one minute. Larger discrepancies excluded.',purpose:'experimental_training_only'};
}
