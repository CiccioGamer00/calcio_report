// js/features/teamFlow.js

// Cache suggerimenti
const __SUGGEST_CACHE__ = new Map(); // key: query -> {ts, items}
let __SUGGEST_DEBOUNCE__ = null;

function setMatch(html) {
  document.getElementById("match").innerHTML = html;
}

function setReferee(html) {
  document.getElementById("referee").innerHTML = html;
}

function setTeams(html) {
  const el = document.getElementById("teamsPanel");
  if (el) el.innerHTML = html;
}

function setCorners(html) {
  const el = document.getElementById("cornersPanel");
  if (el) el.innerHTML = html;
}
function setShots(html) {
  const el = document.getElementById("shotsPanel");
  if (el) el.innerHTML = html;
}

/* =========================
   SUGGERIMENTI (datalist)
   ========================= */
async function fetchTeamSuggestions(q) {
  const dl = document.getElementById("teamSuggestions");
  if (!dl) return;

  dl.innerHTML = "";

  const queryRaw = String(q || "").trim();
  if (queryRaw.length < 2) return;

  const query = sanitizeSearch(queryRaw);
  if (query.length < 2) return;

  const now = Date.now();
  const cached = __SUGGEST_CACHE__.get(query);
  if (cached && now - cached.ts < 60_000) {
    renderDatalistFromTeams(cached.items);
    return;
  }

  const r = await apiGet(`/teams?search=${encodeURIComponent(query)}`);
  if (!r.ok || r.errors) return;

  const items = (r.arr || [])
    .slice(0, 12)
    .map((x) => ({
      id: x?.team?.id ?? null,
      name: x?.team?.name ?? "",
      country: x?.team?.country ?? "",
      logo: x?.team?.logo ?? "",
    }))
    .filter((x) => x.id && x.name);

  __SUGGEST_CACHE__.set(query, { ts: now, items });
  renderDatalistFromTeams(items);
}

function renderDatalistFromTeams(items) {
  const dl = document.getElementById("teamSuggestions");
  if (!dl) return;

  dl.innerHTML = (items || [])
    .map((t) => {
      const value = t.name;
      const label = t.country ? `${t.name} (${t.country})` : t.name;
      return `<option value="${safeHTML(value)}" label="${safeHTML(label)}"></option>`;
    })
    .join("");
}

/* =========================
   CERCA SQUADRA (NO DOPPIA LISTA)
   ========================= */
async function showTeam() {
  const inputEl = document.getElementById("teamInput");
  const raw = (inputEl?.value || "").trim();
  const teamName = sanitizeSearch(raw);

  selectedTeam = null;
  selectedFixture = null;

  if (teamName === "") {
    setMatch(`<p class="muted"><em>Inserisci il nome di una squadra.</em></p>`);
    setReferee(`<p class="muted"><em>—</em></p>`);
    setTeams(`<p class="muted"><em>—</em></p>`);
    setCorners(`<p class="muted"><em>—</em></p>`);
	setShots(`<p class="muted"><em>—</em></p>`);
    return;
  }

  setMatch(`<p class="muted"><em>Sto cercando la squadra...</em></p>`);
  setReferee(`<p class="muted"><em>—</em></p>`);
  setTeams(`<p class="muted"><em>—</em></p>`);
  setCorners(`<p class="muted"><em>—</em></p>`);
  setShots(`<p class="muted"><em>—</em></p>`);

  const r = await apiGet(`/teams?search=${encodeURIComponent(teamName)}`);
  if (!r.ok) {
    setMatch(`<p class="bad"><em>Errore API (teams): HTTP ${r.status}</em></p>`);
    return;
  }
  if (r.errors) {
    setMatch(
      `<p class="bad"><em>Errore API (teams): ${safeHTML(JSON.stringify(r.errors))}</em></p>`,
    );
    return;
  }

  const results = r.arr || [];
  if (results.length === 0) {
    setMatch(
      `<p class="muted"><em>Nessuna squadra trovata per: ${safeHTML(teamName)}</em></p>`,
    );
    return;
  }

  const exact = results.find(
    (x) => String(x?.team?.name || "").toLowerCase() === teamName.toLowerCase(),
  );

  if (exact) {
    setTeamFromResult(exact);
    await loadNextMatch();
    return;
  }
  if (results.length === 1) {
    setTeamFromResult(results[0]);
    await loadNextMatch();
    return;
  }

  const top = results.slice(0, 8);
  window.__TEAM_RESULTS__ = top;

  const itemsHtml = top
    .map((res, index) => {
      const t = res.team || {};
      const name = t.name ?? "—";
      const country = t.country ?? "—";
      const logo = t.logo ?? "";

      return `
        <li>
          <button class="btn" style="width:100%; text-align:left;" onclick="selectTeam(${index})">
            <span class="teamline">
              ${logo ? `<img class="logo" src="${safeHTML(logo)}" alt="logo" />` : ""}
              <strong>${safeHTML(name)}</strong>
              <span class="pill">${safeHTML(country)}</span>
            </span>
          </button>
        </li>
      `;
    })
    .join("");

  setMatch(`
    <p class="muted"><em>Ho trovato più squadre simili. Seleziona quella giusta:</em></p>
    <ul style="list-style:none; padding-left:0; margin-top:12px; display:grid; gap:10px;">
      ${itemsHtml}
    </ul>
  `);
}

function setTeamFromResult(res) {
  const t = res.team || {};
  selectedTeam = {
    id: t.id,
    name: t.name,
    country: t.country,
    logo: t.logo || "",
  };
}

function selectTeam(index) {
  const res = window.__TEAM_RESULTS__?.[index];
  if (!res) return;

  setTeamFromResult(res);
  loadNextMatch();
}

/* =========================
   PROSSIMO MATCH
   ========================= */
async function loadNextMatch() {
  if (!selectedTeam?.id) return;

  setMatch(`<p class="muted"><em>Recupero prossimo match...</em></p>`);
  setReferee(`<p class="muted"><em>—</em></p>`);
  setTeams(`<p class="muted"><em>—</em></p>`);
  setCorners(`<p class="muted"><em>—</em></p>`);
  setShots(`<p class="muted"><em>—</em></p>`);

  const next = await apiGet(
    `/fixtures?team=${selectedTeam.id}&next=1&timezone=Europe/Rome`,
  );

  if (!next.ok) {
    setMatch(
      `<p class="bad"><em>Errore API (fixtures next): HTTP ${next.status}</em></p>`,
    );
    return;
  }
  if (next.errors) {
    setMatch(
      `<p class="bad"><em>Errore API (fixtures next): ${safeHTML(JSON.stringify(next.errors))}</em></p>`,
    );
    return;
  }

  if (!next.arr || next.arr.length === 0) {
    const last = await apiGet(
      `/fixtures?team=${selectedTeam.id}&last=1&timezone=Europe/Rome`,
    );
    if (last.ok && !last.errors && last.arr.length > 0) {
      renderLast(last.arr[0]);
      return;
    }
    setMatch(
      `<p class="muted"><em>Nessun match trovato (né futuro né passato recente).</em></p>`,
    );
    return;
  }

  const f = next.arr[0];
  selectedFixture = {
    id: f.fixture?.id ?? null,
    date: f.fixture?.date ?? null,
    leagueId: f.league?.id ?? null,
    leagueName: f.league?.name ?? null,
    referee: null,
    home: {
      id: f.teams?.home?.id ?? null,
      name: f.teams?.home?.name ?? "—",
      logo: f.teams?.home?.logo ?? "",
    },
    away: {
      id: f.teams?.away?.id ?? null,
      name: f.teams?.away?.name ?? "—",
      logo: f.teams?.away?.logo ?? "",
    },
  };

  renderNext(f);

  // Queste funzioni vivranno in panels.js (le lasciamo chiamate uguali)
  await loadTeamsForm();
  await loadFixtureDetails();
  await loadTeamsCorners();
  await loadTeamsShots();
  await loadInjuries();
}

function renderNext(f) {
  const date = f.fixture?.date ? new Date(f.fixture.date).toLocaleString("it-IT") : "—";
  const league = f.league?.name ?? "—";
  const round = f.league?.round ?? "";
  const home = f.teams?.home?.name ?? "—";
  const away = f.teams?.away?.name ?? "—";
  const homeLogo = f.teams?.home?.logo ?? "";
  const awayLogo = f.teams?.away?.logo ?? "";
  const isHome = f.teams?.home?.id === selectedTeam.id;

  setMatch(`
    <div class="kv">
      <div class="kv-row">
        <div class="k">Squadra</div>
        <div class="v">
          <span class="teamline">
            ${selectedTeam.logo ? `<img class="logo" src="${safeHTML(selectedTeam.logo)}" alt="logo" />` : ""}
            <strong>${safeHTML(selectedTeam.name)}</strong>
            <span class="pill">${safeHTML(selectedTeam.country || "")}</span>
          </span>
        </div>
      </div>

      <div class="kv-row">
        <div class="k">Data</div>
        <div class="v">${safeHTML(date)}</div>
      </div>

      <div class="kv-row">
        <div class="k">Competizione</div>
        <div class="v">${safeHTML(league)} ${round ? `<span class="pill">${safeHTML(round)}</span>` : ""}</div>
      </div>

      <div class="kv-row">
        <div class="k">Casa / Trasferta</div>
        <div class="v">
          <span class="teamline">
            ${isHome ? `<span class="pill">CASA</span>` : `<span class="pill">TRASFERTA</span>`}
            ${homeLogo ? `<img class="logo" src="${safeHTML(homeLogo)}" alt="home" />` : ""}
            <strong>${safeHTML(home)}</strong>
            <span class="muted">vs</span>
            ${awayLogo ? `<img class="logo" src="${safeHTML(awayLogo)}" alt="away" />` : ""}
            <strong>${safeHTML(away)}</strong>
          </span>
        </div>
      </div>
    </div>
  `);
}

function renderLast(f) {
  const date = f.fixture?.date ? new Date(f.fixture.date).toLocaleString("it-IT") : "—";
  const league = f.league?.name ?? "—";
  const home = f.teams?.home?.name ?? "—";
  const away = f.teams?.away?.name ?? "—";
  const goalsHome = f.goals?.home ?? "—";
  const goalsAway = f.goals?.away ?? "—";

  setMatch(`
    <p class="muted"><em>Nessun match futuro disponibile. Ultimo match giocato:</em></p>
    <div class="kv">
      <div class="kv-row"><div class="k">Data</div><div class="v">${safeHTML(date)}</div></div>
      <div class="kv-row"><div class="k">Competizione</div><div class="v">${safeHTML(league)}</div></div>
      <div class="kv-row"><div class="k">Risultato</div><div class="v"><strong>${safeHTML(home)}</strong> ${safeHTML(goalsHome)} - ${safeHTML(goalsAway)} <strong>${safeHTML(away)}</strong></div></div>
    </div>
  `);

  setReferee(
    `<p class="muted"><em>Arbitro/storico non disponibile per match passato in questa vista.</em></p>`,
  );
}

/* =========================
   EVENTI UI (solo teamInput)
   ========================= */
document.getElementById("teamInput")?.addEventListener("input", () => {
  const q = document.getElementById("teamInput").value;
  clearTimeout(__SUGGEST_DEBOUNCE__);
  __SUGGEST_DEBOUNCE__ = setTimeout(() => fetchTeamSuggestions(q), 260);
});

// Quando scegli un suggerimento (datalist), parte subito la ricerca
document.getElementById("teamInput")?.addEventListener("change", () => {
  // evita di sparare richieste mentre stai ancora digitando:
  // "change" scatta quando selezioni un suggerimento o esci dal campo
  showTeam();
});