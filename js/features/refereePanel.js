// js/features/refereePanel.js

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
  const now = new Date().toLocaleString("it-IT");
  setReferee(`
    <p class="muted"><em>Arbitro non ancora assegnato (ultima verifica: ${safeHTML(now)}).</em></p>
    <p style="margin-top:10px;">
      <button type="button" class="btn" id="btnRefRetry">Riprova ora</button>
    </p>
  `);
  const btn = document.getElementById("btnRefRetry");
  if (btn) btn.onclick = () => loadFixtureDetails();
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
     try {
  if (window.publishIndicatorData) {
    window.publishIndicatorData("referee", { avgCards: Number(avgTotal) });
  }
} catch (e) {
  console.error("publish indicators referee", e);
}

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

