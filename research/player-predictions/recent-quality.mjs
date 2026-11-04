import { numberOrNull, rows } from './audit.mjs';

// Offline quality gate. A successful HTTP response is not a usable match sheet.
export function recentQuality(snapshot) {
  return (snapshot.teams || []).map(team => {
    const coverage = { shots: 0, onTarget: 0, goals: 0, yellow: 0, fouls: 0 };
    let played = 0, missingMinutes = 0, zeroMinutes = 0;
    const matches = (team.history || []).map(history => {
      const records = rows(history.players).filter(r => r.team?.id === team.teamId);
      const reasons = [];
      if (records.length !== 1) return { fixtureId: history.fixture?.fixture?.id, reasons: ['team_sheet_unavailable'], usableStartingStatus: false };
      const seen = new Set();
      let starters = 0, unknownStartingStatus = 0;
      for (const player of records[0].players || []) {
        if (!Number.isInteger(player.player?.id) || seen.has(player.player.id)) {
          reasons.push('invalid_or_duplicate_player');
          continue;
        }
        seen.add(player.player.id);
        if (player.statistics?.length !== 1) { reasons.push('ambiguous_player_statistics'); continue; }
        const s = player.statistics[0];
        const minutes = numberOrNull(s.games?.minutes);
        // Include every declared starter in the structural check, even at zero minutes.
        if (s.games?.substitute === false) starters++;
        else if (s.games?.substitute !== true) unknownStartingStatus++;
        if (minutes === null) { missingMinutes++; continue; }
        if (minutes === 0) { zeroMinutes++; continue; }
        played++;
        for (const [key, value] of Object.entries({shots:s.shots?.total, onTarget:s.shots?.on,
          goals:s.goals?.total, yellow:s.cards?.yellow, fouls:s.fouls?.committed})) {
          if (numberOrNull(value) !== null) coverage[key]++;
        }
      }
      if (starters !== 11) reasons.push('starting_count_not_eleven');
      if (unknownStartingStatus) reasons.push('unknown_starting_status');
      return {fixtureId:history.fixture?.fixture?.id, declaredStarters:starters,
        reasons:[...new Set(reasons)], usableStartingStatus:reasons.length === 0};
    });
    return {teamId:team.teamId, played, missingMinutes, zeroMinutes, coverageAmongPlayed:coverage,
      matches, note:'Structural consistency is necessary, not proof of correct starting elevens. Cross-check official lineups and substitution events.'};
  });
}
