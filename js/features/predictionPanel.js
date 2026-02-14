// js/features/predictionPanel.js

function setPrediction(html) {
  const el = document.getElementById("predictionPanel");
  if (el) el.innerHTML = html;
}

function pct1(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function fmt2(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

function scorelineList(list) {
  const items = (list || [])
    .slice(0, 3)
    .map(
      (x) =>
        `<li><strong>${safeHTML(x.score)}</strong> — ${safeHTML(pct1(x.p))}</li>`,
    )
    .join("");
  return `<ul>${items || `<li class="muted">Nessun dato</li>`}</ul>`;
}
function driversList(list) {
  const items = (list || [])
    .slice(0, 6)
    .map((d) => {
      const imp = safeHTML(d.impact || "•");
      const factor = safeHTML(d.factor || "—");
      const note = safeHTML(d.note || "");
      return `<li><strong>${imp}</strong> ${factor}${note ? ` — <span class="muted">${note}</span>` : ""}</li>`;
    })
    .join("");
  return `<ul>${items || `<li class="muted">Nessuna spiegazione disponibile</li>`}</ul>`;
}

async function loadPrediction() {
  if (!selectedFixture?.id) {
    setPrediction(
      `<p class="muted"><em>Seleziona una squadra per vedere la stima.</em></p>`,
    );
    return;
  }

  const n =
    parseInt(document.getElementById("refHistoryCount")?.value || "10", 10) ||
    10;

  setPrediction(`<p class="muted"><em>Calcolo predizione Poisson...</em></p>`);

  const r = await apiGet(`/predict?fixture=${selectedFixture.id}&n=${n}`);
  if (!r.ok || r.errors) {
    setPrediction(
      `<p class="bad"><em>Errore predizione: HTTP ${safeHTML(r.status)}.</em></p>`,
    );
    return;
  }

  const data = r.json?.response || null;
  if (!data) {
    setPrediction(
      `<p class="muted"><em>Nessun dato predizione disponibile.</em></p>`,
    );
    return;
  }

  const p = data.probabilities || {};
  const xg = data.expectedGoals || {};
  const top = data.topScorelines || [];
  const extras = data.extras || {};
  const drivers = data.drivers || [];
    const conf = data.confidence || null;

  function fmtConf(c) {
    if (!c || !Number.isFinite(Number(c.score))) return "—";
    const score = `${Math.round(Number(c.score))}/100`;
    const level = c.level ? ` · ${safeHTML(c.level)}` : "";
    const risk = c.risk ? ` · Rischio ${safeHTML(c.risk)}` : "";
    return `${safeHTML(score)}${level}${risk}`;
  }

  setPrediction(`
    <div class="kv">
      <div class="kv-row">
        <div class="k">1X2</div>
        <div class="v">
          <span class="pill">Casa ${safeHTML(pct1(p.homeWin))}</span>
          <span class="pill">X ${safeHTML(pct1(p.draw))}</span>
          <span class="pill">Trasferta ${safeHTML(pct1(p.awayWin))}</span>
        </div>
      </div>
            <div class="kv-row">
        <div class="k">Affidabilità</div>
        <div class="v">
          <span class="pill">${fmtConf(conf)}</span>
          ${conf?.note ? `<div class="muted" style="margin-top:6px">${safeHTML(conf.note)}</div>` : ""}
        </div>
      </div>

      <div class="kv-row">
        <div class="k">Expected Goals</div>
        <div class="v">
          <span class="pill">${safeHTML(selectedFixture.home?.name || "Casa")} ${safeHTML(fmt2(xg.home))}</span>
          <span class="pill">${safeHTML(selectedFixture.away?.name || "Trasferta")} ${safeHTML(fmt2(xg.away))}</span>
        </div>
      </div>

      <div class="kv-row">
        <div class="k">Risultati più probabili</div>
        <div class="v">${scorelineList(top)}</div>
      </div>
      <div class="kv-row">
        <div class="k">Perché</div>
        <div class="v">${driversList(drivers)}</div>
      </div>
      <div class="kv-row">
        <div class="k">Extra</div>
        <div class="v">
          <span class="pill">Over 2.5 ${safeHTML(pct1(extras.over25))}</span>
          <span class="pill">BTTS Sì ${safeHTML(pct1(extras.bttsYes))}</span>
        </div>
      </div>
    </div>
  `);
}

window.loadPrediction = loadPrediction;
