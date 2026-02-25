// js/features/shotsPanel.js

/* =========================
   TIRI (ultime X)
   ========================= */

function setShots(html) {
  const el = document.getElementById("shotsPanel");
  if (el) el.innerHTML = html;
}

function pickStatValue(statArray, wanted) {
  const key = String(wanted || "").toLowerCase();

  const found = (statArray || []).find((s) => {
    const t = String(s?.type || "").toLowerCase();
    return t === key;
  });

  const v = found?.value;

  // L'API a volte ritorna numeri, stringhe, null
  const n = Number(v);
  if (Number.isFinite(n)) return n;

  // se è tipo "—" o null
  return 0;
}

function normalizeStats(statArray) {
  // API-Football di solito usa:
  // - "Total Shots"
  // - "Shots on Goal"
  // ma per sicurezza gestiamo anche varianti.
  const lower = (s) => String(s || "").toLowerCase();

  const map = new Map();
  for (const s of statArray || []) {
    map.set(lower(s?.type), s?.value);
  }

  const get = (typeA, typeB, typeC) => {
    const candidates = [typeA, typeB, typeC].filter(Boolean).map(lower);
    for (const c of candidates) {
      const v = map.get(c);
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };

  return {
    total: get("Total Shots", "Shots Total", "Total shots"),
    onTarget: get("Shots on Goal", "Shots on Target", "Shots on goal"),
  };
}

async function getShotsForFixtureTeams(fixtureId, homeId, awayId) {
  // ritorna una Map(teamId -> { total, onTarget })
  const out = new Map();
  out.set(homeId, { total: 0, onTarget: 0 });
  out.set(awayId, { total: 0, onTarget: 0 });

  const r = await apiGet(`/fixtures/statistics?fixture=${fixtureId}`);
  if (!r.ok || r.errors || !Array.isArray(r.arr) || r.arr.length === 0) return out;

  // r.arr è una lista di 2 elementi (team home/away), con struttura:
  // { team: { id, name }, statistics: [{type,value}, ...] }
  for (const row of r.arr) {
    const teamId = row?.team?.id ?? null;
    if (!teamId) continue;
    if (teamId !== homeId && teamId !== awayId) continue;

    const stats = normalizeStats(row?.statistics || []);
    out.set(teamId, stats);
  }

  return out;
}

async function buildTeamShots(team, limit) {
  const fixtures = await fetchTeamLastFixtures(team.id, limit);
  if (fixtures.length === 0) {
    return {
      team,
      limit,
      fixtures: [],
      avgShotsFor: "0.00",
      avgOnTargetFor: "0.00",
      avgShotsAgainst: "0.00",
      avgOnTargetAgainst: "0.00",
      note: "Nessuna partita trovata.",
    };
  }

  const perFixture = [];

  let sumFor = 0;
  let sumForOT = 0;
  let sumAg = 0;
  let sumAgOT = 0;

  for (const f of fixtures) {
    const fixtureId = f.fixture?.id ?? null;
    const date = f.fixture?.date
      ? new Date(f.fixture.date).toLocaleDateString("it-IT")
      : "—";
    const homeId = f.teams?.home?.id ?? null;
    const awayId = f.teams?.away?.id ?? null;
    const home = f.teams?.home?.name ?? "—";
    const away = f.teams?.away?.name ?? "—";
    const comp = f.league?.name ?? "—";

    let shotsFor = 0;
    let shotsForOT = 0;
    let shotsAgainst = 0;
    let shotsAgainstOT = 0;

    if (fixtureId && homeId && awayId) {
      const map = await getShotsForFixtureTeams(fixtureId, homeId, awayId);

      const mine = map.get(team.id) || { total: 0, onTarget: 0 };
      shotsFor = mine.total;
      shotsForOT = mine.onTarget;

      const oppId = team.id === homeId ? awayId : homeId;
      const opp = map.get(oppId) || { total: 0, onTarget: 0 };
      shotsAgainst = opp.total;
      shotsAgainstOT = opp.onTarget;
    }

    sumFor += shotsFor;
    sumForOT += shotsForOT;
    sumAg += shotsAgainst;
    sumAgOT += shotsAgainstOT;

    perFixture.push({
  fixtureId,
  date,
  home,
  away,
  homeLogo: f.teams?.home?.logo ?? "",
  awayLogo: f.teams?.away?.logo ?? "",
  comp,
  shotsFor,
  shotsForOT,
  shotsAgainst,
  shotsAgainstOT,
});
  }

  const n = perFixture.length;

  return {
    team,
    limit: n,
    fixtures: perFixture,
    avgShotsFor: (sumFor / n).toFixed(2),
    avgOnTargetFor: (sumForOT / n).toFixed(2),
    avgShotsAgainst: (sumAg / n).toFixed(2),
    avgOnTargetAgainst: (sumAgOT / n).toFixed(2),
    note: limit > n ? "Copertura parziale (meno partite disponibili)." : "",
  };
}

function renderTeamShotsSummary(form) {
  const t = form.team;
  return `
    <div class="kv-row">
      <div class="k">Tiri: ${safeHTML(t.name)}</div>
      <div class="v">
        <span class="teamline">
          ${t.logo ? `<img class="logo" src="${safeHTML(t.logo)}" alt="logo" />` : ""}
          <span class="pill">ultime ${safeHTML(form.limit)}</span>

          <span class="pill">Tiri fatti ${safeHTML(form.avgShotsFor)}</span>
          <span class="pill">In porta ${safeHTML(form.avgOnTargetFor)}</span>

          <span class="pill">Tiri subiti ${safeHTML(form.avgShotsAgainst)}</span>
          <span class="pill">In porta subiti ${safeHTML(form.avgOnTargetAgainst)}</span>
        </span>
        ${
          form.note
            ? `<div class="muted" style="margin-top:6px; font-size:12px;">${safeHTML(
                form.note,
              )}</div>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderTeamShotsList(form) {
  const t = form.team;

  const items = form.fixtures
    .map((x) => {
      return `<li>${safeHTML(x.date)} — ${safeHTML(x.home)} vs ${safeHTML(
        x.away,
      )} <em>(${safeHTML(x.comp)})</em> — Tiri <strong>${safeHTML(
        x.shotsFor,
      )}</strong> (in porta ${safeHTML(x.shotsForOT)})</li>`;
    })
    .join("");

  return `
    <hr />
    <p><strong>${safeHTML(t.name)}</strong></p>
    <ul>${items || `<li class="muted">Nessun dato</li>`}</ul>
  `;
}

function renderTeamShotsPerMatch(form) {
  const t = form.team;

  const items = form.fixtures
    .map((x) => {
      return `<li>${safeHTML(x.date)} — ${safeHTML(x.home)} vs ${safeHTML(
        x.away,
      )} <em>(${safeHTML(x.comp)})</em> — Tiri <strong>${safeHTML(
        x.shotsFor,
      )}</strong> / <strong>${safeHTML(
        x.shotsAgainst,
      )}</strong> (in porta ${safeHTML(x.shotsForOT)} / ${safeHTML(
        x.shotsAgainstOT,
      )})</li>`;
    })
    .join("");

  return `
    <hr />
    <p><strong>${safeHTML(t.name)}</strong></p>
    <ul>${items || `<li class="muted">Nessun dato</li>`}</ul>
  `;
}
function renderTeamShotsCard(form, lastN) {
  const t = form.team;
  const rows = (form.fixtures || []).slice(0, lastN);

  const chips = `
    <span class="chip">Media tiri: ${safeHTML(form.avgShotsFor)}</span>
    <span class="chip">In porta: ${safeHTML(form.avgOnTargetFor)}</span>
    <span class="chip">Subiti: ${safeHTML(form.avgShotsAgainst)}</span>
    <span class="chip">In porta subiti: ${safeHTML(form.avgOnTargetAgainst)}</span>
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
            <td class="td-score"><strong>${safeHTML(x.shotsFor)}</strong></td>
            <td class="td-score"><strong>${safeHTML(x.shotsForOT)}</strong></td>
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
              <th>🎯 Totali</th>
              <th>🥅 In porta</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>

      ${form.note ? `<div class="muted" style="margin-top:8px; font-size:12px;"><em>${safeHTML(form.note)}</em></div>` : ``}
    </div>
  `;
}
async function loadTeamsShots() {
  if (!selectedFixture?.home?.id || !selectedFixture?.away?.id) {
    setShots(
      `<p class="muted"><em>Seleziona una squadra per vedere i tiri delle due squadre.</em></p>`,
    );
    return;
  }

  setShots(`<p class="muted"><em>Recupero tiri squadre...</em></p>`);

  const limit = getLimitForTeams();

  const requested =
    parseInt(document.getElementById("refHistoryCount")?.value || "10", 10) || 10;

  const cappedMsg =
    requested > limit
      ? `<p class="muted"><em>Nota: per evitare rallentamenti, per i tiri uso massimo ${safeHTML(
          limit,
        )} partite (hai selezionato ${safeHTML(requested)}).</em></p>`
      : "";

  const showList = UI_STATE.shotsList;
  const showPerMatch = UI_STATE.shotsPerMatch;

  const [homeS, awayS] = await Promise.all([
    buildTeamShots(selectedFixture.home, limit),
    buildTeamShots(selectedFixture.away, limit),
  ]);

  const lastN = Math.min(requested, limit);

setShots(`
  ${cappedMsg}
  <div class="teamCardsWrap">
    ${renderTeamShotsCard(homeS, lastN)}
    ${renderTeamShotsCard(awayS, lastN)}
  </div>
`);
try {
  if (window.publishIndicatorData) {
    window.publishIndicatorData("shots", {
      home: {
        avgShotsFor: Number(homeS.avgShotsFor),
        avgShotsAgainst: Number(homeS.avgShotsAgainst),
        avgOnTargetFor: Number(homeS.avgOnTargetFor),
        avgOnTargetAgainst: Number(homeS.avgOnTargetAgainst),
      },
      away: {
        avgShotsFor: Number(awayS.avgShotsFor),
        avgShotsAgainst: Number(awayS.avgShotsAgainst),
        avgOnTargetFor: Number(awayS.avgOnTargetFor),
        avgOnTargetAgainst: Number(awayS.avgOnTargetAgainst),
      },
    });
  }
} catch (e) {
  console.error("publish indicators shots", e);
}
}

