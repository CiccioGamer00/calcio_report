// js/features/lineupsController.js
// Policy formazioni: ufficiali subito, stima solo su richiesta.
// Corregge anche i moduli a quattro linee (es. 4-2-3-1) nella stima.

(() => {
  function roleOf(player) {
    const p = String(player?.pos || player?.position || "").toUpperCase();
    if (p === "GK" || p.startsWith("G")) return "GK";
    if (p === "DEF" || p.startsWith("D")) return "DEF";
    if (p === "MID" || p.startsWith("M")) return "MID";
    if (p === "ATT" || p.startsWith("F") || p.startsWith("A")) return "ATT";
    return "MID";
  }

  function repairFourLineEstimate(data) {
    if (!data || !Array.isArray(data.startXI)) return data;

    const parts = String(data.formation || "")
      .split("-")
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (parts.length < 4 || parts.reduce((a, b) => a + b, 0) !== 10) return data;

    const desired = {
      GK: 1,
      DEF: parts[0],
      MID: parts.slice(1, -1).reduce((a, b) => a + b, 0),
      ATT: parts[parts.length - 1],
    };

    const current = data.startXI.filter((p) => p?.id);
    const groups = { GK: [], DEF: [], MID: [], ATT: [] };
    current.forEach((p) => groups[roleOf(p)].push(p));

    const candidates = data.candidates || {};
    const used = new Set();

    function take(source, count, forcedRole) {
      const out = [];
      for (const p of source || []) {
        if (out.length >= count) break;
        if (!p?.id || used.has(p.id)) continue;
        used.add(p.id);
        out.push({ ...p, pos: forcedRole });
      }
      return out;
    }

    let gk = take(groups.GK, desired.GK, "GK");
    if (gk.length < desired.GK) gk.push(...take(candidates.GK, desired.GK - gk.length, "GK"));

    let defs = take(groups.DEF, desired.DEF, "DEF");
    if (defs.length < desired.DEF) defs.push(...take(candidates.DEF, desired.DEF - defs.length, "DEF"));

    let atts = take(groups.ATT, desired.ATT, "ATT");
    if (atts.length < desired.ATT) atts.push(...take(candidates.ATT, desired.ATT - atts.length, "ATT"));

    const mids = take(
      [...groups.MID, ...groups.ATT, ...(candidates.MID || []), ...(candidates.ATT || []), ...groups.DEF, ...(candidates.DEF || [])],
      desired.MID,
      "MID",
    );

    let rebuilt = [...gk, ...defs, ...mids, ...atts];
    if (rebuilt.length < 11) {
      rebuilt.push(
        ...take(
          [...current, ...(candidates.MID || []), ...(candidates.ATT || []), ...(candidates.DEF || []), ...(candidates.GK || [])],
          11 - rebuilt.length,
          "MID",
        ),
      );
    }

    if (rebuilt.length >= 11) data.startXI = rebuilt.slice(0, 11);
    return data;
  }

  function apply() {
    if (
      typeof window.loadLineupsPitch !== "function" ||
      typeof window.estimateLineupForTeam !== "function"
    ) {
      setTimeout(apply, 80);
      return;
    }

    if (!window.estimateLineupForTeam.__crFourLineFixed) {
      const originalEstimate = window.estimateLineupForTeam;
      window.estimateLineupForTeam = async function (...args) {
        const data = await originalEstimate.apply(this, args);
        return repairFourLineEstimate(data);
      };
      window.estimateLineupForTeam.__crFourLineFixed = true;
    }

    if (window.loadLineupsPitch.__crOnDemandFixed) return;

    const originalLoad = window.loadLineupsPitch;
    window.loadLineupsPitch = async function () {
      const box = document.getElementById("lineupsBox");
      const content = document.getElementById("lineupsContent");
      if (!box || !content) return;

      box.classList.remove("hidden");

      if (typeof selectedFixture === "undefined" || !selectedFixture?.id) {
        content.innerHTML = `<p class="muted"><em>Seleziona un match per vedere le formazioni.</em></p>`;
        return;
      }

      content.innerHTML = `<p class="muted"><em>Verifico la formazione ufficiale…</em></p>`;

      const r = await apiGet(`/fixtures/lineups?fixture=${selectedFixture.id}`, {
        retries: 1,
        delays: [700],
      }).catch(() => null);

      const hasOfficial = !!(
        r?.ok &&
        !r?.errors &&
        Array.isArray(r?.arr) &&
        r.arr.length > 0
      );

      if (hasOfficial) {
        await originalLoad();
        return;
      }

      content.innerHTML = `
        <p class="muted"><em>Formazione ufficiale non ancora disponibile.</em></p>
        <p class="muted" style="margin-top:6px;">
          La formazione stimata usa dati storici e richiede più chiamate.
        </p>
        <p style="margin-top:10px;">
          <button type="button" class="btn primary" id="btnLoadEstimatedLineup">
            Carica formazione stimata
          </button>
        </p>
      `;

      const btn = document.getElementById("btnLoadEstimatedLineup");
      btn?.addEventListener(
        "click",
        async () => {
          btn.disabled = true;
          btn.textContent = "Caricamento stima…";
          try {
            await originalLoad();
          } catch (err) {
            console.error("Estimated lineup", err);
            content.innerHTML = `<p class="bad"><em>Non riesco a calcolare la formazione stimata.</em></p>`;
          }
        },
        { once: true },
      );
    };

    window.loadLineupsPitch.__crOnDemandFixed = true;
  }

  apply();
})();
