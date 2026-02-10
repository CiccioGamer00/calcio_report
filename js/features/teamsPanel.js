// js/features/teamsPanel.js

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

  setTeams(`
    ${cappedMsg}
    <div class="kv">
      ${renderTeamFormSummary(homeForm)}
      ${renderTeamFormSummary(awayForm)}
    </div>

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

function renderTeamFormSummary(form) {
  const t = form.team;
  return `
    <div class="kv-row">
      <div class="k">Forma: ${safeHTML(t.name)}</div>
      <div class="v">
        <span class="teamline">
          ${t.logo ? `<img class="logo" src="${safeHTML(t.logo)}" alt="logo" />` : ""}
          <span class="pill">ultime ${safeHTML(form.limit)}</span>
          <span class="pill">GF ${safeHTML(form.avgGF)}</span>
          <span class="pill">GS ${safeHTML(form.avgGA)}</span>
          <span class="pill">Gol fatti: 1T ${safeHTML(form.gf1Pct)}% · 2T ${safeHTML(form.gf2Pct)}%</span>
          <span class="pill">Gol subiti: 1T ${safeHTML(form.ga1Pct)}% · 2T ${safeHTML(form.ga2Pct)}%</span>
          <span class="pill">Cartellini ${safeHTML(form.avgCards)}</span>
        </span>
        ${form.note ? `<div class="muted" style="margin-top:6px; font-size:12px;">${safeHTML(form.note)}</div>` : ""}
      </div>
    </div>
  `;
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