// js/features/panels.js

/* =========================
   DETTAGLI MATCH + ARBITRO
   ========================= */
async function loadFixtureDetails() {
  if (!selectedFixture?.id) return;

  setReferee(`<p class="muted"><em>Recupero dettagli arbitro...</em></p>`);

  const r = await apiGet(`/fixtures?id=${selectedFixture.id}&timezone=Europe/Rome`);
  if (!r.ok) {
    setReferee(
      `<p class="bad"><em>Errore API (fixture details): HTTP ${r.status}</em></p>`,
    );
    return;
  }
  if (!r.arr || r.arr.length === 0) {
    setReferee(
      `<p class="muted"><em>Nessun dettaglio trovato per questo match.</em></p>`,
    );
    return;
  }

  const f = r.arr[0];
  const referee = f.fixture?.referee ?? "—";
  const venueName = f.fixture?.venue?.name ?? "—";
  const venueCity = f.fixture?.venue?.city ?? "—";

 // Salvo SEMPRE ciò che arriva dall’API, senza inventare arbitri
selectedFixture.referee = referee || "—";

if (!selectedFixture.referee || selectedFixture.referee === "—") {
  // Importantissimo: non deve restare un vecchio arbitro in memoria
  setReferee(`<p class="muted"><em>Arbitro non ancora assegnato.</em></p>`);
  return;
}

  setReferee(`
    <div class="kv">
      <div class="kv-row"><div class="k">Arbitro</div><div class="v"><strong>${safeHTML(referee)}</strong></div></div>
      <div class="kv-row"><div class="k">Stadio</div><div class="v">${safeHTML(venueName)}</div></div>
      <div class="kv-row"><div class="k">Città</div><div class="v">${safeHTML(venueCity)}</div></div>
    </div>
    <div id="refHistory"></div>
  `);

  await loadRefereeHistory();
}

/* =========================
   STORICO ARBITRO
   ========================= */
async function loadRefereeHistory() {
  if (!selectedFixture?.referee || selectedFixture.referee === "—") return;

  const refDiv = document.getElementById("refHistory");
  if (!refDiv) return;

  refDiv.innerHTML = `<p class="muted"><em>Recupero storico arbitro...</em></p>`;

  function seasonStartYearFromFixtureDate(isoDate) {
    if (!isoDate) return null;
    const d = new Date(isoDate);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return m >= 7 ? y : y - 1;
  }

  async function countCardsFromEventsDetailed(fixtureId, homeId, awayId) {
    const r = await apiGet(`/fixtures/events?fixture=${fixtureId}`);
    if (!r.ok || r.errors) {
      return {
        yellow: 0,
        red: 0,
        total: 0,
        homeYellow: 0,
        homeRed: 0,
        awayYellow: 0,
        awayRed: 0,
      };
    }

    let yellow = 0,
      red = 0;
    let homeYellow = 0,
      homeRed = 0,
      awayYellow = 0,
      awayRed = 0;

    for (const e of r.arr) {
      if (e?.type !== "Card") continue;

      const detail = String(e?.detail || "").toLowerCase();
      const isYellow = detail.includes("yellow");
      const isRed = detail.includes("red");
      if (!isYellow && !isRed) continue;

      const teamId = e?.team?.id ?? null;

      if (isYellow) {
        yellow += 1;
        if (teamId === homeId) homeYellow += 1;
        else if (teamId === awayId) awayYellow += 1;
      } else if (isRed) {
        red += 1;
        if (teamId === homeId) homeRed += 1;
        else if (teamId === awayId) awayRed += 1;
      }
    }

    return {
      yellow,
      red,
      total: yellow + red,
      homeYellow,
      homeRed,
      awayYellow,
      awayRed,
    };
  }

  function normalizeRefName(name) {
    const beforeComma = String(name || "").split(",")[0];
    const raw = beforeComma
      .toLowerCase()
      .replaceAll(".", " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return { raw: "", initial: "", last: "" };
    const parts = raw.split(" ").filter(Boolean);
    const first = parts[0] || "";
    const last = parts.length >= 2 ? parts[parts.length - 1] : "";
    const initial = first ? first[0] : "";
    return { raw, initial, last };
  }

  function sameReferee(a, b) {
    const A = normalizeRefName(a);
    const B = normalizeRefName(b);

    if (!A.last || !B.last) {
      return (
        A.raw &&
        B.raw &&
        (A.raw === B.raw || A.raw.includes(B.raw) || B.raw.includes(A.raw))
      );
    }
    if (A.last !== B.last) return false;
    if (A.initial && B.initial && A.initial !== B.initial) return false;
    return true;
  }

  function fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function bucketForFixture(f) {
    const leagueName = f.league?.name || "—";
    const leagueCountry = f.league?.country || "—";
    const leagueId = f.league?.id ?? null;

    if (leagueId && selectedFixture?.leagueId && leagueId === selectedFixture.leagueId) {
      return `Stessa competizione: ${selectedFixture.leagueName || leagueName}`;
    }
    if (leagueCountry.toLowerCase() === "italy") return "Altre competizioni in Italia";
    if (leagueCountry.toLowerCase() === "world" || leagueCountry.toLowerCase() === "europe")
      return "Competizioni internazionali";
    return "Estero / altre leghe";
  }

  try {
    const refereeName = selectedFixture.referee;
    const season = seasonStartYearFromFixtureDate(selectedFixture.date);
    if (!season) {
      refDiv.innerHTML = `<p class="bad"><em>Non riesco a ricavare la stagione dal match.</em></p>`;
      return;
    }

    const limitEl = document.getElementById("refHistoryCount");
    let limit = parseInt(limitEl?.value || "10", 10);
    if (Number.isNaN(limit) || limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const showList = UI_STATE.refList;
    const showTeamDetail = UI_STATE.refTeam;

    const baseDate = selectedFixture.date ? new Date(selectedFixture.date) : new Date();
    const fromDate = new Date(baseDate);
    fromDate.setDate(fromDate.getDate() - 365);

    const from = fmt(fromDate);
    const to = fmt(baseDate);

    const ref = normalizeRefName(refereeName).raw;
    const q = encodeURIComponent(ref);

    const all1 = await apiGet(
      `/fixtures?referee=${q}&season=${season}&from=${from}&to=${to}&status=FT&timezone=Europe/Rome`,
    );
    const all2 = await apiGet(
      `/fixtures?referee=${q}&season=${season - 1}&from=${from}&to=${to}&status=FT&timezone=Europe/Rome`,
    );

    let pool = [];
    let usedGlobal = false;

    if (all1.ok && !all1.errors) pool = pool.concat(all1.arr);
    if (all2.ok && !all2.errors) pool = pool.concat(all2.arr);
    if (pool.length > 0) usedGlobal = true;

    if (pool.length === 0) {
      if (!selectedFixture?.leagueId) {
        refDiv.innerHTML = `<p class="bad"><em>Non ho leagueId: impossibile fallback.</em></p>`;
        return;
      }

      const fx = await apiGet(
        `/fixtures?league=${selectedFixture.leagueId}&season=${season}&from=${from}&to=${to}&status=FT&timezone=Europe/Rome`,
      );
      if (!fx.ok || fx.errors || fx.arr.length === 0) {
        refDiv.innerHTML = `<p class="bad"><em>Non riesco a recuperare partite per lo storico arbitro.</em></p>`;
        return;
      }
      pool = fx.arr;
    }

    const matchesByRef = pool
      .filter((f) => {
        const r = f.fixture?.referee ?? "";
        return r && sameReferee(r, refereeName);
      })
      .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));

    if (matchesByRef.length === 0) {
      refDiv.innerHTML = `<p class="muted"><em>Nessuna partita trovata per arbitro "${safeHTML(refereeName)}".</em></p>`;
      return;
    }

    const lastN = matchesByRef.slice(0, limit);

    const cardMap = new Map();
    let sumTotal = 0;
    let minTotal = null;
    let maxTotal = null;

    for (const f of lastN) {
      const fixtureId = f.fixture?.id;
      const homeId = f.teams?.home?.id ?? null;
      const awayId = f.teams?.away?.id ?? null;

      const cards = await countCardsFromEventsDetailed(fixtureId, homeId, awayId);
      cardMap.set(fixtureId, cards);

      sumTotal += cards.total;
      if (minTotal === null || cards.total < minTotal) minTotal = cards.total;
      if (maxTotal === null || cards.total > maxTotal) maxTotal = cards.total;
    }

    const avgTotal = (sumTotal / lastN.length).toFixed(2);

    const groups = {};
    for (const f of lastN) {
      const b = bucketForFixture(f);
      if (!groups[b]) groups[b] = { fixtures: [], yellow: 0, red: 0, total: 0 };
      groups[b].fixtures.push(f);

      const fixtureId = f.fixture?.id;
      const c = cardMap.get(fixtureId) || { yellow: 0, red: 0, total: 0 };

      groups[b].yellow += c.yellow;
      groups[b].red += c.red;
      groups[b].total += c.total;
    }

    refDiv.innerHTML = `
      <hr />
      <p><strong>Riepilogo cartellini (ultime ${safeHTML(limit)})</strong></p>
      <div class="kv">
        <div class="kv-row"><div class="k">Copertura</div><div class="v">${usedGlobal ? "Tutte le competizioni (se disponibili)" : "Solo stessa lega (fallback)"}</div></div>
        <div class="kv-row"><div class="k">Range</div><div class="v">${safeHTML(from)} → ${safeHTML(to)}</div></div>
        <div class="kv-row"><div class="k">Cartellini totali</div><div class="v">media <strong>${safeHTML(avgTotal)}</strong> — min <strong>${safeHTML(minTotal)}</strong> — max <strong>${safeHTML(maxTotal)}</strong></div></div>
      </div>

      <p style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
        <button type="button" class="btn" id="btnToggleList">Mostra/Nascondi storico partite</button>
        <button type="button" class="btn" id="btnToggleTeam">Mostra/Nascondi dettaglio per squadra</button>
      </p>

      <div id="refList" style="display:${showList ? "block" : "none"};"></div>
      <div id="refTeamDetail" style="display:${showTeamDetail ? "block" : "none"};"></div>
    `;

    const btnList = document.getElementById("btnToggleList");
    const btnTeam = document.getElementById("btnToggleTeam");
    const divList = document.getElementById("refList");
    const divTeam = document.getElementById("refTeamDetail");

    if (btnList && divList) {
      btnList.onclick = () => {
        const isOpen = divList.style.display !== "none";
        UI_STATE.refList = !isOpen;
        divList.style.display = isOpen ? "none" : "block";
      };
    }

    if (btnTeam && divTeam) {
      btnTeam.onclick = () => {
        const isOpen = divTeam.style.display !== "none";
        UI_STATE.refTeam = !isOpen;
        divTeam.style.display = isOpen ? "none" : "block";
      };
    }

    if (divList) {
      let html = `<p><strong>Storico partite (raggruppate)</strong></p>`;

      for (const b of Object.keys(groups)) {
        const g = groups[b];
        const n = g.fixtures.length;
        const avgT = (g.total / n).toFixed(2);

        const listHtml = g.fixtures
          .map((f) => {
            const date = f.fixture?.date ? new Date(f.fixture.date).toLocaleDateString("it-IT") : "—";
            const home = f.teams?.home?.name ?? "—";
            const away = f.teams?.away?.name ?? "—";
            const comp = f.league?.name ?? "—";
            const fixtureId = f.fixture?.id;
            const c = cardMap.get(fixtureId) || { yellow: 0, red: 0, total: 0 };

            return `<li>${safeHTML(date)} — ${safeHTML(home)} vs ${safeHTML(away)} <em>(${safeHTML(comp)})</em> — Tot: <strong>${safeHTML(c.total)}</strong></li>`;
          })
          .join("");

        html += `
          <hr />
          <p><strong>${safeHTML(b)}</strong></p>
          <ul>
            <li>Partite: ${safeHTML(n)}</li>
            <li>Media totali: ${safeHTML(avgT)} / partita</li>
          </ul>
          <ul>${listHtml}</ul>
        `;
      }

      divList.innerHTML = html;
    }

    if (divTeam) {
      const rows = lastN
        .map((f) => {
          const date = f.fixture?.date ? new Date(f.fixture.date).toLocaleDateString("it-IT") : "—";
          const home = f.teams?.home?.name ?? "—";
          const away = f.teams?.away?.name ?? "—";
          const comp = f.league?.name ?? "—";

          const fixtureId = f.fixture?.id;
          const c = cardMap.get(fixtureId) || {
            homeYellow: 0,
            homeRed: 0,
            awayYellow: 0,
            awayRed: 0,
          };

          return `
            <li>
              ${safeHTML(date)} — <strong>${safeHTML(home)}</strong> vs <strong>${safeHTML(away)}</strong> <em>(${safeHTML(comp)})</em><br/>
              ${safeHTML(home)}: 🟨 ${safeHTML(c.homeYellow)} / 🟥 ${safeHTML(c.homeRed)}
              &nbsp; | &nbsp;
              ${safeHTML(away)}: 🟨 ${safeHTML(c.awayYellow)} / 🟥 ${safeHTML(c.awayRed)}
            </li>
          `;
        })
        .join("");

      divTeam.innerHTML = `
        <hr />
        <p><strong>Dettaglio per squadra (ultime ${safeHTML(limit)})</strong></p>
        <ul>${rows}</ul>
      `;
    }
  } catch (err) {
    refDiv.innerHTML = `<p class="bad"><em>Errore storico arbitro: ${safeHTML(String(err.message || err))}</em></p>`;
  }
}

/* =========================
   CACHE EVENTI / STATISTICHE
   ========================= */
const __FIXTURE_EVENTS_CACHE__ = new Map(); // fixtureId -> events array
const __FIXTURE_STATS_CACHE__ = new Map(); // fixtureId -> Map(teamId -> cornersNumber)

async function getFixtureEventsCached(fixtureId) {
  if (!fixtureId) return [];
  if (__FIXTURE_EVENTS_CACHE__.has(fixtureId)) return __FIXTURE_EVENTS_CACHE__.get(fixtureId);

  const r = await apiGet(`/fixtures/events?fixture=${fixtureId}`);
  const ev = r.ok && !r.errors ? (r.arr || []) : [];
  __FIXTURE_EVENTS_CACHE__.set(fixtureId, ev);
  return ev;
}

function extractCornersFromStatsForTeam(statsArr, teamId) {
  const teamBlock = (statsArr || []).find((x) => (x?.team?.id ?? null) === teamId);
  const list = teamBlock?.statistics || [];
  const cornerItem = list.find((s) => String(s?.type || "").toLowerCase() === "corner kicks");
  const v = cornerItem?.value;

  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

async function getCornersForFixtureTeams(fixtureId, homeId, awayId) {
  if (__FIXTURE_STATS_CACHE__.has(fixtureId)) return __FIXTURE_STATS_CACHE__.get(fixtureId);

  const r = await apiGet(`/fixtures/statistics?fixture=${fixtureId}`);
  const statsArr = r.ok && !r.errors ? (r.arr || []) : [];

  const m = new Map();
  m.set(homeId, extractCornersFromStatsForTeam(statsArr, homeId));
  m.set(awayId, extractCornersFromStatsForTeam(statsArr, awayId));

  __FIXTURE_STATS_CACHE__.set(fixtureId, m);
  return m;
}

/* =========================
   FORMA SQUADRE (ultime X)
   ========================= */
async function countCardsForTeamInFixture(fixtureId, teamId) {
  const events = await getFixtureEventsCached(fixtureId);
  if (!events || events.length === 0) return { yellow: 0, red: 0, total: 0 };

  let yellow = 0,
    red = 0;

  for (const e of events) {
    if (e?.type !== "Card") continue;
    if ((e?.team?.id ?? null) !== teamId) continue;

    const detail = String(e?.detail || "").toLowerCase();
    const isYellow = detail.includes("yellow");
    const isRed = detail.includes("red");
    if (isYellow) yellow += 1;
    else if (isRed) red += 1;
  }

  return { yellow, red, total: yellow + red };
}

async function countGoalsByHalfForTeamInFixture(fixtureId, teamId) {
  const events = await getFixtureEventsCached(fixtureId);
  if (!events || events.length === 0) {
    return { gf1: 0, gf2: 0, ga1: 0, ga2: 0, gfTotal: 0, gaTotal: 0 };
  }

  let gf1 = 0,
    gf2 = 0,
    ga1 = 0,
    ga2 = 0;

  for (const e of events) {
    if (e?.type !== "Goal") continue;

    const scorerTeamId = e?.team?.id ?? null;
    if (!scorerTeamId) continue;

    const elapsed = Number(e?.time?.elapsed ?? 0);
    const isFirstHalf = elapsed <= 45;

    const isFor = scorerTeamId === teamId;
    if (isFor) {
      if (isFirstHalf) gf1 += 1;
      else gf2 += 1;
    } else {
      if (isFirstHalf) ga1 += 1;
      else ga2 += 1;
    }
  }

  const gfTotal = gf1 + gf2;
  const gaTotal = ga1 + ga2;

  return { gf1, gf2, ga1, ga2, gfTotal, gaTotal };
}

function pct(part, total) {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function getLimitForTeams() {
  const limitEl = document.getElementById("refHistoryCount");
  let limit = parseInt(limitEl?.value || "10", 10);
  if (Number.isNaN(limit) || limit < 1) limit = 10;

  const HARD_CAP = 20;
  return Math.min(limit, HARD_CAP);
}

async function fetchTeamLastFixtures(teamId, limit) {
  const r = await apiGet(`/fixtures?team=${teamId}&last=${limit}&status=FT&timezone=Europe/Rome`);
  if (!r.ok || r.errors) return [];
  return r.arr || [];
}

function calcGoalsForAgainst(teamId, fixture) {
  const homeId = fixture.teams?.home?.id ?? null;
  const awayId = fixture.teams?.away?.id ?? null;
  const gh = fixture.goals?.home;
  const ga = fixture.goals?.away;

  const goalsHome = Number.isFinite(gh) ? gh : 0;
  const goalsAway = Number.isFinite(ga) ? ga : 0;

  if (teamId === homeId) return { gf: goalsHome, ga: goalsAway, isHome: true };
  if (teamId === awayId) return { gf: goalsAway, ga: goalsHome, isHome: false };
  return { gf: 0, ga: 0, isHome: null };
}

async function buildTeamForm(team, limit) {
  const fixtures = await fetchTeamLastFixtures(team.id, limit);
  if (fixtures.length === 0) {
    return {
      team,
      limit,
      fixtures: [],
      avgGF: "0.00",
      avgGA: "0.00",
      avgCards: "0.00",
      note: "Nessuna partita trovata.",
      gf1Pct: 0,
      gf2Pct: 0,
      ga1Pct: 0,
      ga2Pct: 0,
    };
  }

  let sumGF = 0;
  let sumGA = 0;
  let sumCards = 0;

  let sumGF1 = 0,
    sumGF2 = 0;
  let sumGA1 = 0,
    sumGA2 = 0;

  const perFixture = [];

  for (const f of fixtures) {
    const fixtureId = f.fixture?.id ?? null;
    const date = f.fixture?.date ? new Date(f.fixture.date).toLocaleDateString("it-IT") : "—";
    const home = f.teams?.home?.name ?? "—";
    const away = f.teams?.away?.name ?? "—";
    const comp = f.league?.name ?? "—";

    const g = calcGoalsForAgainst(team.id, f);
    sumGF += g.gf;
    sumGA += g.ga;

    const goalHalves = fixtureId
      ? await countGoalsByHalfForTeamInFixture(fixtureId, team.id)
      : { gf1: 0, gf2: 0, ga1: 0, ga2: 0, gfTotal: 0, gaTotal: 0 };

    sumGF1 += goalHalves.gf1;
    sumGF2 += goalHalves.gf2;
    sumGA1 += goalHalves.ga1;
    sumGA2 += goalHalves.ga2;

    const cards = fixtureId
      ? await countCardsForTeamInFixture(fixtureId, team.id)
      : { total: 0, yellow: 0, red: 0 };
    sumCards += cards.total;

    perFixture.push({
  fixtureId,
  date,
  home,
  away,
  homeLogo: f.teams?.home?.logo ?? "",
  awayLogo: f.teams?.away?.logo ?? "",
  comp,
  gf: g.gf,
  ga: g.ga,
  goalHalves,
  cards,
});
  }

  const n = perFixture.length;
  const gfTotal = sumGF1 + sumGF2;
  const gaTotal = sumGA1 + sumGA2;

  const gf1Pct = pct(sumGF1, gfTotal);
  const gf2Pct = pct(sumGF2, gfTotal);

  const ga1Pct = pct(sumGA1, gaTotal);
  const ga2Pct = pct(sumGA2, gaTotal);

  return {
    team,
    limit: n,
    fixtures: perFixture,
    avgGF: (sumGF / n).toFixed(2),
    avgGA: (sumGA / n).toFixed(2),
    avgCards: (sumCards / n).toFixed(2),
    gf1Pct,
    gf2Pct,
    ga1Pct,
    ga2Pct,
    note: limit > n ? "Copertura parziale (meno partite disponibili)." : "",
  };
}

async function loadTeamsForm() {
  if (!selectedFixture?.home?.id || !selectedFixture?.away?.id) {
    setTeams(
      `<p class="muted"><em>Seleziona una squadra per vedere la forma delle due squadre.</em></p>`,
    );
    return;
  }

  setTeams(`<p class="muted"><em>Recupero forma squadre...</em></p>`);

  const limit = getLimitForTeams();
  const requested =
    parseInt(document.getElementById("refHistoryCount")?.value || "10", 10) || 10;

  const cappedMsg =
    requested > limit
      ? `<p class="muted"><em>Nota: per evitare rallentamenti, per le squadre uso massimo ${safeHTML(limit)} partite (hai selezionato ${safeHTML(requested)}).</em></p>`
      : "";

  const showList = UI_STATE.teamList;
  const showCardsDetail = UI_STATE.teamCards;

  const [homeForm, awayForm] = await Promise.all([
    buildTeamForm(selectedFixture.home, limit),
    buildTeamForm(selectedFixture.away, limit),
  ]);

  const lastN = Math.min(5, limit); // puoi cambiare 5 in 10 se vuoi default diverso

setTeams(`
  ${cappedMsg}
  <div class="teamCardsWrap">
    ${renderTeamFormCard(homeForm, lastN)}
    ${renderTeamFormCard(awayForm, lastN)}
  </div>
`);

    <p style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
      <button type="button" class="btn" id="btnToggleTeamList">Mostra/Nascondi ultime partite</button>
      <button type="button" class="btn" id="btnToggleTeamCards">Mostra/Nascondi cartellini per match</button>
    </p>

    <div id="teamList" style="display:${showList ? "block" : "none"};"></div>
    <div id="teamCardsDetail" style="display:${showCardsDetail ? "block" : "none"};"></div>
  `);

  const btnList = document.getElementById("btnToggleTeamList");
  const btnCards = document.getElementById("btnToggleTeamCards");
  const divList = document.getElementById("teamList");
  const divCards = document.getElementById("teamCardsDetail");

  if (btnList && divList) {
    btnList.onclick = () => {
      const isOpen = divList.style.display !== "none";
      UI_STATE.teamList = !isOpen;
      divList.style.display = isOpen ? "none" : "block";
    };
  }

  if (btnCards && divCards) {
    btnCards.onclick = () => {
      const isOpen = divCards.style.display !== "none";
      UI_STATE.teamCards = !isOpen;
      divCards.style.display = isOpen ? "none" : "block";
    };
  }

  if (divList) {
    divList.innerHTML = `
      <hr />
      <p><strong>Ultime partite (gol fatti/subiti)</strong></p>
      ${renderTeamMatchesList(homeForm)}
      ${renderTeamMatchesList(awayForm)}
    `;
  }

  if (divCards) {
    divCards.innerHTML = `
      <hr />
      <p><strong>Cartellini per match (solo squadra)</strong></p>
      ${renderTeamCardsList(homeForm)}
      ${renderTeamCardsList(awayForm)}
    `;
  }
}

function renderTeamFormCard(form, lastN = 5) {
  const t = form.team;
  const rows = (form.fixtures || []).slice(0, lastN);

  const chips = `
    <span class="chip chip-ok">V ${safeHTML(countResults(rows).w)}</span>
    <span class="chip chip-mid">P ${safeHTML(countResults(rows).d)}</span>
    <span class="chip chip-bad">S ${safeHTML(countResults(rows).l)}</span>
    <span class="chip">GF ${safeHTML(sum(rows, "gf"))}</span>
    <span class="chip">GS ${safeHTML(sum(rows, "ga"))}</span>
  `;

  const body = rows.length
    ? rows
        .map((x) => {
          const isHome = (x.home || "").toLowerCase() === (t.name || "").toLowerCase();
          const oppName = isHome ? x.away : x.home;
          const oppLogo = isHome ? x.awayLogo : x.homeLogo;

          let res = "D";
          let resClass = "res-d";
          if (x.gf > x.ga) { res = "W"; resClass = "res-w"; }
          else if (x.gf < x.ga) { res = "L"; resClass = "res-l"; }

          const y = x.cards?.yellow ?? 0;
          const r = x.cards?.red ?? 0;

          return `
            <tr>
              <td class="td-date">${safeHTML(x.date)}</td>
              <td class="td-opp">
                <span class="opp">
                  ${oppLogo ? `<img class="oppLogo" src="${safeHTML(oppLogo)}" alt="">` : ``}
                  <span class="oppName">${safeHTML(oppName)}</span>
                </span>
              </td>
              <td class="td-res"><span class="resBadge ${resClass}">${res}</span></td>
              <td class="td-score"><strong>${safeHTML(x.gf)}-${safeHTML(x.ga)}</strong></td>
              <td class="td-y">${y ? safeHTML(y) : "—"}</td>
              <td class="td-r">${r ? safeHTML(r) : "—"}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="6" class="muted"><em>Nessun dato</em></td></tr>`;

  return `
    <div class="teamCard">
      <div class="teamCardHead">
        <div class="teamTitle">
          ${t.logo ? `<img class="teamLogo" src="${safeHTML(t.logo)}" alt="logo">` : ``}
          <div class="teamName">${safeHTML(t.name)}</div>
        </div>
        <div class="teamLastN">Ultime ${safeHTML(lastN)}</div>
      </div>

      <div class="teamChips">${chips}</div>

      <div class="teamTableWrap">
        <table class="teamTable">
          <thead>
            <tr>
              <th>Data</th>
              <th>Avv.</th>
              <th>Ris.</th>
              <th>G</th>
              <th class="th-y">🟨</th>
              <th class="th-r">🟥</th>
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function countResults(rows) {
  let w = 0, d = 0, l = 0;
  for (const x of rows || []) {
    if ((x.gf ?? 0) > (x.ga ?? 0)) w++;
    else if ((x.gf ?? 0) < (x.ga ?? 0)) l++;
    else d++;
  }
  return { w, d, l };
}

function sum(rows, key) {
  let s = 0;
  for (const x of rows || []) s += Number(x?.[key] ?? 0);
  return s;
}

function renderTeamMatchesList(form) {
  const t = form.team;
  const items = form.fixtures
    .map((x) => {
      return `<li>${safeHTML(x.date)} — ${safeHTML(x.home)} vs ${safeHTML(
        x.away,
      )} <em>(${safeHTML(x.comp)})</em> — GF <strong>${safeHTML(
        x.gf,
      )}</strong> / GS <strong>${safeHTML(x.ga)}</strong></li>`;
    })
    .join("");

  return `
    <hr />
    <p><strong>${safeHTML(t.name)}</strong></p>
    <ul>${items || `<li class="muted">Nessun dato</li>`}</ul>
  `;
}

function renderTeamCardsList(form) {
  const t = form.team;
  const items = form.fixtures
    .map((x) => {
      const c = x.cards || { yellow: 0, red: 0, total: 0 };
      return `<li>${safeHTML(x.date)} — ${safeHTML(x.home)} vs ${safeHTML(
        x.away,
      )} <em>(${safeHTML(x.comp)})</em> — 🟨 ${safeHTML(
        c.yellow,
      )} / 🟥 ${safeHTML(c.red)} (Tot ${safeHTML(c.total)})</li>`;
    })
    .join("");

  return `
    <hr />
    <p><strong>${safeHTML(t.name)}</strong></p>
    <ul>${items || `<li class="muted">Nessun dato</li>`}</ul>
  `;
}

/* =========================
   CORNER (ultime X)
   ========================= */
async function buildTeamCorners(team, limit) {
  const fixtures = await fetchTeamLastFixtures(team.id, limit);
  if (fixtures.length === 0) {
    return {
      team,
      limit,
      fixtures: [],
      avgCorners: "0.00",
      minCorners: 0,
      maxCorners: 0,
      avgCornersAgainst: "0.00",
      minCornersAgainst: 0,
      maxCornersAgainst: 0,
      note: "Nessuna partita trovata.",
    };
  }

  const perFixture = [];
  let sum = 0;
  let sumAgainst = 0;

  let min = null;
  let max = null;

  let minAgainst = null;
  let maxAgainst = null;

  for (const f of fixtures) {
    const fixtureId = f.fixture?.id ?? null;
    const date = f.fixture?.date ? new Date(f.fixture.date).toLocaleDateString("it-IT") : "—";
    const homeId = f.teams?.home?.id ?? null;
    const awayId = f.teams?.away?.id ?? null;
    const home = f.teams?.home?.name ?? "—";
    const away = f.teams?.away?.name ?? "—";
    const comp = f.league?.name ?? "—";

    let cornersFor = 0;
    let cornersAgainst = 0;

    if (fixtureId && homeId && awayId) {
      const map = await getCornersForFixtureTeams(fixtureId, homeId, awayId);

      cornersFor = map.get(team.id) ?? 0;

      const oppId = team.id === homeId ? awayId : homeId;
      cornersAgainst = map.get(oppId) ?? 0;
    }

    sum += cornersFor;
    sumAgainst += cornersAgainst;

    if (min === null || cornersFor < min) min = cornersFor;
    if (max === null || cornersFor > max) max = cornersFor;

    if (minAgainst === null || cornersAgainst < minAgainst) minAgainst = cornersAgainst;
    if (maxAgainst === null || cornersAgainst > maxAgainst) maxAgainst = cornersAgainst;

    perFixture.push({
      fixtureId,
      date,
      home,
      away,
      comp,
      cornersFor,
      cornersAgainst,
    });
  }

  const n = perFixture.length;
  return {
    team,
    limit: n,
    fixtures: perFixture,

    avgCorners: (sum / n).toFixed(2),
    minCorners: min ?? 0,
    maxCorners: max ?? 0,

    avgCornersAgainst: (sumAgainst / n).toFixed(2),
    minCornersAgainst: minAgainst ?? 0,
    maxCornersAgainst: maxAgainst ?? 0,

    note: limit > n ? "Copertura parziale (meno partite disponibili)." : "",
  };
}

function renderTeamCornersSummary(form) {
  const t = form.team;
  return `
    <div class="kv-row">
      <div class="k">Corner: ${safeHTML(t.name)}</div>
      <div class="v">
        <span class="teamline">
          ${t.logo ? `<img class="logo" src="${safeHTML(t.logo)}" alt="logo" />` : ""}
          <span class="pill">ultime ${safeHTML(form.limit)}</span>

          <span class="pill">Fatti media ${safeHTML(form.avgCorners)}</span>
          <span class="pill">Fatti min ${safeHTML(form.minCorners)}</span>
          <span class="pill">Fatti max ${safeHTML(form.maxCorners)}</span>

          <span class="pill">Subiti media ${safeHTML(form.avgCornersAgainst)}</span>
          <span class="pill">Subiti min ${safeHTML(form.minCornersAgainst)}</span>
          <span class="pill">Subiti max ${safeHTML(form.maxCornersAgainst)}</span>
        </span>
        ${form.note ? `<div class="muted" style="margin-top:6px; font-size:12px;">${safeHTML(form.note)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderTeamCornersList(form) {
  const t = form.team;
  const items = form.fixtures
    .map((x) => {
      // FIX: prima era x.corners (non esiste). Il dato giusto è cornersFor
      return `<li>${safeHTML(x.date)} — ${safeHTML(x.home)} vs ${safeHTML(
        x.away,
      )} <em>(${safeHTML(x.comp)})</em> — Corner <strong>${safeHTML(
        x.cornersFor,
      )}</strong></li>`;
    })
    .join("");

  return `
    <hr />
    <p><strong>${safeHTML(t.name)}</strong></p>
    <ul>${items || `<li class="muted">Nessun dato</li>`}</ul>
  `;
}

function renderTeamCornersPerMatch(form) {
  const t = form.team;
  const items = form.fixtures
    .map((x) => {
      return `<li>${safeHTML(x.date)} — ${safeHTML(x.home)} vs ${safeHTML(
        x.away,
      )} <em>(${safeHTML(x.comp)})</em> — Corner <strong>${safeHTML(
        x.cornersFor,
      )}</strong> fatti / <strong>${safeHTML(x.cornersAgainst)}</strong> subiti</li>`;
    })
    .join("");

  return `
    <hr />
    <p><strong>${safeHTML(t.name)}</strong></p>
    <ul>${items || `<li class="muted">Nessun dato</li>`}</ul>
  `;
}

async function loadTeamsCorners() {
  if (!selectedFixture?.home?.id || !selectedFixture?.away?.id) {
    setCorners(
      `<p class="muted"><em>Seleziona una squadra per vedere i corner delle due squadre.</em></p>`,
    );
    return;
  }

  setCorners(`<p class="muted"><em>Recupero corner squadre...</em></p>`);

  const limit = getLimitForTeams();
  const requested =
    parseInt(document.getElementById("refHistoryCount")?.value || "10", 10) || 10;

  const cappedMsg =
    requested > limit
      ? `<p class="muted"><em>Nota: per evitare rallentamenti, per i corner uso massimo ${safeHTML(limit)} partite (hai selezionato ${safeHTML(requested)}).</em></p>`
      : "";

  const showList = UI_STATE.cornersList;
  const showPerMatch = UI_STATE.cornersPerMatch;

  const [homeC, awayC] = await Promise.all([
    buildTeamCorners(selectedFixture.home, limit),
    buildTeamCorners(selectedFixture.away, limit),
  ]);

  setCorners(`
    ${cappedMsg}
    <div class="kv">
      ${renderTeamCornersSummary(homeC)}
      ${renderTeamCornersSummary(awayC)}
    </div>

    <p style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
      <button type="button" class="btn" id="btnToggleCornersList">Mostra/Nascondi ultime partite corner</button>
      <button type="button" class="btn" id="btnToggleCornersPerMatch">Mostra/Nascondi corner per match</button>
    </p>

    <div id="cornersList" style="display:${showList ? "block" : "none"};"></div>
    <div id="cornersPerMatch" style="display:${showPerMatch ? "block" : "none"};"></div>
  `);

  const btnList = document.getElementById("btnToggleCornersList");
  const btnPer = document.getElementById("btnToggleCornersPerMatch");
  const divList = document.getElementById("cornersList");
  const divPer = document.getElementById("cornersPerMatch");

  if (btnList && divList) {
    btnList.onclick = () => {
      const isOpen = divList.style.display !== "none";
      UI_STATE.cornersList = !isOpen;
      divList.style.display = isOpen ? "none" : "block";
    };
  }

  if (btnPer && divPer) {
    btnPer.onclick = () => {
      const isOpen = divPer.style.display !== "none";
      UI_STATE.cornersPerMatch = !isOpen;
      divPer.style.display = isOpen ? "none" : "block";
    };
  }

  if (divList) {
    divList.innerHTML = `
      <hr />
      <p><strong>Ultime partite (corner)</strong></p>
      ${renderTeamCornersList(homeC)}
      ${renderTeamCornersList(awayC)}
    `;
  }

  if (divPer) {
    divPer.innerHTML = `
      <hr />
      <p><strong>Corner per match (fatti vs subiti)</strong></p>
      ${renderTeamCornersPerMatch(homeC)}
      ${renderTeamCornersPerMatch(awayC)}
    `;
  }
}

/* =========================
   EVENTI UI (pannelli)
   ========================= */
document.getElementById("refHistoryCount")?.addEventListener("change", () => {
  if (selectedFixture?.referee && selectedFixture.referee !== "—") loadRefereeHistory();
  if (selectedFixture?.home?.id && selectedFixture?.away?.id) loadTeamsForm();
  if (selectedFixture?.home?.id && selectedFixture?.away?.id) loadTeamsCorners();
});

document.getElementById("optShowList")?.addEventListener("change", () => {
  if (selectedFixture?.referee && selectedFixture.referee !== "—") loadRefereeHistory();
});

document.getElementById("optShowTeamDetail")?.addEventListener("change", () => {
  if (selectedFixture?.referee && selectedFixture.referee !== "—") loadRefereeHistory();
});

document.getElementById("optShowTeamList")?.addEventListener("change", () => {
  if (selectedFixture?.home?.id && selectedFixture?.away?.id) loadTeamsForm();
});

document.getElementById("optShowTeamCardsDetail")?.addEventListener("change", () => {
  if (selectedFixture?.home?.id && selectedFixture?.away?.id) loadTeamsForm();
});

