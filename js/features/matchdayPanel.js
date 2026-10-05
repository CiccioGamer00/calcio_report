// js/features/matchdayPanel.js
// Giornata: scegli un campionato, mostra il turno corrente/prossimo e apri
// direttamente una fixture nell'analisi esistente.

(() => {
  const LEAGUES = Object.freeze([
    { id: 135, name: "Serie A", country: "Italia" },
    { id: 39, name: "Premier League", country: "Inghilterra" },
    { id: 140, name: "La Liga", country: "Spagna" },
    { id: 78, name: "Bundesliga", country: "Germania" },
    { id: 61, name: "Ligue 1", country: "Francia" },
  ]);

  const POINTER_TTL_MS = 2 * 60 * 60 * 1000;
  const FIXED_CACHE_PREFIX = "CR_MATCHDAY_V1";
  let loadSeq = 0;

  function safe(value) {
    if (typeof window.safeHTML === "function") return window.safeHTML(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function seasonForNow(date = new Date()) {
    const year = date.getFullYear();
    return date.getMonth() >= 6 ? year : year - 1;
  }

  function pointerKey(leagueId, season) {
    return `${FIXED_CACHE_PREFIX}:pointer:${leagueId}:${season}`;
  }

  function roundKey(leagueId, season, round) {
    return `${FIXED_CACHE_PREFIX}:round:${leagueId}:${season}:${round}`;
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function validPointer(value) {
    return Boolean(
      value?.round &&
        Number.isFinite(Number(value?.ts)) &&
        Date.now() - Number(value.ts) < POINTER_TTL_MS,
    );
  }

  function fixtureRow(raw) {
    const id = raw?.fixture?.id ?? null;
    const home = raw?.teams?.home || {};
    const away = raw?.teams?.away || {};
    if (!id || !home?.id || !away?.id) return null;

    return {
      id,
      home: {
        id: home.id,
        name: home.name || "Casa",
        logo: home.logo || "",
      },
      away: {
        id: away.id,
        name: away.name || "Trasferta",
        logo: away.logo || "",
      },
    };
  }

  function renderLeagueOptions() {
    const select = document.getElementById("matchdayLeague");
    if (!select || select.options.length) return;

    select.innerHTML = LEAGUES.map(
      (league) =>
        `<option value="${league.id}">${safe(league.name)} · ${safe(league.country)}</option>`,
    ).join("");
  }

  function setBody(html) {
    const body = document.getElementById("matchdayBody");
    if (body) body.innerHTML = html;
  }

  function renderMatchday({ league, season, round, fixtures }) {
    const body = document.getElementById("matchdayBody");
    if (!body) return;

    const rows = (fixtures || [])
      .map(
        (fixture) => `
          <button class="matchdayRow" type="button" data-fixture-id="${safe(fixture.id)}">
            <span class="matchdayTeam matchdayTeamHome">
              ${fixture.home.logo ? `<img class="matchdayLogo" src="${safe(fixture.home.logo)}" alt="" />` : ""}
              <strong>${safe(fixture.home.name)}</strong>
            </span>
            <span class="matchdayVs">VS</span>
            <span class="matchdayTeam matchdayTeamAway">
              <strong>${safe(fixture.away.name)}</strong>
              ${fixture.away.logo ? `<img class="matchdayLogo" src="${safe(fixture.away.logo)}" alt="" />` : ""}
            </span>
          </button>`,
      )
      .join("");

    body.innerHTML = `
      <div class="matchdayHead">
        <div>
          <div class="matchdayLeagueName">${safe(league.name)}</div>
          <div class="muted">${safe(round)} · stagione ${safe(season)}</div>
        </div>
        <div class="matchdayHint">Clicca una partita per aprire l'analisi</div>
      </div>
      <div class="matchdayList">
        ${rows || '<p class="muted"><em>Nessuna partita disponibile.</em></p>'}
      </div>
    `;
  }

  function explainError(result) {
    switch (result?.kind) {
      case "auth":
        return "Accedi per visualizzare la giornata.";
      case "paywall":
        return "Il periodo di accesso non è attivo.";
      case "rate_limit":
        return "Dati temporaneamente non disponibili: limite API raggiunto.";
      case "network_error":
      case "server_error":
        return "Problema temporaneo nel collegamento ai dati.";
      default:
        return "Non riesco a caricare la giornata selezionata.";
    }
  }

  async function resolveRound(leagueId, season) {
    const key = pointerKey(leagueId, season);
    const cached = readJson(key);
    if (validPointer(cached)) return cached.round;

    const result = await window.apiGetV2(
      `/fixtures/rounds?league=${encodeURIComponent(leagueId)}&season=${encodeURIComponent(season)}&current=true`,
      { retries: 0, cache: true },
    );

    if (result.kind !== "success") return { error: result };

    const round = String(result.arr?.[0] || "").trim();
    if (!round) return { error: { kind: "empty" } };

    writeJson(key, { round, ts: Date.now() });
    return round;
  }

  async function loadFixedRound(league, season, round) {
    const key = roundKey(league.id, season, round);
    const cached = readJson(key);
    if (Array.isArray(cached?.fixtures) && cached.fixtures.length) {
      return cached.fixtures;
    }

    const result = await window.apiGetV2(
      `/fixtures?league=${encodeURIComponent(league.id)}&season=${encodeURIComponent(season)}&round=${encodeURIComponent(round)}&timezone=Europe/Rome`,
      { retries: 0, cache: true },
    );

    if (result.kind !== "success") return { error: result };

    const fixtures = (result.arr || []).map(fixtureRow).filter(Boolean);
    if (!fixtures.length) return { error: { kind: "empty" } };

    // Qui salviamo volutamente solo ciò che non cambia: fixture id e squadre.
    // Data/ora/stadio/arbitro verranno riletti al click sul fixture id.
    writeJson(key, {
      leagueId: league.id,
      season,
      round,
      fixtures,
    });
    return fixtures;
  }

  async function loadSelectedLeague(seq) {
    renderLeagueOptions();

    const select = document.getElementById("matchdayLeague");
    const leagueId = Number(select?.value || LEAGUES[0].id);
    const league = LEAGUES.find((item) => item.id === leagueId) || LEAGUES[0];
    const season = seasonForNow();

    setBody('<p class="muted"><em>Carico la giornata…</em></p>');

    const resolved = await resolveRound(league.id, season);
    if (seq !== loadSeq) return;
    if (typeof resolved !== "string") {
      setBody(`<p class="bad"><em>${safe(explainError(resolved?.error))}</em></p>`);
      return;
    }

    const fixtures = await loadFixedRound(league, season, resolved);
    if (seq !== loadSeq) return;
    if (!Array.isArray(fixtures)) {
      setBody(`<p class="bad"><em>${safe(explainError(fixtures?.error))}</em></p>`);
      return;
    }

    renderMatchday({
      league,
      season,
      round: resolved,
      fixtures,
    });
  }

  async function loadMatchdayPanel() {
    const seq = ++loadSeq;
    return loadSelectedLeague(seq);
  }

  async function openFixture(fixtureId, button) {
    if (!fixtureId || typeof window.selectFixtureDirect !== "function") return;

    const oldText = button?.querySelector?.(".matchdayVs")?.textContent || "VS";
    const vs = button?.querySelector?.(".matchdayVs");
    if (button) button.disabled = true;
    if (vs) vs.textContent = "…";

    try {
      const result = await window.apiGetV2(
        `/fixtures?id=${encodeURIComponent(fixtureId)}&timezone=Europe/Rome`,
        { retries: 0, cache: false },
      );

      if (result.kind !== "success" || !result.arr?.[0]) {
        setBody(
          `<p class="bad"><em>${safe(explainError(result))}</em></p>` +
          '<button id="matchdayRetry" class="btn" type="button">Ricarica giornata</button>',
        );
        document.getElementById("matchdayRetry")?.addEventListener("click", loadMatchdayPanel);
        return;
      }

      const ok = await window.selectFixtureDirect(result.arr[0]);
      if (!ok) return;

      document.querySelector('#panelTabs .tab[data-view="match"]')?.click();
    } finally {
      if (button) button.disabled = false;
      if (vs) vs.textContent = oldText;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderLeagueOptions();

    document.getElementById("matchdayLeague")?.addEventListener("change", () => {
      loadMatchdayPanel().catch((err) => console.error("CR matchday", err));
    });

    document.getElementById("matchdayBody")?.addEventListener("click", (event) => {
      const button = event.target?.closest?.(".matchdayRow");
      if (!button) return;
      const fixtureId = Number(button.getAttribute("data-fixture-id") || 0);
      openFixture(fixtureId, button).catch((err) =>
        console.error("CR matchday fixture", err),
      );
    });
  });

  window.loadMatchdayPanel = loadMatchdayPanel;
})();
