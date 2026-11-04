import fs from 'node:fs';
import {participation} from './participation.mjs';
if(process.argv.length!==4)throw Error('Usage: node analyze-participation.mjs pre-match-snapshot.json historical-crosscheck.json');
const raw=JSON.parse(fs.readFileSync(process.argv[3]));
const snap=JSON.parse(fs.readFileSync(process.argv[2]));
const summaries=[];
for(const l of raw.entries.filter(e=>e.path.includes('/lineups?'))){
 const fid=Number(l.path.split('=')[1]);const ev=raw.entries.find(e=>e.path===`/fixtures/events?fixture=${fid}`);
 const entry=e=>({...e,kind:e.data.response.length?'success':'empty'});
 const sheet=snap.entries.find(e=>e.path===`/fixtures/players?fixture=${fid}`);
 for(const t of l.data.response){
  const r=participation({teamId:t.team.id,lineups:entry(l),events:entry(ev)});
  const players=sheet.data.response.find(x=>x.team.id===t.team.id).players;
  const mismatch=(r.intervals||[]).flatMap(p=>{const rows=players.filter(x=>x.player.id===p.playerId);const m=rows.length===1?rows[0].statistics[0].games.minutes:null;return m!==p.nominalMinutes?[{fixtureId:fid,teamId:t.team.id,playerId:p.playerId,reported:m,nominal:p.nominalMinutes}]:[];});
  summaries.push({fixtureId:fid,teamId:t.team.id,usable:r.usable,reasons:r.reasons,participants:r.intervals?.length||0,minuteMismatches:mismatch,cards:r.cards||[]});
 }
}
// No account data or session required: input is sports snapshots only.
console.log(JSON.stringify({teamSheets:summaries.length,valid:summaries.filter(s=>s.usable).length,rejected:summaries.filter(s=>!s.usable).map(s=>({fixture:s.fixtureId,team:s.teamId,reasons:s.reasons})),usableParticipants:summaries.filter(s=>s.usable).reduce((n,s)=>n+s.participants,0),minuteMismatches:summaries.filter(s=>s.usable).flatMap(s=>s.minuteMismatches),cards:summaries.flatMap(s=>s.cards).reduce((a,c)=>(a[c.location]=(a[c.location]||0)+1,a),{})},null,2));
