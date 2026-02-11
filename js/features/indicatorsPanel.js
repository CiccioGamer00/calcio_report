// js/features/indicatorsPanel.js

function setIndicators(html) {
  const el = document.getElementById("indicatorsPanel");
  if (el) el.innerHTML = html;
}

window.__IND__ = window.__IND__ || {
  teams: null,
  corners: null,
  shots: null,
  referee: null,
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

function scoreLinear(value, minV, maxV) {
  const v = Number(value) || 0;
  if (maxV <= minV) return 0;
  const t = (v - minV) / (maxV - minV);
  return Math.round(clamp(t, 0, 1) * 100);
}

function fmt0(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(Math.round(x)) : "—";
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
    if (tot >= 11.5) return "Over 10.5";
    if (tot >= 9.5) return "Over 8.5";
    return "Under 10.5";
  }
  if (type === "shots") {
    const tot = Number(ctx.shotsExpected);
    if (!Number.isFinite(tot)) return "Tiri —";
    if (tot >= 28) return "Alto volume";
    if (tot >= 22) return "Medio volume";
    return "Basso volume";
  }
  if (type === "cards") {
    const tot = Number(ctx.cardsExpected);
    if (!Number.isFinite(tot)) return "Cartellini —";
    if (tot >= 5.5) return "Over 4.5";
    if (tot >= 4.5) return "Over 3.5";
    return "Under 4.5";
  }
  return "—";
}

function teamInline(team, valueText) {
  const logo = team?.logo || "";
  const name = team?.name || "—";
  return `
    <span class="ind-team">
      ${logo ? `<img class="logo" src="${safeHTML(logo)}" alt="logo" />` : ""}
      <span class="ind-team-name">${safeHTML(name)}</span>
      <span class="ind-val">${safeHTML(valueText || "—")}</span>
    </span>
  `;
}

function tileCompact(opts) {
  const { icon, title, score, label, homeTeam, awayTeam, homeVal, awayVal } = opts;
  const cls = scoreClass(score);

  return `
    <div class="ind-tile">
      <div class="ind-head">
        <div class="ind-title">
          <span class="ind-ico">${safeHTML(icon)}</span>
          <span>${safeHTML(title)}</span>
        </div>
        <span class="ind-score ${cls}">${score == null ? "—" : safeHTML(score)}</span>
      </div>

      <div class="ind-label">${safeHTML(label || "—")}</div>

      <div class="ind-2lines">
        ${teamInline(homeTeam, homeVal)}
        ${teamInline(awayTeam, awayVal)}
      </div>
    </div>
  `;
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

  // ✅ STEMMI: qui NON usare window.selectedFixture
  const fx = typeof selectedFixture !== "undefined" ? selectedFixture : null;
  const homeMeta = fx?.home || { name: "Casa", logo: "" };
  const awayMeta = fx?.away || { name: "Trasferta", logo: "" };

  if (!teams && !corners && !shots && !ref) {
    setIndicators(`<p class="muted"><em>Gli indicatori verranno mostrati dopo aver selezionato un match.</em></p>`);
    return;
  }

  const h = teams?.home || null;
  const a = teams?.away || null;

  // Gol 1T / 2T
  let home1T=null, away1T=null, goal1T=null;
  let home2T=null, away2T=null, goal2T=null;

  if (h && a) {
    home1T = mean(h.gf1Pct, a.ga1Pct);
    away1T = mean(a.gf1Pct, h.ga1Pct);
    goal1T = mean(home1T, away1T);

    home2T = mean(h.gf2Pct, a.ga2Pct);
    away2T = mean(a.gf2Pct, h.ga2Pct);
    goal2T = mean(home2T, away2T);
  }

  // Corner
  let cornersHome=null, cornersAway=null, cornersExpected=null, cornersScore=null;
  if (corners?.home && corners?.away) {
    cornersHome = mean(corners.home.avgCorners, corners.away.avgCornersAgainst);
    cornersAway = mean(corners.away.avgCorners, corners.home.avgCornersAgainst);
    cornersExpected = cornersHome + cornersAway;
    cornersScore = scoreLinear(cornersExpected, 6, 14);
  }

  // Tiri
  let shotsHome=null, shotsAway=null, shotsExpected=null, shotsScore=null;
  if (shots?.home && shots?.away) {
    shotsHome = mean(shots.home.avgShotsFor, shots.away.avgShotsAgainst);
    shotsAway = mean(shots.away.avgShotsFor, shots.home.avgShotsAgainst);
    shotsExpected = shotsHome + shotsAway;
    shotsScore = scoreLinear(shotsExpected, 16, 32);
  }

  // Cartellini
  let cardsExpected=null, cardsScore=null;
  if (h && a) {
    const teamsCards = (Number(h.avgCards) + Number(a.avgCards)) || 0;
    cardsExpected = ref?.avgCards != null ? mean(teamsCards, Number(ref.avgCards)) : teamsCards;
    cardsScore = scoreLinear(cardsExpected, 2, 7);
  }

  const ctx = { goal1T, goal2T, cornersExpected, shotsExpected, cardsExpected };

  setIndicators(`
    <div class="ind-grid">
      ${tileCompact({
        icon: "⚽",
        title: "Gol 1° tempo",
        score: goal1T == null ? null : Math.round(goal1T),
        label: pickLabel("g1t", ctx),
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: home1T == null ? "—" : `${fmt0(home1T)}/100`,
        awayVal: away1T == null ? "—" : `${fmt0(away1T)}/100`,
      })}

      ${tileCompact({
        icon: "⏱️",
        title: "Gol 2° tempo",
        score: goal2T == null ? null : Math.round(goal2T),
        label: pickLabel("g2t", ctx),
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: home2T == null ? "—" : `${fmt0(home2T)}/100`,
        awayVal: away2T == null ? "—" : `${fmt0(away2T)}/100`,
      })}

      ${tileCompact({
        icon: "🚩",
        title: "Corner",
        score: cornersScore == null ? null : cornersScore,
        label: cornersExpected == null ? "Corner —" : `Tot ${fmt2(cornersExpected)} · ${pickLabel("corners", ctx)}`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: cornersHome == null ? "—" : `${fmt2(cornersHome)}`,
        awayVal: cornersAway == null ? "—" : `${fmt2(cornersAway)}`,
      })}

      ${tileCompact({
        icon: "🎯",
        title: "Tiri",
        score: shotsScore == null ? null : shotsScore,
        label: shotsExpected == null ? "Tiri —" : `Tot ${fmt2(shotsExpected)} · ${pickLabel("shots", ctx)}`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: shotsHome == null ? "—" : `${fmt2(shotsHome)}`,
        awayVal: shotsAway == null ? "—" : `${fmt2(shotsAway)}`,
      })}

      ${tileCompact({
        icon: "🟨",
        title: "Cartellini",
        score: cardsScore == null ? null : cardsScore,
        label: cardsExpected == null ? "Cartellini —" : `Attesi ${fmt2(cardsExpected)} · ${pickLabel("cards", ctx)}`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeVal: h ? `Media ${fmt2(h.avgCards)}` : "—",
        awayVal: a ? `Media ${fmt2(a.avgCards)}` : "—",
      })}
    </div>
  `);
}

window.publishIndicatorData = publishIndicatorData;
