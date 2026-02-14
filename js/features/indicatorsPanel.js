// js/features/indicatorsPanel.js

function setIndicators(html) {
  const el = document.getElementById("indicatorsPanel");
  if (el) el.innerHTML = html;
}

// bus dati
window.__IND__ = window.__IND__ || {
  teams: null,
  corners: null,
  shots: null,
  referee: null,
  fouls: null, // <-- NUOVO
};

/* =========================
   BOOKMAKER STYLE (hit-rate)
   ========================= */
const __BET_CACHE__ = new Map();
 // key fixtureId -> computed betting object

 let __BET_GOALS_LINE__ = 2.5; // default
window.setBetGoalsLine = function (v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return;
  __BET_GOALS_LINE__ = n;

  const key = fxKey();
  const B = __BET_CACHE__.get(key);
  if (!B || !B.__homeMeta || !B.__awayMeta) return;

  const el = document.getElementById("bettingBox");
  if (!el) return;

  el.innerHTML = renderBettingHTML(B, B.__homeMeta, B.__awayMeta, __BET_GOALS_LINE__);
};
function fxKey() {
  const fx = typeof selectedFixture !== "undefined" ? selectedFixture : null;
  return fx?.id ? String(fx.id) : "";
}

function pctHit(hit, total) {
  if (!total) return 0;
  return Math.round((hit / total) * 100);
}

function safeN() {
  // per performance: per betting usiamo max 10 anche se scegli 15
  const n = typeof getLimitForTeams === "function" ? getLimitForTeams() : 10;
  return Math.min(Math.max(5, n), 10);
}

function goalsTotalFromFixtureRow(fx) {
  const gh = Number(fx?.goals?.home);
  const ga = Number(fx?.goals?.away);
  if (!Number.isFinite(gh) || !Number.isFinite(ga)) return null;
  return gh + ga;
}

function bttsFromFixtureRow(fx) {
  const gh = Number(fx?.goals?.home);
  const ga = Number(fx?.goals?.away);
  if (!Number.isFinite(gh) || !Number.isFinite(ga)) return null;
  return gh > 0 && ga > 0;
}

async function countCardsForFixture(fixtureId) {
  const ev = await getFixtureEventsCached(fixtureId);
  // API-Football: type "Card" per gialli/rossi
  return (ev || []).filter(
    (e) => String(e?.type || "").toLowerCase() === "card",
  ).length;
}

async function countTeamCardsForFixture(fixtureId, teamId) {
  const ev = await getFixtureEventsCached(fixtureId);
  return (ev || []).filter(
    (e) =>
      String(e?.type || "").toLowerCase() === "card" &&
      Number(e?.team?.id) === Number(teamId),
  ).length;
}

async function computeBettingForTeam(teamId, n, lines) {
  const last = await fetchTeamLastFixtures(teamId, n);
  const sample = [];

  for (const fx of last) {
    const fid = fx?.fixture?.id;
    const hId = fx?.teams?.home?.id;
    const aId = fx?.teams?.away?.id;
    if (!fid || !hId || !aId) continue;

    const gTot = goalsTotalFromFixtureRow(fx);
    const btts = bttsFromFixtureRow(fx);

    // corners e cards richiedono chiamate per fixture
    const cornersMap = await getCornersForFixtureTeams(fid, hId, aId);
    const cHome = Number(cornersMap.get(hId) || 0);
    const cAway = Number(cornersMap.get(aId) || 0);
    const cTot = cHome + cAway;

    const cardsTot = await countCardsForFixture(fid);

    // per-squadra (della squadra "teamId" in analisi)
    const isHome = Number(teamId) === Number(hId);
    const teamCorners = isHome ? cHome : cAway;
    const teamCards = await countTeamCardsForFixture(fid, teamId);

    sample.push({
      goalsTotal: gTot,
      btts: btts,

      cornersTotal: Number.isFinite(cTot) ? cTot : null,
      cardsTotal: Number.isFinite(cardsTot) ? cardsTot : null,

      teamCorners: Number.isFinite(teamCorners) ? teamCorners : null,
      teamCards: Number.isFinite(teamCards) ? teamCards : null,
    });
  }

  // calcoli hit-rate
  const validGoals = sample.filter((x) => x.goalsTotal != null);
  const validBTTS = sample.filter((x) => x.btts != null);
  const validCorners = sample.filter((x) => x.cornersTotal != null);
  const validCards = sample.filter((x) => x.cardsTotal != null);

  const validTeamCorners = sample.filter((x) => x.teamCorners != null);
  const validTeamCards = sample.filter((x) => x.teamCards != null);

  const over25Hit = validGoals.filter((x) => x.goalsTotal > 2.5).length;
  const bttsYesHit = validBTTS.filter((x) => x.btts === true).length;

  const overCornersHit = validCorners.filter(
    (x) => x.cornersTotal > lines.corners,
  ).length;
  const overCardsHit = validCards.filter(
    (x) => x.cardsTotal > lines.cards,
  ).length;

  const overTeamCornersHit = validTeamCorners.filter(
    (x) => x.teamCorners > lines.teamCorners,
  ).length;
  const overTeamCardsHit = validTeamCards.filter(
    (x) => x.teamCards > lines.teamCards,
  ).length;

  return {
    nRequested: n,
    goalsTotals: validGoals.map(x => x.goalsTotal),

    over25: { hit: over25Hit, total: validGoals.length },
    bttsYes: { hit: bttsYesHit, total: validBTTS.length },
    

    overCorners: { hit: overCornersHit, total: validCorners.length, line: lines.corners },
    overCards: { hit: overCardsHit, total: validCards.length, line: lines.cards },

    teamOverCorners: { hit: overTeamCornersHit, total: validTeamCorners.length, line: lines.teamCorners },
    teamOverCards: { hit: overTeamCardsHit, total: validTeamCards.length, line: lines.teamCards },
  };
}

function renderBetRow(title, homeMeta, awayMeta, home, away) {
  const hPct = home?.total ? pctHit(home.hit, home.total) : null;
  const aPct = away?.total ? pctHit(away.hit, away.total) : null;

  const mPct =
    home?.total && away?.total
      ? Math.round((pctHit(home.hit, home.total) + pctHit(away.hit, away.total)) / 2)
      : null;

  const hTxt = hPct == null ? "—" : `${hPct}%`;
  const aTxt = aPct == null ? "—" : `${aPct}%`;
  const mTxt = mPct == null ? "—" : `${mPct}%`;

  return `
    <div class="bet-row2">
      <div class="bet-market">${title}</div>

      <div class="bet-cell">
        ${homeMeta?.logo ? `<img class="bet-logo" src="${safeHTML(homeMeta.logo)}" alt="logo" />` : ""}
        <div class="bet-num">
          <div class="bet-pct">${safeHTML(hTxt)}</div>
          <div class="bet-frac">${safeHTML(home?.hit ?? "—")}/${safeHTML(home?.total ?? "—")}</div>
        </div>
      </div>

      <div class="bet-cell">
        ${awayMeta?.logo ? `<img class="bet-logo" src="${safeHTML(awayMeta.logo)}" alt="logo" />` : ""}
        <div class="bet-num">
          <div class="bet-pct">${safeHTML(aTxt)}</div>
          <div class="bet-frac">${safeHTML(away?.hit ?? "—")}/${safeHTML(away?.total ?? "—")}</div>
        </div>
      </div>

      <div class="bet-cell bet-avg">
        <div class="bet-num">
          <div class="bet-pct">${safeHTML(mTxt)}</div>
          <div class="bet-frac">—</div>
        </div>
      </div>
    </div>
  `;
}

function renderTeamDetailRow(title, homeMeta, awayMeta, homeObj, awayObj) {
  // Row "team" (non ha senso la media: possiamo lasciarla vuota o tenere % media)
  const hPct = homeObj?.total ? pctHit(homeObj.hit, homeObj.total) : null;
  const aPct = awayObj?.total ? pctHit(awayObj.hit, awayObj.total) : null;

  const mPct =
    homeObj?.total && awayObj?.total
      ? Math.round((pctHit(homeObj.hit, homeObj.total) + pctHit(awayObj.hit, awayObj.total)) / 2)
      : null;

  const hTxt = hPct == null ? "—" : `${hPct}%`;
  const aTxt = aPct == null ? "—" : `${aPct}%`;
  const mTxt = mPct == null ? "—" : `${mPct}%`;

  return `
    <div class="bet-row2">
      <div class="bet-market">${safeHTML(title)}</div>

      <div class="bet-cell">
        ${homeMeta?.logo ? `<img class="bet-logo" src="${safeHTML(homeMeta.logo)}" alt="logo" />` : ""}
        <div class="bet-num">
          <div class="bet-pct">${safeHTML(hTxt)}</div>
          <div class="bet-frac">${safeHTML(homeObj?.hit ?? "—")}/${safeHTML(homeObj?.total ?? "—")}</div>
        </div>
      </div>

      <div class="bet-cell">
        ${awayMeta?.logo ? `<img class="bet-logo" src="${safeHTML(awayMeta.logo)}" alt="logo" />` : ""}
        <div class="bet-num">
          <div class="bet-pct">${safeHTML(aTxt)}</div>
          <div class="bet-frac">${safeHTML(awayObj?.hit ?? "—")}/${safeHTML(awayObj?.total ?? "—")}</div>
        </div>
      </div>

      <div class="bet-cell bet-avg">
        <div class="bet-num">
          <div class="bet-pct">${safeHTML(mTxt)}</div>
          <div class="bet-frac">—</div>
        </div>
      </div>
    </div>
  `;
}

async function ensureBettingComputed(homeId, awayId) {
  const key = fxKey();
  if (!key) return null;
  if (__BET_CACHE__.has(key)) return __BET_CACHE__.get(key);

  const n = safeN();

  // linee base bookmaker
  const lines = {
    corners: 8.5,
    cards: 4.5,
    teamCorners: 4.5,
    teamCards: 1.5,
  };

  const [homeB, awayB] = await Promise.all([
    computeBettingForTeam(homeId, n, lines),
    computeBettingForTeam(awayId, n, lines),
  ]);

  const out = { n, homeB, awayB, lines };
  __BET_CACHE__.set(key, out);
  return out;
}
function overFromTotals(totals, line) {
  const arr = Array.isArray(totals) ? totals : [];
  const l = Number(line);
  const valid = arr.filter(n => Number.isFinite(Number(n)));
  const hit = valid.filter(n => Number(n) > l).length;
  return { hit, total: valid.length };
}

function renderGoalsLineSelect(line) {
  const cur = Number(line);
  const opts = [0.5, 1.5, 2.5].map(x =>
    `<option value="${x}" ${x === cur ? "selected" : ""}>${x}</option>`
  ).join("");

  // onchange chiama window.setBetGoalsLine(...)
  return `<select class="bet-select" onchange="setBetGoalsLine(this.value)">${opts}</select>`;
}

/* =========================
   HELPERS (già tuoi)
   ========================= */
function clamp(n, a, b) {
  const x = Number(n) || 0;
  return Math.max(a, Math.min(b, x));
}

function mean(a, b) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  return (x + y) / 2;
}

// scala lineare -> 0..100 (indice interno)
function scoreLinear(value, minV, maxV) {
  const v = Number(value) || 0;
  if (maxV <= minV) return 0;
  const t = (v - minV) / (maxV - minV);
  return Math.round(clamp(t, 0, 1) * 100);
}

function fmt2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : "—";
}

function scoreClass(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "score-neutral";
  if (s >= 67) return "score-high";
  if (s >= 45) return "score-mid";
  return "score-low";
}
function renderBettingHTML(B, homeMeta, awayMeta, goalsLine) {
  const hb = B.homeB;
  const ab = B.awayB;

  const overGoalsHome = overFromTotals(hb.goalsTotals, goalsLine);
  const overGoalsAway = overFromTotals(ab.goalsTotals, goalsLine);

  const overGoalsTitle = `Over ${renderGoalsLineSelect(goalsLine)} Gol`;

  const key = fxKey();
  const detailsId = `betDetails_${safeHTML(key)}`;

  return `
    <div class="bet-box">
      <div class="bet-head2">
        <strong>Bookmaker</strong>
        <span class="muted">Hit rate ultime ${safeHTML(B.n)}</span>
      </div>

      ${renderBetRow(overGoalsTitle, homeMeta, awayMeta, overGoalsHome, overGoalsAway)}
      ${renderBetRow("GG (BTTS Sì)", homeMeta, awayMeta, hb.bttsYes, ab.bttsYes)}
      ${renderBetRow(`Over ${hb.overCorners.line} Corner`, homeMeta, awayMeta, hb.overCorners, ab.overCorners)}
      ${renderBetRow(`Over ${hb.overCards.line} Cartellini`, homeMeta, awayMeta, hb.overCards, ab.overCards)}

      <details class="bet-details" id="${detailsId}">
        <summary class="bet-summary">Dettaglio per squadra</summary>
        ${renderTeamDetailRow(`Team Over ${hb.teamOverCorners.line} Corner`, homeMeta, awayMeta, hb.teamOverCorners, ab.teamOverCorners)}
        ${renderTeamDetailRow(`Team Over ${hb.teamOverCards.line} Cartellini`, homeMeta, awayMeta, hb.teamOverCards, ab.teamOverCards)}
      </details>
    </div>
  `;
}

// etichette “bookmaker style”
function pickLabel(type, ctx) {
  if (type === "g1t") {
    const v = Number(ctx.goal1T);
    if (!Number.isFinite(v)) return "Gol 1T —";
    if (v >= 65) return "Gol 1T: Alto";
    if (v >= 50) return "Gol 1T: Medio";
    return "Gol 1T: Basso";
  }

  if (type === "g2t") {
    const v = Number(ctx.goal2T);
    if (!Number.isFinite(v)) return "Gol 2T —";
    if (v >= 65) return "Gol 2T: Alto";
    if (v >= 50) return "Gol 2T: Medio";
    return "Gol 2T: Basso";
  }

  if (type === "corners") {
    const tot = Number(ctx.cornersExpected);
    if (!Number.isFinite(tot)) return "Corner —";
    if (tot >= 11.5) return "Corner: Over 10.5";
    if (tot >= 9.5) return "Corner: Over 8.5";
    return "Corner: Under 10.5";
  }

  if (type === "shots") {
    const tot = Number(ctx.shotsExpected);
    if (!Number.isFinite(tot)) return "Tiri —";
    if (tot >= 28) return "Tiri: Alto volume";
    if (tot >= 22) return "Tiri: Medio volume";
    return "Tiri: Basso volume";
  }

  if (type === "cards") {
    const tot = Number(ctx.cardsExpected);
    if (!Number.isFinite(tot)) return "Cartellini —";
    if (tot >= 5.5) return "Cartellini: Over 4.5";
    if (tot >= 4.5) return "Cartellini: Over 3.5";
    return "Cartellini: Under 4.5";
  }

  if (type === "fouls") {
    const tot = Number(ctx.foulsExpected);
    if (!Number.isFinite(tot)) return "Falli —";
    if (tot >= 27.5) return "Falli: Over 26.5";
    if (tot >= 24.5) return "Falli: Over 23.5";
    return "Falli: Under 26.5";
  }

  return "—";
}

function teamChip(team) {
  const logo = team?.logo || "";
  const name = team?.name || "—";
  return `
    <span class="teamline" style="gap:8px;">
      ${logo ? `<img class="logo" src="${safeHTML(logo)}" alt="logo" />` : ""}
      <strong>${safeHTML(name)}</strong>
    </span>
  `;
}

function tile(opts) {
  const {
    icon,
    title,
    score, // indice 0..100
    label, // bookmaker style
    sub, // numeri attesi
    homeTeam,
    awayTeam,
    homeVal,
    awayVal,
  } = opts;

  const cls = scoreClass(score);

  return `
    <div class="ind-tile">
      <div class="ind-head">
        <div class="ind-title">
          <span class="ind-ico">${safeHTML(icon)}</span>
          <span>${safeHTML(title)}</span>
        </div>
        <span class="ind-score ${cls}">${score == null ? "—" : `${safeHTML(score)}%`}</span>
      </div>

      <div class="ind-label">${safeHTML(label || "—")}</div>
      ${sub ? `<div class="ind-sub">${sub}</div>` : ""}

      <div class="ind-lines">
        <div class="ind-line">
          ${teamChip(homeTeam)}
          <span class="pill">${homeVal || "—"}</span>
        </div>
        <div class="ind-line">
          ${teamChip(awayTeam)}
          <span class="pill">${awayVal || "—"}</span>
        </div>
      </div>
    </div>
  `;
}

function publishIndicatorData(key, payload) {
  window.__IND__[key] = payload;
  renderIndicators();
}

/* =========================
   MAIN RENDER
   ========================= */
function renderIndicators() {
  const I = window.__IND__ || {};
  const teams = I.teams;
  const corners = I.corners;
  const shots = I.shots;
  const ref = I.referee;
  const fouls = I.fouls;

  // meta match
  const fx = typeof selectedFixture !== "undefined" ? selectedFixture : null;
  const homeMeta = fx?.home || { name: "Casa", logo: "" };
  const awayMeta = fx?.away || { name: "Trasferta", logo: "" };

  if (!teams && !corners && !shots && !ref && !fouls) {
    setIndicators(`<p class="muted"><em>Gli indicatori verranno mostrati dopo aver selezionato un match.</em></p>`);
    return;
  }

  const h = teams?.home || null;
  const a = teams?.away || null;

  // --- GOL MATCH (attesi)
  let goalsHome = null, goalsAway = null, goalsExpected = null;
  if (h && a) {
    goalsHome = mean(h.avgGF, a.avgGA);
    goalsAway = mean(a.avgGF, h.avgGA);
    goalsExpected = goalsHome + goalsAway;
  }

  function goalsBettingLine(x) {
    const v = Number(x);
    if (!Number.isFinite(v)) return "Gol: —";
    if (v >= 2.7) return "Gol: Over 2.5";
    if (v <= 2.3) return "Gol: Under 2.5";
    return "Gol: Borderline 2.5";
  }

  // --- GOL 1T/2T (indice)
  let goal1T = null, goal2T = null, home1T = null, away1T = null, home2T = null, away2T = null;
  if (h && a) {
    home1T = mean(h.gf1Pct, a.ga1Pct);
    away1T = mean(a.gf1Pct, h.ga1Pct);
    goal1T = mean(home1T, away1T);

    home2T = mean(h.gf2Pct, a.ga2Pct);
    away2T = mean(a.gf2Pct, h.ga2Pct);
    goal2T = mean(home2T, away2T);
  }

  // --- CORNER attesi
  let cornersExpected = null, cornersScore = null, cornersHome = null, cornersAway = null;
  if (corners?.home && corners?.away) {
    cornersHome = mean(corners.home.avgCorners, corners.away.avgCornersAgainst);
    cornersAway = mean(corners.away.avgCorners, corners.home.avgCornersAgainst);
    cornersExpected = cornersHome + cornersAway;
    cornersScore = scoreLinear(cornersExpected, 6, 14);
  }

  // --- TIRI attesi
  let shotsExpected = null, shotsScore = null, shotsHome = null, shotsAway = null, otExpected = null, otHome = null, otAway = null;
  if (shots?.home && shots?.away) {
    shotsHome = mean(shots.home.avgShotsFor, shots.away.avgShotsAgainst);
    shotsAway = mean(shots.away.avgShotsFor, shots.home.avgShotsAgainst);
    shotsExpected = shotsHome + shotsAway;
    shotsScore = scoreLinear(shotsExpected, 16, 32);

    otHome = mean(shots.home.avgOnTargetFor, shots.away.avgOnTargetAgainst);
    otAway = mean(shots.away.avgOnTargetFor, shots.home.avgOnTargetAgainst);
    otExpected = otHome + otAway;
  }

  // --- CARTELLINI attesi
  let cardsExpected = null, cardsScore = null;
  if (h && a) {
    const teamsCards = Number(h.avgCards) + Number(a.avgCards) || 0;
    cardsExpected = ref?.avgCards != null ? mean(teamsCards, Number(ref.avgCards)) : teamsCards;
    cardsScore = scoreLinear(cardsExpected, 2, 7);
  }

  // --- FALLI attesi
  let foulsExpected = null, foulsScore = null, foulsHome = null, foulsAway = null;
  if (fouls?.home && fouls?.away) {
    foulsHome = mean(fouls.home.avgFoulsFor, fouls.away.avgFoulsAgainst);
    foulsAway = mean(fouls.away.avgFoulsFor, fouls.home.avgFoulsAgainst);
    foulsExpected = foulsHome + foulsAway;
    foulsScore = scoreLinear(foulsExpected, 16, 32);
  }

  const ctx = { goal1T, goal2T, cornersExpected, shotsExpected, cardsExpected, foulsExpected };

  // Sezione bookmaker
  const homeId = homeMeta?.id || fx?.home?.id || null;
  const awayId = awayMeta?.id || fx?.away?.id || null;

  let bettingHTML = `<p class="muted"><em>Calcolo giocate bookmaker (ultime partite)...</em></p>`;

  if (homeId && awayId) {
    const key = fxKey();
    ensureBettingComputed(homeId, awayId)
      .then((B) => {
        if (!B) return;
        const hb = B.homeB;
        const ab = B.awayB;

        const detailsId = `betDetails_${safeHTML(key)}`;

        // salviamo meta dentro B così il dropdown può rerenderizzare da solo
B.__homeMeta = homeMeta;
B.__awayMeta = awayMeta;

const html = renderBettingHTML(B, homeMeta, awayMeta, __BET_GOALS_LINE__);

const el = document.getElementById("bettingBox");
if (el) el.innerHTML = html;
      })
      .catch((e) => console.error("ensureBettingComputed", e));
  }

  const summary = `<div id="bettingBox">${bettingHTML}</div>`;

  setIndicators(`
    ${summary}
    <div class="ind-grid">
      ${tile({
        icon: "⚽",
        title: "Gol 1° tempo",
        score: goal1T == null ? null : Math.round(goal1T),
        label: pickLabel("g1t", ctx),
        sub: goal1T == null ? "" : `Indice match: <strong>${Math.round(goal1T)}/100</strong>`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: home1T == null ? "—" : `${Math.round(home1T)}/100`,
        awayVal: away1T == null ? "—" : `${Math.round(away1T)}/100`,
      })}

      ${tile({
        icon: "⏱️",
        title: "Gol 2° tempo",
        score: goal2T == null ? null : Math.round(goal2T),
        label: pickLabel("g2t", ctx),
        sub: goal2T == null ? "" : `Indice match: <strong>${Math.round(goal2T)}/100</strong>`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: home2T == null ? "—" : `${Math.round(home2T)}/100`,
        awayVal: away2T == null ? "—" : `${Math.round(away2T)}/100`,
      })}

      ${tile({
        icon: "🚩",
        title: "Corner",
        score: cornersScore == null ? null : cornersScore,
        label: pickLabel("corners", ctx),
        sub: cornersExpected == null ? "" : `Tot attesi: <strong>${fmt2(cornersExpected)}</strong>`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: cornersHome == null ? "—" : `${fmt2(cornersHome)} attesi`,
        awayVal: cornersAway == null ? "—" : `${fmt2(cornersAway)} attesi`,
      })}

      ${tile({
        icon: "🎯",
        title: "Tiri",
        score: shotsScore == null ? null : shotsScore,
        label: pickLabel("shots", ctx),
        sub: shotsExpected == null ? "" : `Tot attesi: <strong>${fmt2(shotsExpected)}</strong> · In porta attesi: <strong>${fmt2(otExpected)}</strong>`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: shotsHome == null ? "—" : `${fmt2(shotsHome)} (OT ${fmt2(otHome)})`,
        awayVal: shotsAway == null ? "—" : `${fmt2(shotsAway)} (OT ${fmt2(otAway)})`,
      })}

      ${tile({
        icon: "🟨",
        title: "Cartellini",
        score: cardsScore == null ? null : cardsScore,
        label: pickLabel("cards", ctx),
        sub: cardsExpected == null ? "" : `Attesi: <strong>${fmt2(cardsExpected)}</strong>${ref?.avgCards == null ? "" : ` · Arbitro: <strong>${fmt2(ref.avgCards)}</strong>`}`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: h ? `Media ${fmt2(h.avgCards)}` : "—",
        awayVal: a ? `Media ${fmt2(a.avgCards)}` : "—",
      })}

      ${tile({
        icon: "🦵",
        title: "Falli",
        score: foulsScore == null ? null : foulsScore,
        label: pickLabel("fouls", ctx),
        sub: foulsExpected == null ? "" : `Tot attesi: <strong>${fmt2(foulsExpected)}</strong>`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: foulsHome == null ? "—" : `${fmt2(foulsHome)} attesi`,
        awayVal: foulsAway == null ? "—" : `${fmt2(foulsAway)} attesi`,
      })}
    </div>
  `);
}

// export
window.publishIndicatorData = publishIndicatorData;
