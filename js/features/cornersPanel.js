// js/features/cornersPanel.js

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
  homeLogo: f.teams?.home?.logo ?? "",
  awayLogo: f.teams?.away?.logo ?? "",
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
function renderTeamCornersCard(form, lastN) {
  const t = form.team;
  const rows = (form.fixtures || []).slice(0, lastN);

  const chips = `
    <span class="chip">Media: ${safeHTML(form.avgCorners)}</span>
    <span class="chip">Min: ${safeHTML(form.minCorners)}</span>
    <span class="chip">Max: ${safeHTML(form.maxCorners)}</span>
    <span class="chip">Media subiti: ${safeHTML(form.avgCornersAgainst)}</span>
  `;

  const body = rows.length
    ? rows.map((x) => {
        const isHome = String(x.home || "").toLowerCase() === String(t.name || "").toLowerCase();
        const oppName = isHome ? x.away : x.home;
        const oppLogo = isHome ? x.awayLogo : x.homeLogo;

        return `
          <tr>
            <td class="td-date">${safeHTML(x.date)}</td>
            <td class="td-opp">
              <span class="opp">
                ${oppLogo ? `<img class="oppLogo" src="${safeHTML(oppLogo)}" alt="">` : ``}
                <span class="oppName">${safeHTML(oppName)}</span>
              </span>
            </td>
            <td class="td-score"><strong>${safeHTML(x.cornersFor)}</strong></td>
            <td class="td-score"><strong>${safeHTML(x.cornersAgainst)}</strong></td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="4" class="muted"><em>Nessun dato</em></td></tr>`;

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
              <th>🚩 Fatti</th>
              <th>🚩 Sub.</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>

      ${form.note ? `<div class="muted" style="margin-top:8px; font-size:12px;"><em>${safeHTML(form.note)}</em></div>` : ``}
    </div>
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

 const lastN = Math.min(requested, limit);

setCorners(`
  ${cappedMsg}
  <div class="teamCardsWrap">
    ${renderTeamCornersCard(homeC, lastN)}
    ${renderTeamCornersCard(awayC, lastN)}
  </div>
`);
   try {
  if (window.publishIndicatorData) {
    window.publishIndicatorData("corners", {
      home: {
        avgCorners: Number(homeC.avgCorners),
        avgCornersAgainst: Number(homeC.avgCornersAgainst),
      },
      away: {
        avgCorners: Number(awayC.avgCorners),
        avgCornersAgainst: Number(awayC.avgCornersAgainst),
      },
    });
  }
} catch (e) {
  console.error("publish indicators corners", e);
}

}

