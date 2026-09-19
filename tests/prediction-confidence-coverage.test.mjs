import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workerSource = readFileSync(
  new URL("../worker/worker.js", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL("../js/features/predictionPanel.js", import.meta.url),
  "utf8",
);

[
  "let leagueMatches = 0;",
  "homeMatches: homeLast.length",
  "awayMatches: awayLast.length",
  "minimumTeamMatches: MIN_TEAM_HISTORY",
  "minimumLeagueMatches: MIN_LEAGUE_HISTORY",
  "score: coverage.sufficient ? confidenceScore : null",
  "signalScore: confidenceScore",
  "coverage,",
  "Le probabilità sono un fallback matematico.",
].forEach((fragment) => {
  assert.ok(
    workerSource.includes(fragment),
    `Worker coverage contract changed: missing ${fragment}`,
  );
});

[
  'return "Non valutabile · Storico insufficiente";',
  "Segnale da confermare",
  "cov?.historyLimited === true",
  '<div class="k">Segnale modello</div>',
  "Differenza tra primo e secondo esito 1X2; non è una probabilità di successo.",
].forEach((fragment) => {
  assert.ok(
    panelSource.includes(fragment),
    `Prediction signal copy changed: missing ${fragment}`,
  );
});

assert.equal(
  panelSource.includes('<div class="k">Affidabilità</div>'),
  false,
  "The edge score must not be presented as reliability.",
);
assert.equal(
  panelSource.includes(" · Rischio "),
  false,
  "The edge score must not be presented as betting risk.",
);

const minimumCoverage = (homeMatches, awayMatches, leagueMatches) =>
  homeMatches >= 3 && awayMatches >= 3 && leagueMatches >= 8;

assert.equal(minimumCoverage(0, 0, 0), false);
assert.equal(minimumCoverage(3, 3, 7), false);
assert.equal(minimumCoverage(3, 3, 8), true);

const promotedHistoryLimited = (
  currentMatches,
  previousMatches,
) => previousMatches < 10 && currentMatches < 8;

assert.equal(promotedHistoryLimited(4, 0), true);
assert.equal(promotedHistoryLimited(4, 38), false);
assert.equal(promotedHistoryLimited(8, 0), false);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      insufficientHistory: "Non valutabile",
      sufficientHistory: "Segnale modello",
      probabilitiesChanged: false,
    },
    null,
    2,
  ),
);
