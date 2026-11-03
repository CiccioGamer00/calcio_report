import {collect} from './collect.mjs';
import {classify} from './audit.mjs';
const $=id=>document.getElementById(id), BASE='https://api.calcioreport.com';
let busy=false;
function session(){try{return localStorage.getItem('CR_TOKEN') || '';}catch{return '';}}
async function access(){
 const token=session();if(!token)throw Error('Accedi a Calcio Report con l’account PRO, poi riapri questa pagina.');
 const r=await fetch(BASE+'/auth/me',{headers:{Authorization:'Bearer '+token},redirect:'error',cache:'no-store'});
 const j=await r.json();if(!r.ok || !j.ok || !(Number(j.paidUntil)>Number(j.now || Date.now())))throw Error('Serve una sessione PRO valida.');
 return token;
}
$('load').onclick=async()=>{
 if(busy)return;busy=true;$('load').disabled=true;$('run').disabled=true;$('fixture').disabled=true;
 try {
  const token=await access();const r=await fetch(BASE+'/fixtures?league=135&season=2026&next=10',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
  const j=await r.json();if(!['success','empty'].includes(classify(r.status,j)))throw Error('Elenco partite non disponibile.');
  const fixtures=j.response.filter(f=>f.fixture?.status?.short==='NS' && Date.parse(f.fixture.date)>Date.now());
  $('fixture').replaceChildren(...fixtures.map(f=>{const o=document.createElement('option');o.value=String(f.fixture.id);o.textContent=`${f.teams.home.name} – ${f.teams.away.name} · ${new Date(f.fixture.date).toLocaleString('it-IT')} · ID ${f.fixture.id}`;return o;}));
  $('fixture').disabled=!fixtures.length;$('run').disabled=!fixtures.length;$('progress').textContent=fixtures.length+' partite disponibili.';
 }catch(e){$('progress').textContent=e.message;}finally{busy=false;$('load').disabled=false;}
};
$('run').onclick=async()=>{
 if(busy || !$('fixture').value)return;busy=true;$('run').disabled=true;$('load').disabled=true;$('fixture').disabled=true;$('snapshot').value='';$('report').textContent='Raccolta in corso…';
 try {
  const token=await access();
  const snapshot=await collect($('fixture').value,{token,onProgress:p=>{$('progress').textContent=`Richieste: ${p.requests} · ${p.path} · ${p.kind}`;}});
  if(session()!==token)throw Error('Sessione cambiata: risultati non mostrati.');
  $('snapshot').value=JSON.stringify(snapshot);$('report').textContent=JSON.stringify({fixture:snapshot.target.data.response[0].fixture.id,requests:snapshot.requests,...snapshot.report},null,2);
  $('progress').textContent='Raccolta completata. Nessuna previsione generata.';
 }catch{$('report').textContent='Raccolta non completata: verifica sessione PRO, disponibilità della partita e limiti API.';}
 finally{busy=false;$('run').disabled=false;$('load').disabled=false;$('fixture').disabled=false;}
};
access().then(()=>{$('access').textContent='Sessione PRO attiva.';$('load').disabled=false;}).catch(e=>{$('access').textContent=e.message;});
