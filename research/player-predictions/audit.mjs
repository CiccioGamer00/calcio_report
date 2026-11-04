// Data feasibility only: this module deliberately produces no predictions.
export function numberOrNull(value) {
  if (!['number','string'].includes(typeof value) || (typeof value==='string' && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function classify(http, data) {
  if (http < 200 || http >= 300) return `http_${http}`;
  const e = data?.errors;
  if (data?.error || (typeof e === 'string' ? e.trim() : e && typeof e === 'object' ? Object.keys(e).length : e)) return 'api_error';
  if (!Array.isArray(data?.response)) return 'invalid_response';
  return data.response.length ? 'success' : 'empty';
}
export function rows(entry) { return entry?.kind === 'success' ? entry.data.response : []; }
export function refereeKey(name) { return String(name || '').trim().toLowerCase().replace(/\s+/g, ' '); }
export function completeLineups(entry, teamIds) {
  const all = rows(entry);
  const ids = [];
  for (const teamId of teamIds) {
    const teams = all.filter(r => r.team?.id === teamId);
    if (teams.length !== 1 || teams[0].startXI?.length !== 11) return false;
    const players = teams[0].startXI.map(r => r.player?.id);
    if (players.some(id => !Number.isInteger(id) || id <= 0)) return false;
    ids.push(...players);
  }
  return ids.length === 22 && new Set(ids).size === 22;
}
export function playerStats(row, teamId, leagueId, season) {
  // Never use statistics[0]: it may belong to another club/competition.
  const stats = row.statistics?.filter(s => s.team?.id === teamId && s.league?.id === leagueId && s.league?.season === season) || [];
  if (stats.length !== 1) return null;
  const s = stats[0];
  return Object.fromEntries(Object.entries({minutes:s.games?.minutes, starts:s.games?.lineups,
    goals:s.goals?.total, shots:s.shots?.total, onTarget:s.shots?.on, penalties:s.penalty?.scored,
    yellow:s.cards?.yellow, fouls:s.fouls?.committed}).map(([k,v]) => [k,numberOrNull(v)]));
}
export function refereeObservation(entry, teams) {
  const records = rows(entry);
  if (records.length !== 2) return null;
  const values = teams.map(id => {
    const matches = records.filter(r => r.team?.id === id);
    if (matches.length !== 1) return null;
    const stats = matches[0].statistics || [];
    const get = type => { const found=stats.filter(s=>s.type===type); return found.length===1 ? numberOrNull(found[0].value) : null; };
    return {yellow:get('Yellow Cards'),fouls:get('Fouls')};
  });
  if (values.some(v => !v || v.yellow === null)) return null;
  return {yellow:values[0].yellow+values[1].yellow,
    fouls:values.some(v=>v.fouls===null) ? null : values[0].fouls+values[1].fouls};
}
export function audit(snapshot) {
  const fixture = rows(snapshot.target)[0];
  if (!fixture?.fixture?.id) return {status:'blocked', reasons:['target_unavailable']};
  const kickoff = Date.parse(fixture.fixture.date), captured = Date.parse(snapshot.completedAt);
  const entries = [snapshot.target,snapshot.lineups,snapshot.injuries,snapshot.coverage,...(snapshot.entries || []),
    ...(snapshot.teams || []).flatMap(t=>[...(t.pages || []),...(t.history || []).map(h=>h.players)]),
    ...(snapshot.refereeHistory || []).map(h=>h.statistics)];
  const timestamps = entries.filter(Boolean).map(e=>Date.parse(e.observedAt));
  const prospective = fixture.fixture.status?.short === 'NS' && Number.isFinite(kickoff) && Number.isFinite(captured) && captured < kickoff &&
    timestamps.length > 0 && timestamps.every(t=>Number.isFinite(t) && t <= captured && t < kickoff);
  const ids = [fixture.teams.home.id, fixture.teams.away.id];
  const official = completeLineups(snapshot.lineups,ids);
  const reasons=[];
  if (!prospective) reasons.push('not_a_valid_pre_match_snapshot');
  if (!official) reasons.push('official_starting_elevens_unavailable');
  if (!['success','empty'].includes(snapshot.injuries?.kind)) reasons.push('injury_feed_unavailable');
  const teams = ids.map(teamId=>{
    const source=(snapshot.teams || []).find(t=>t.teamId===teamId);
    const pages=source?.pages || [];
    const last=pages.at(-1);
    const complete=pages.length>0 && pages.every((p,i)=>p.kind==='success' && p.data.paging?.current===i+1 && p.data.paging?.total===pages[0].data.paging.total) && last.data.paging.current===last.data.paging.total;
    const seen=new Set();let duplicate=false;
    const players=pages.flatMap(rows).filter(p=>{if(!p.player?.id)return false;if(seen.has(p.player.id)){duplicate=true;return false;}seen.add(p.player.id);return true;})
      .map(p=>({id:p.player.id,stats:playerStats(p,teamId,fixture.league.id,fixture.league.season)}));
    const coverage=Object.fromEntries(['minutes','starts','goals','shots','onTarget','penalties','yellow','fouls'].map(k=>[k,players.filter(p=>p.stats?.[k]!==null && p.stats?.[k]!==undefined).length]));
    const starters=rows(snapshot.lineups).find(r=>r.team?.id===teamId)?.startXI || [];
    return {teamId,pagesComplete:complete&&!duplicate,players:players.length,coverage,
      startersWithSeasonMinutes:starters.filter(s=>players.some(p=>p.id===s.player?.id && p.stats?.minutes>0)).length,
      recentMatches:(source?.history || []).length,
      recentPlayerFeeds:(source?.history || []).filter(h=>h.players?.kind==='success').length};
  });
  if (teams.some(t=>!t.pagesComplete)) reasons.push('incomplete_season_player_pages');
  const referee=refereeKey(fixture.fixture.referee);
  if (!referee || referee==='—') reasons.push('referee_unassigned');
  const observations=(snapshot.refereeHistory || []).filter(h=>h.fixture?.league?.id===fixture.league.id &&
    h.fixture.fixture?.status?.short==='FT' && Date.parse(h.fixture.fixture.date)<captured &&
    refereeKey(h.fixture.fixture.referee)===referee).map(h=>refereeObservation(h.statistics,[h.fixture.teams.home.id,h.fixture.teams.away.id])).filter(Boolean);
  if (!observations.length) reasons.push('referee_history_unavailable');
  const leagueRows=rows(snapshot.coverage).filter(r=>r.league?.id===fixture.league.id);
  const seasons=leagueRows.flatMap(r=>r.seasons || []).filter(s=>s.year===fixture.league.season);
  return {status:'audit_only',prospective,official,reasons,teams,
    declaredCoverage:seasons.length===1 ? seasons[0].coverage ?? null : null,
    referee:{assigned:!!referee && referee!=='—',usableMatches:observations.length,
      meanYellow:observations.length ? observations.reduce((s,r)=>s+r.yellow,0)/observations.length : null,
      matchesWithFouls:observations.filter(o=>o.fouls!==null).length},
    predictions:null, note:'Coverage is not predictive validity. No score, ranking or probability is released.'};
}
