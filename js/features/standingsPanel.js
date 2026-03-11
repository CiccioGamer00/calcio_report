function setStandings(html) {
  const el = document.getElementById("standingsPanel");
  if (el) el.innerHTML = html;
}

async function loadStandings() {
  if (!selectedFixture?.leagueId || !selectedFixture?.season) {
    setStandings(`<p class="muted"><em>Seleziona un match per vedere la classifica.</em></p>`);
    return;
  }

  setStandings(`<p class="muted"><em>Recupero classifica...</em></p>`);

  const leagueId = selectedFixture.leagueId;
  const season = selectedFixture.season;

  const r = await apiGet(`/standings?league=${leagueId}&season=${season}`, { retries: 2, delays: [500, 1000] });

if (!r.ok) {
  setStandings(`<p class="bad"><em>Errore classifica: HTTP ${safeHTML(r.status || 0)}</em></p>`);
  return;
}

if (r.errors) {
  const msg =
    r.errors?.message ||
    r.errors?.requests ||
    r.errors?.league ||
    r.errors?.season ||
    (typeof r.errors === "string" ? r.errors : "Classifica non disponibile per questa competizione.");
  setStandings(`<p class="muted"><em>${safeHTML(msg)}</em></p>`);
  return;
}

if (!Array.isArray(r.arr) || r.arr.length === 0) {
  setStandings(`<p class="muted"><em>Classifica non disponibile per questa competizione.</em></p>`);
  return;
}

  // struttura tipica: response[0].league.standings[0] = array team rows
  const league = r.arr[0]?.league || {};
  const rowsRaw = Array.isArray(league?.standings) ? league.standings : [];
const rows = Array.isArray(rowsRaw[0]) ? rowsRaw[0] : [];

if (!rows.length) {
  setStandings(`<p class="muted"><em>Classifica non disponibile o non supportata per questa competizione.</em></p>`);
  return;
}

  const homeId = selectedFixture?.home?.id;
  const awayId = selectedFixture?.away?.id;

  // salva mini posizione per match hero
const homeRow = rows.find(r => (r?.team?.id ?? null) === homeId) || null;
const awayRow = rows.find(r => (r?.team?.id ?? null) === awayId) || null;

selectedFixture.standingsMini = {
  leagueName: league?.name || "",
  home: homeRow ? { rank: homeRow.rank, points: homeRow.points } : null,
  away: awayRow ? { rank: awayRow.rank, points: awayRow.points } : null,
};

  function rowHtml(x) {
    const team = x?.team || {};
    const rank = x?.rank ?? "—";
    const pts = x?.points ?? "—";
    const gf = x?.all?.goals?.for ?? "—";
    const ga = x?.all?.goals?.against ?? "—";
    const played = x?.all?.played ?? "—";
    const diff = (Number(gf) - Number(ga));
    const isFocus = (team?.id === homeId || team?.id === awayId);

    return `
      <div class="st-row ${isFocus ? "is-focus" : ""}">
        <div class="st-rank">${safeHTML(rank)}</div>
        <div class="st-team">
          ${team?.logo ? `<img class="logo" src="${safeHTML(team.logo)}" alt="">` : ""}
          <span class="st-name">${safeHTML(team?.name || "—")}</span>
        </div>
        <div class="st-num">${safeHTML(played)}</div>
        <div class="st-num"><strong>${safeHTML(pts)}</strong></div>
        <div class="st-num">${safeHTML(gf)}</div>
        <div class="st-num">${safeHTML(ga)}</div>
        <div class="st-num">${Number.isFinite(diff) ? safeHTML(diff) : "—"}</div>
      </div>
    `;
  }

  const head = `
    <div class="st-head">
      <div class="st-rank">#</div>
      <div class="st-team">Squadra</div>
      <div class="st-num">G</div>
      <div class="st-num">Pt</div>
      <div class="st-num">GF</div>
      <div class="st-num">GS</div>
      <div class="st-num">DR</div>
    </div>
  `;

  setStandings(`
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;">
      <div>
        <div style="font-weight:950;">${safeHTML(league?.name || "Classifica")}</div>
        <div class="muted" style="font-size:12px;">Stagione ${safeHTML(season)}</div>
      </div>
    </div>
    <div class="st-table">
      ${head}
      ${rows.map(rowHtml).join("")}
    </div>
    <p class="muted" style="margin-top:10px;font-size:12px;">
      Evidenziate: ${safeHTML(selectedFixture.home?.name || "Casa")} e ${safeHTML(selectedFixture.away?.name || "Trasferta")}.
    </p>
  `);
}
async function loadStandingsMini() {
  if (!selectedFixture?.leagueId || !selectedFixture?.season) return null;

  const leagueId = selectedFixture.leagueId;
  const season = selectedFixture.season;

  const r = await apiGet(`/standings?league=${leagueId}&season=${season}`, { retries: 2, delays: [500, 1000] });
  if (!r.ok || r.errors || !Array.isArray(r.arr) || r.arr.length === 0) return null;

  const league = r.arr[0]?.league || {};
  const rows = league?.standings?.[0] || [];

  const homeId = selectedFixture?.home?.id;
  const awayId = selectedFixture?.away?.id;

  const homeRow = rows.find(x => (x?.team?.id ?? null) === homeId) || null;
  const awayRow = rows.find(x => (x?.team?.id ?? null) === awayId) || null;

  selectedFixture.standingsMini = {
    leagueName: league?.name || "",
    home: homeRow ? { rank: homeRow.rank, points: homeRow.points } : null,
    away: awayRow ? { rank: awayRow.rank, points: awayRow.points } : null,
  };

  return selectedFixture.standingsMini;
}

window.loadStandingsMini = loadStandingsMini;

window.loadStandings = loadStandings;
