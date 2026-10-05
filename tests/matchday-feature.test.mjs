import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const html = read("index.html");
const app = read("app.js");
const worker = read("worker/worker.js");
const matchday = read("js/features/matchdayPanel.js");
const search = read("js/features/searchController.js");

assert.match(html, /data-view="matchdayPanel"/, "Tab Giornata mancante.");
assert.match(html, /id="matchdayPanel"/, "Viewport Giornata mancante.");
assert.match(
  html,
  /js\/features\/matchdayPanel\.js\?v=20261005r1/,
  "Script Giornata non incluso o versione errata.",
);

assert.match(
  app,
  /viewId === "matchdayPanel"/,
  "La Giornata non viene caricata on-demand dalle tab.",
);

assert.match(
  matchday,
  /\/fixtures\/rounds\?league=.*current=true/,
  "Il turno corrente non usa fixtures\/rounds current=true.",
);
assert.match(
  matchday,
  /\/fixtures\?league=.*round=/,
  "La composizione della giornata non viene richiesta per round.",
);
assert.match(
  matchday,
  /CR_MATCHDAY_V1/,
  "Cache locale persistente della giornata mancante.",
);
assert.match(
  matchday,
  /\/fixtures\?id=/,
  "Il click partita non rilegge il fixture aggiornato per id.",
);

assert.match(
  search,
  /window\.selectFixtureDirect = selectFixtureDirect/,
  "Ingresso diretto fixture -> analisi mancante.",
);
assert.match(
  search,
  /findNextFixtureAfterSelected/,
  "Il flusso Giornata non cerca la prima gara successiva alla fixture selezionata.",
);
assert.match(
  search,
  /team=\\\$\\\{encodeURIComponent\\\(team\\\.id\\\)\\\}&next=3/,
  "Il flusso Giornata non replica la ricerca multi-competizione del main per la squadra di casa.",
);
assert.match(
  search,
  /afterSelected: true/,
  "La prossima gara dell'avversaria non usa il criterio successivo alla fixture selezionata.",
);
assert.match(
  search,
  /window\.CR_STATE\.matchExtras\.nextTeam \|\| nextTeamFixture/,
  "Un caricamento secondario può cancellare la prossima gara già risolta.",
);

assert.match(
  search,
  /source: "matchday"/,
  "La selezione diretta non è marcata come proveniente dalla Giornata.",
);

assert.match(
  worker,
  /pathname === "\/fixtures\/rounds".*60 \* 60 \* 2/,
  "TTL del puntatore al turno corrente mancante.",
);
assert.match(
  worker,
  /searchParams\.has\("round"\).*searchParams\.has\("league"\).*searchParams\.has\("season"\)/s,
  "Cache lunga delle fixture di giornata mancante.",
);
assert.match(
  worker,
  /return 60 \* 60 \* 24 \* 30/,
  "TTL lungo della giornata non impostato a 30 giorni.",
);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      feature: "matchday",
      currentRound: "2h cache",
      fixedRound: "30d edge cache + persistent browser cache",
      fixtureOpen: "fresh lookup by fixture id",
    },
    null,
    2,
  ),
);
