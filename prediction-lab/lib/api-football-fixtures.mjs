const COMPLETED_STATUSES = new Set(["FT", "AET", "PEN"]);

function hasApiErrors(errors) {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(errors);
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

export function apiFootballFixturesToRows(payload) {
  if (!payload || typeof payload !== "object")
    throw new Error("Risposta API non valida.");
  if (hasApiErrors(payload.errors))
    throw new Error(
      `API-Football: ${JSON.stringify(payload.errors)}`,
    );
  if (!Array.isArray(payload.response))
    throw new Error("La risposta API non contiene un elenco di partite.");

  const rows = payload.response
    .filter((item) =>
      COMPLETED_STATUSES.has(item?.fixture?.status?.short),
    )
    .map((item, index) => {
      const timestamp = Date.parse(item?.fixture?.date);
      const homeGoals = Number(item?.goals?.home);
      const awayGoals = Number(item?.goals?.away);
      const fixtureId = Number(item?.fixture?.id);
      const leagueId = Number(item?.league?.id);
      const season = Number(item?.league?.season);
      const homeTeamId = Number(item?.teams?.home?.id);
      const awayTeamId = Number(item?.teams?.away?.id);
      const league = String(item?.league?.name || "").trim();
      const homeTeam = String(item?.teams?.home?.name || "").trim();
      const awayTeam = String(item?.teams?.away?.name || "").trim();

      if (
        !Number.isFinite(timestamp) ||
        !Number.isInteger(fixtureId) ||
        !Number.isInteger(leagueId) ||
        !Number.isInteger(season) ||
        !Number.isInteger(homeTeamId) ||
        !Number.isInteger(awayTeamId) ||
        !league ||
        !homeTeam ||
        !awayTeam ||
        !Number.isInteger(homeGoals) ||
        homeGoals < 0 ||
        !Number.isInteger(awayGoals) ||
        awayGoals < 0
      ) {
        throw new Error(
          `Partita API non valida alla posizione ${index + 1}.`,
        );
      }

      return {
        fixture_id: fixtureId,
        date: new Date(timestamp).toISOString(),
        league_id: leagueId,
        league,
        season,
        home_team_id: homeTeamId,
        home_team: homeTeam,
        away_team_id: awayTeamId,
        away_team: awayTeam,
        home_goals: homeGoals,
        away_goals: awayGoals,
      };
    })
    .sort(
      (left, right) =>
        Date.parse(left.date) - Date.parse(right.date) ||
        left.fixture_id - right.fixture_id,
    );

  if (!rows.length)
    throw new Error("Nessuna partita conclusa trovata nella risposta.");
  return rows;
}

export function fixturesRowsToCsv(rows) {
  const headers = [
    "fixture_id",
    "date",
    "league_id",
    "league",
    "season",
    "home_team_id",
    "home_team",
    "away_team_id",
    "away_team",
    "home_goals",
    "away_goals",
  ];
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvValue(row[header])).join(","),
    ),
  ].join("\n");
}

export function apiFootballFixturesToCsv(payload) {
  return fixturesRowsToCsv(apiFootballFixturesToRows(payload));
}
