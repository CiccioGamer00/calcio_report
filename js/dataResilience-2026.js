// js/dataResilience-2026.js
// Recupero robusto dei prossimi match.
// Se /fixtures?team=...&next=N torna vuoto, prova una finestra temporale
// e prende le prime fixture future valide.

(() => {
  function dateOnlyUTC(d) {
    return d.toISOString().slice(0, 10);
  }

  function uniqueByFixtureId(rows) {
    const out = [];
    const seen = new Set();
    for (const fx of rows || []) {
      const id = fx?.fixture?.id ?? null;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(fx);
    }
    return out;
  }

  function isUsableFutureFixture(fx) {
    const status = String(fx?.fixture?.status?.short || "").toUpperCase();
    const blocked = new Set(["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"]);
    if (blocked.has(status)) return false;

    const ts = Number(fx?.fixture?.timestamp || 0);
    if (!ts) return false;

    // Piccola tolleranza: se una partita è appena iniziata non sparisce subito.
    return ts >= Math.floor(Date.now() / 1000) - 6 * 60 * 60;
  }

  function sortSoonest(rows) {
    return [...(rows || [])].sort((a, b) => {
      const ta = Number(a?.fixture?.timestamp || 0);
      const tb = Number(b?.fixture?.timestamp || 0);
      return ta - tb;
    });
  }

  function apply() {
    if (typeof window.fetchNextFixtures !== "function") {
      setTimeout(apply, 80);
      return;
    }

    if (window.fetchNextFixtures.__crResilientNext) return;

    const original = window.fetchNextFixtures;

    const wrapped = async function (teamId, count = 2) {
      const wanted = Math.max(1, Number(count) || 2);
      let primary = [];

      try {
        primary = await original.call(this, teamId, Math.max(wanted, 3));
      } catch (err) {
        console.warn("Primary next fixtures failed", teamId, err);
      }

      primary = sortSoonest(
        uniqueByFixtureId((primary || []).filter(isUsableFutureFixture)),
      );

      if (primary.length >= wanted) {
        return primary.slice(0, wanted);
      }

      const from = new Date();
      const to = new Date(from.getTime() + 180 * 24 * 60 * 60 * 1000);

      try {
        const r = await apiGet(
          `/fixtures?team=${encodeURIComponent(teamId)}&from=${dateOnlyUTC(from)}&to=${dateOnlyUTC(to)}&timezone=Europe/Rome`,
          { retries: 1, delays: [500] },
        );

        const fallback =
          r?.ok && !r?.errors && Array.isArray(r?.arr)
            ? r.arr.filter(isUsableFutureFixture)
            : [];

        const merged = sortSoonest(uniqueByFixtureId([...primary, ...fallback]));
        if (merged.length) return merged.slice(0, wanted);
      } catch (err) {
        console.warn("Fallback next fixtures failed", teamId, err);
      }

      return primary.slice(0, wanted);
    };

    wrapped.__crResilientNext = true;
    window.fetchNextFixtures = wrapped;
    console.info("Calcio Report resilient next-fixtures attivo");
  }

  apply();
})();
