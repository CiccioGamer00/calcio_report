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
    score,       // indice 0..100
    label,       // bookmaker style
    sub,         // numeri attesi
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

function summaryPill(title, line) {
  return `<span class="ind-pill"><strong>${safeHTML(title)}:</strong> ${safeHTML(line)}</span>`;
}

function publishIndicatorData(key, payload) {
  window.__IND__[key] = payload;
  renderIndicators();
}

function renderIndicators() {
  const I = window.__IND__ || {};
  const teams = I.teams;
  const corners = I.corners;
  const shots = I.shots;
  const ref = I.referee;
  const fouls = I.fouls;

  // meta match (logo/nome reali)
  const fx = typeof selectedFixture !== "undefined" ? selectedFixture : null;
  const homeMeta = fx?.home || { name: "Casa", logo: "" };
  const awayMeta = fx?.away || { name: "Trasferta", logo: "" };

  if (!teams && !corners && !shots && !ref && !fouls) {
    setIndicators(`<p class="muted"><em>Gli indicatori verranno mostrati dopo aver selezionato un match.</em></p>`);
    return;
  }

  const h = teams?.home || null;
  const a = teams?.away || null;

    // --- GOL MATCH (attesi) per Under/Over 2.5
  let goalsHome=null, goalsAway=null, goalsExpected=null;

  if (h && a) {
    // Home goals attesi = media(GF home, GA away)
    goalsHome = mean(h.avgGF, a.avgGA);
    // Away goals attesi = media(GF away, GA home)
    goalsAway = mean(a.avgGF, h.avgGA);
    goalsExpected = goalsHome + goalsAway;
  }

  function goalsBettingLine(x) {
    const v = Number(x);
    if (!Number.isFinite(v)) return "Gol: —";
    // linea base bookmaker
    if (v >= 2.7) return "Gol: Over 2.5";
    if (v <= 2.3) return "Gol: Under 2.5";
    return "Gol: Borderline 2.5";
  }

  // --- GOL 1T / 2T (indice 0..100 basato su GF% + GA% avversario)
  let goal1T=null, goal2T=null, home1T=null, away1T=null, home2T=null, away2T=null;
  if (h && a) {
    home1T = mean(h.gf1Pct, a.ga1Pct);
    away1T = mean(a.gf1Pct, h.ga1Pct);
    goal1T = mean(home1T, away1T);

    home2T = mean(h.gf2Pct, a.ga2Pct);
    away2T = mean(a.gf2Pct, h.ga2Pct);
    goal2T = mean(home2T, away2T);
  }

  // --- CORNER (attesi)
  let cornersExpected=null, cornersScore=null, cornersHome=null, cornersAway=null;
  if (corners?.home && corners?.away) {
    cornersHome = mean(corners.home.avgCorners, corners.away.avgCornersAgainst);
    cornersAway = mean(corners.away.avgCorners, corners.home.avgCornersAgainst);
    cornersExpected = cornersHome + cornersAway;
    cornersScore = scoreLinear(cornersExpected, 6, 14);
  }

  // --- TIRI (attesi + in porta attesi)
  let shotsExpected=null, shotsScore=null, shotsHome=null, shotsAway=null, otExpected=null, otHome=null, otAway=null;
  if (shots?.home && shots?.away) {
    shotsHome = mean(shots.home.avgShotsFor, shots.away.avgShotsAgainst);
    shotsAway = mean(shots.away.avgShotsFor, shots.home.avgShotsAgainst);
    shotsExpected = shotsHome + shotsAway;
    shotsScore = scoreLinear(shotsExpected, 16, 32);

    otHome = mean(shots.home.avgOnTargetFor, shots.away.avgOnTargetAgainst);
    otAway = mean(shots.away.avgOnTargetFor, shots.home.avgOnTargetAgainst);
    otExpected = otHome + otAway;
  }

  // --- CARTELLINI (attesi: squadre + arbitro)
  let cardsExpected=null, cardsScore=null;
  if (h && a) {
    const teamsCards = (Number(h.avgCards) + Number(a.avgCards)) || 0;
    cardsExpected = ref?.avgCards != null ? mean(teamsCards, Number(ref.avgCards)) : teamsCards;
    cardsScore = scoreLinear(cardsExpected, 2, 7);
  }

  // --- FALLI (attesi: teams only, per ora)
  let foulsExpected=null, foulsScore=null, foulsHome=null, foulsAway=null;
  if (fouls?.home && fouls?.away) {
    foulsHome = mean(fouls.home.avgFoulsFor, fouls.away.avgFoulsAgainst);
    foulsAway = mean(fouls.away.avgFoulsFor, fouls.home.avgFoulsAgainst);
    foulsExpected = foulsHome + foulsAway;
    foulsScore = scoreLinear(foulsExpected, 16, 32);
  }

  const ctx = { goal1T, goal2T, cornersExpected, shotsExpected, cardsExpected, foulsExpected };

  // MATCH SUMMARY: bookmaker style + attesi (niente percentuali)
   const summary = `
    <div class="ind-summary">
      ${summaryPill("Gol", goalsExpected == null ? "—" : `${goalsBettingLine(goalsExpected)} (attesi ${fmt2(goalsExpected)})`)}
      ${summaryPill("Corner", cornersExpected == null ? "—" : `${pickLabel("corners", ctx)} (attesi ${fmt2(cornersExpected)})`)}
      ${summaryPill("Cartellini", cardsExpected == null ? "—" : `${pickLabel("cards", ctx)} (attesi ${fmt2(cardsExpected)})`)}
      ${summaryPill("Falli", foulsExpected == null ? "—" : `${pickLabel("fouls", ctx)} (attesi ${fmt2(foulsExpected)})`)}
    </div>
  `;

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
