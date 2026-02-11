// js/features/indicatorsPanel.js

function setIndicators(html) {
  const el = document.getElementById("indicatorsPanel");
  if (el) el.innerHTML = html;
}

// “bus” dati: i pannelli scrivono qui, Indicators legge e renderizza
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

// scala lineare -> 0..100
function scoreLinear(value, minV, maxV) {
  const v = Number(value) || 0;
  if (maxV <= minV) return 0;
  const t = (v - minV) / (maxV - minV);
  return Math.round(clamp(t, 0, 1) * 100);
}

function mean(a, b) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  return (x + y) / 2;
}

function fmt2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function fmt0(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return String(Math.round(x));
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

// Etichette “scommessa style” (NON quote, solo soglie)
function pickLabel(type, ctx) {
  if (type === "g1t") {
    const v = Number(ctx?.goal1T);
    if (!Number.isFinite(v)) return "Gol 1T: —";
    if (v >= 65) return "Gol 1T: Alto";
    if (v >= 50) return "Gol 1T: Medio";
    return "Gol 1T: Basso";
  }

  if (type === "g2t") {
    const v = Number(ctx?.goal2T);
    if (!Number.isFinite(v)) return "Gol 2T: —";
    if (v >= 65) return "Gol 2T: Alto";
    if (v >= 50) return "Gol 2T: Medio";
    return "Gol 2T: Basso";
  }

  if (type === "corners") {
    const tot = Number(ctx?.cornersExpected);
    if (!Number.isFinite(tot)) return "Corner: —";
    if (tot >= 11.5) return "Corner: Over 10.5";
    if (tot >= 9.5) return "Corner: Over 8.5";
    return "Corner: Under 10.5";
  }

  if (type === "shots") {
    const tot = Number(ctx?.shotsExpected);
    if (!Number.isFinite(tot)) return "Tiri: —";
    if (tot >= 28) return "Tiri: Alto volume";
    if (tot >= 22) return "Tiri: Medio volume";
    return "Tiri: Basso volume";
  }

  if (type === "cards") {
    const tot = Number(ctx?.cardsExpected);
    if (!Number.isFinite(tot)) return "Cartellini: —";
    if (tot >= 5.5) return "Cartellini: Over 4.5";
    if (tot >= 4.5) return "Cartellini: Over 3.5";
    return "Cartellini: Under 4.5";
  }

  return "—";
}

function rowIndicator(opts) {
  const {
    title,
    score, // 0..100
    matchLabel,
    matchLine, // stringa “numeri match”
    homeTeam,
    awayTeam,
    homeValue, // stringa
    awayValue, // stringa
  } = opts;

  return `
    <div class="kv-row" style="grid-template-columns: 160px 1fr;">
      <div class="k">${safeHTML(title)}</div>
      <div class="v">
        <div class="teamline" style="gap:10px; justify-content:space-between; align-items:center;">
          <span class="pill"><strong>${score == null ? "—" : safeHTML(score)}</strong> / 100</span>
          <span class="pill">${safeHTML(matchLabel || "—")}</span>
        </div>

        ${matchLine ? `<div class="muted" style="margin-top:8px; font-size:12px;">${matchLine}</div>` : ""}

        <div style="margin-top:10px; display:grid; gap:8px;">
          <div class="teamline" style="justify-content:space-between; align-items:center;">
            ${teamChip(homeTeam)}
            <span class="pill">${homeValue || "—"}</span>
          </div>
          <div class="teamline" style="justify-content:space-between; align-items:center;">
            ${teamChip(awayTeam)}
            <span class="pill">${awayValue || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function publishIndicatorData(key, payload) {
  window.__IND__[key] = payload;
  renderIndicators(); // ogni update riprova a renderizzare
}

function renderIndicators() {
  const I = window.__IND__ || {};
  const teams = I.teams;
  const corners = I.corners;
  const shots = I.shots;
  const ref = I.referee;

  // Meta squadre dal match selezionato (per logo/nome coerenti)
  const fx = window.selectedFixture || {};
  const homeMeta = fx.home || { name: "Casa", logo: "" };
  const awayMeta = fx.away || { name: "Trasferta", logo: "" };

  // Se non c’è nulla ancora, placeholder pulito
  if (!teams && !corners && !shots && !ref) {
    setIndicators(
      `<p class="muted"><em>Gli indicatori verranno mostrati dopo aver selezionato un match.</em></p>`,
    );
    return;
  }

  // Helpers “safe”
  const h = teams?.home || null;
  const a = teams?.away || null;

  // ---- GOL 1T / 2T
  let home1T = null,
    away1T = null,
    goal1T = null;
  let home2T = null,
    away2T = null,
    goal2T = null;

  if (h && a) {
    home1T = mean(h.gf1Pct, a.ga1Pct);
    away1T = mean(a.gf1Pct, h.ga1Pct);
    goal1T = mean(home1T, away1T);

    home2T = mean(h.gf2Pct, a.ga2Pct);
    away2T = mean(a.gf2Pct, h.ga2Pct);
    goal2T = mean(home2T, away2T);
  }

  // ---- CORNER
  let cornersExpected = null,
    cornersScore = null,
    cornersHome = null,
    cornersAway = null;

  if (corners?.home && corners?.away) {
    const ch = corners.home;
    const ca = corners.away;

    cornersHome = mean(ch.avgCorners, ca.avgCornersAgainst);
    cornersAway = mean(ca.avgCorners, ch.avgCornersAgainst);
    cornersExpected = cornersHome + cornersAway;

    cornersScore = scoreLinear(cornersExpected, 6, 14);
  }

  // ---- TIRI
  let shotsExpected = null,
    shotsScore = null,
    shotsHome = null,
    shotsAway = null,
    onTargetExpected = null;

  if (shots?.home && shots?.away) {
    const sh = shots.home;
    const sa = shots.away;

    shotsHome = mean(sh.avgShotsFor, sa.avgShotsAgainst);
    shotsAway = mean(sa.avgShotsFor, sh.avgShotsAgainst);
    shotsExpected = shotsHome + shotsAway;

    const homeOT = mean(sh.avgOnTargetFor, sa.avgOnTargetAgainst);
    const awayOT = mean(sa.avgOnTargetFor, sh.avgOnTargetAgainst);
    onTargetExpected = homeOT + awayOT;

    shotsScore = scoreLinear(shotsExpected, 16, 32);
  }

  // ---- CARTELLINI
  let cardsExpected = null,
    cardsScore = null;

  if (h && a) {
    const teamsCards = (Number(h.avgCards) + Number(a.avgCards)) || 0;
    if (ref?.avgCards != null) cardsExpected = mean(teamsCards, Number(ref.avgCards));
    else cardsExpected = teamsCards;

    cardsScore = scoreLinear(cardsExpected, 2, 7);
  }

  // Render “brio + chiarezza”
  const ctx = { goal1T, goal2T, cornersExpected, shotsExpected, cardsExpected };

  const out = `
    <div class="kv">
      ${rowIndicator({
        title: "Gol 1° tempo",
        score: goal1T == null ? null : Math.round(goal1T),
        matchLabel: pickLabel("g1t", ctx),
        matchLine: goal1T == null ? "" : `Indice match: <strong>${fmt0(goal1T)}/100</strong>`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeValue: home1T == null ? "—" : `${fmt0(home1T)}/100`,
        awayValue: away1T == null ? "—" : `${fmt0(away1T)}/100`,
      })}

      ${rowIndicator({
        title: "Gol 2° tempo",
        score: goal2T == null ? null : Math.round(goal2T),
        matchLabel: pickLabel("g2t", ctx),
        matchLine: goal2T == null ? "" : `Indice match: <strong>${fmt0(goal2T)}/100</strong>`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeValue: home2T == null ? "—" : `${fmt0(home2T)}/100`,
        awayValue: away2T == null ? "—" : `${fmt0(away2T)}/100`,
      })}

      ${rowIndicator({
        title: "Corner",
        score: cornersScore == null ? null : cornersScore,
        matchLabel: pickLabel("corners", ctx),
        matchLine:
          cornersExpected == null
            ? ""
            : `Tot attesi: <strong>${fmt2(cornersExpected)}</strong> (scala 6→14)`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeValue: cornersHome == null ? "—" : `${fmt2(cornersHome)} attesi`,
        awayValue: cornersAway == null ? "—" : `${fmt2(cornersAway)} attesi`,
      })}

      ${rowIndicator({
        title: "Tiri",
        score: shotsScore == null ? null : shotsScore,
        matchLabel: pickLabel("shots", ctx),
        matchLine:
          shotsExpected == null
            ? ""
            : `Tot attesi: <strong>${fmt2(shotsExpected)}</strong>${
                onTargetExpected == null ? "" : ` · In porta attesi: <strong>${fmt2(onTargetExpected)}</strong>`
              }`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeValue: shotsHome == null ? "—" : `${fmt2(shotsHome)} attesi`,
        awayValue: shotsAway == null ? "—" : `${fmt2(shotsAway)} attesi`,
      })}

      ${rowIndicator({
        title: "Cartellini",
        score: cardsScore == null ? null : cardsScore,
        matchLabel: pickLabel("cards", ctx),
        matchLine:
          cardsExpected == null
            ? ""
            : `Attesi: <strong>${fmt2(cardsExpected)}</strong>${
                ref?.avgCards == null ? " · (arbitro —)" : ` · Arbitro: <strong>${fmt2(ref.avgCards)}</strong>`
              }`,
        homeTeam: homeMeta,
        awayTeam: awayMeta,
        homeValue: h ? `Media: ${fmt2(h.avgCards)}` : "—",
        awayValue: a ? `Media: ${fmt2(a.avgCards)}` : "—",
      })}
    </div>
  `;

  setIndicators(out);
}

// Export globale (così gli altri pannelli possono chiamarlo)
window.publishIndicatorData = publishIndicatorData;
