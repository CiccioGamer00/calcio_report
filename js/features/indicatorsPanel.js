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

  // ---- GOL 1T / 2T (richiede teams)
  let goal1T = null,
    goal2T = null,
    home1T = null,
    away1T = null,
    home2T = null,
    away2T = null;

  if (h && a) {
    home1T = mean(h.gf1Pct, a.ga1Pct);
    away1T = mean(a.gf1Pct, h.ga1Pct);
    goal1T = mean(home1T, away1T);

    home2T = mean(h.gf2Pct, a.ga2Pct);
    away2T = mean(a.gf2Pct, h.ga2Pct);
    goal2T = mean(home2T, away2T);
  }

  // ---- CORNER (richiede corners)
  let cornersExpected = null,
    cornersScore = null;
  if (corners?.home && corners?.away) {
    const ch = corners.home;
    const ca = corners.away;

    const homeC = mean(ch.avgCorners, ca.avgCornersAgainst);
    const awayC = mean(ca.avgCorners, ch.avgCornersAgainst);
    cornersExpected = homeC + awayC;

    // scala realistica “tot corner”: 6 basso, 14 alto (clamp implicito)
    cornersScore = scoreLinear(cornersExpected, 6, 14);
  }

  // ---- TIRI (richiede shots)
  let shotsExpected = null,
    shotsScore = null,
    onTargetExpected = null;
  if (shots?.home && shots?.away) {
    const sh = shots.home;
    const sa = shots.away;

    const homeS = mean(sh.avgShotsFor, sa.avgShotsAgainst);
    const awayS = mean(sa.avgShotsFor, sh.avgShotsAgainst);
    shotsExpected = homeS + awayS;

    const homeOT = mean(sh.avgOnTargetFor, sa.avgOnTargetAgainst);
    const awayOT = mean(sa.avgOnTargetFor, sh.avgOnTargetAgainst);
    onTargetExpected = homeOT + awayOT;

    // scala realistica tiri totali: 16 basso, 32 alto
    shotsScore = scoreLinear(shotsExpected, 16, 32);
  }

  // ---- CARTELLINI (teams + ref)
  let cardsExpected = null,
    cardsScore = null;
  if (h && a) {
    const teamsCards = (Number(h.avgCards) + Number(a.avgCards)) || 0;
    if (ref?.avgCards != null) {
      cardsExpected = mean(teamsCards, Number(ref.avgCards));
    } else {
      // fallback: se arbitro non disponibile, usiamo solo squadre
      cardsExpected = teamsCards;
    }

    // scala realistica cartellini totali: 2 basso, 7 alto
    cardsScore = scoreLinear(cardsExpected, 2, 7);
  }

  // Render card “professionale”: indice + numeri grezzi
  setIndicators(`
    <div class="kv">
      <div class="kv-row">
        <div class="k">Gol 1° tempo</div>
        <div class="v">
          <strong>${goal1T == null ? "—" : Math.round(goal1T)}</strong> / 100
          ${
            home1T == null
              ? ""
              : `<div class="muted" style="margin-top:6px; font-size:12px;">
                  Home 1T: ${Math.round(home1T)} · Away 1T: ${Math.round(away1T)}
                </div>`
          }
        </div>
      </div>

      <div class="kv-row">
        <div class="k">Gol 2° tempo</div>
        <div class="v">
          <strong>${goal2T == null ? "—" : Math.round(goal2T)}</strong> / 100
          ${
            home2T == null
              ? ""
              : `<div class="muted" style="margin-top:6px; font-size:12px;">
                  Home 2T: ${Math.round(home2T)} · Away 2T: ${Math.round(away2T)}
                </div>`
          }
        </div>
      </div>

      <div class="kv-row">
        <div class="k">Corner totali</div>
        <div class="v">
          <strong>${cornersScore == null ? "—" : cornersScore}</strong> / 100
          ${
            cornersExpected == null
              ? ""
              : `<div class="muted" style="margin-top:6px; font-size:12px;">
                  Attesi: ${cornersExpected.toFixed(2)} (scala 6→14)
                </div>`
          }
        </div>
      </div>

      <div class="kv-row">
        <div class="k">Volume tiri</div>
        <div class="v">
          <strong>${shotsScore == null ? "—" : shotsScore}</strong> / 100
          ${
            shotsExpected == null
              ? ""
              : `<div class="muted" style="margin-top:6px; font-size:12px;">
                  Tiri attesi: ${shotsExpected.toFixed(2)} (scala 16→32)
                  ${onTargetExpected == null ? "" : ` · In porta attesi: ${onTargetExpected.toFixed(2)}`}
                </div>`
          }
        </div>
      </div>

      <div class="kv-row">
        <div class="k">Cartellini match</div>
        <div class="v">
          <strong>${cardsScore == null ? "—" : cardsScore}</strong> / 100
          ${
            cardsExpected == null
              ? ""
              : `<div class="muted" style="margin-top:6px; font-size:12px;">
                  Attesi: ${cardsExpected.toFixed(2)} (scala 2→7)
                  ${ref?.avgCards == null ? " · (arbitro non disponibile)" : ` · Arbitro: ${Number(ref.avgCards).toFixed(2)}`}
                </div>`
          }
        </div>
      </div>
    </div>
  `);
}

// Export globale (così gli altri pannelli possono chiamarlo)
window.publishIndicatorData = publishIndicatorData;
