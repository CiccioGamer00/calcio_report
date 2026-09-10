// js/hotfix-2026.js
// Hotfix settembre 2026 - ricerca/UX/formazioni
// Obiettivi:
// 1) una sola ricerca per azione utente (niente reload al primo click sui tab)
// 2) suggerimenti stabili mentre si completa il nome della squadra
// 3) bottone Cerca affidabile anche senza selezionare la tendina
// 4) formazione ufficiale leggera; stima solo su richiesta
// 5) correzione moduli a 4 linee (es. 4-2-3-1)

(() => {
  let applied = false;
  let recoveryTimer = null;
  let lastGoodSuggestItems = [];
  let searchInFlight = null;
  let searchInFlightKey = "";

  function normQuery(value) {
    if (typeof window.sanitizeSearch === "function") {
      return window.sanitizeSearch(value);
    }
    return String(value || "").trim();
  }

  function normText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getInput() {
    return (
      document.getElementById("teamInput") ||
      document.getElementById("teamSearchInput")
    );
  }

  function getSuggestBox() {
    return document.getElementById("teamSuggestBox");
  }

  function readVisibleSuggestItems() {
    const box = getSuggestBox();
    if (!box) return [];

    return Array.from(box.querySelectorAll(".suggestItem"))
      .map((btn) => ({
        id: Number(btn.getAttribute("data-team-id") || 0) || null,
        name: btn.getAttribute("data-team-name") || "",
        logo: btn.getAttribute("data-team-logo") || "",
        country:
          btn.querySelector(".suggestMeta")?.textContent?.trim() === "—"
            ? ""
            : btn.querySelector(".suggestMeta")?.textContent?.trim() || "",
      }))
      .filter((x) => x.id && x.name);
  }

  function rememberVisibleSuggestions() {
    const items = readVisibleSuggestItems();
    if (items.length) lastGoodSuggestItems = items;
  }

  function matchingSuggestions(items, query) {
    const q = normText(query);
    if (!q) return [];
    return (items || []).filter((x) => normText(x?.name).includes(q));
  }

  function hasUsefulVisibleSuggestions(query) {
    const box = getSuggestBox();
    if (!box || box.classList.contains("hidden")) return false;
    return matchingSuggestions(readVisibleSuggestItems(), query).length > 0;
  }

  function hideSuggestions() {
    if (typeof window.hideSuggestBox === "function") {
      window.hideSuggestBox();
      return;
    }
    const box = getSuggestBox();
    if (!box) return;
    box.classList.add("hidden");
  }

  function normalizeTeamRows(arr) {
    return (Array.isArray(arr) ? arr : [])
      .map((t) => ({
        id: t?.team?.id ?? null,
        name: t?.team?.name ?? "",
        logo: t?.team?.logo ?? "",
        country: t?.team?.country ?? t?.team?.nation ?? "",
      }))
      .filter((x) => x.id && x.name);
  }

  function switchToMatchView() {
    document
      .querySelectorAll(".stageView")
      .forEach((el) => el.classList.add("hidden"));
    document.getElementById("matchView")?.classList.remove("hidden");

    const nav = document.getElementById("panelTabs");
    if (nav) {
      nav
        .querySelectorAll(".tab")
        .forEach((b) => b.classList.remove("is-active"));
      nav.querySelector('.tab[data-view="match"]')?.classList.add("is-active");
    }
  }

  function clearLineupsForNewSearch() {
    const box = document.getElementById("lineupsBox");
    const content = document.getElementById("lineupsContent");
    box?.classList.add("hidden");
    if (content) {
      content.innerHTML = `<p class="muted"><em>Formazioni non disponibili.</em></p>`;
    }
  }

  function applyShowTeamCoordinator() {
    if (
      typeof window.showTeam !== "function" ||
      window.showTeam.__crSearchCoordinator
    ) {
      return;
    }

    const original = window.showTeam;

    const wrapped = async function (...args) {
      const forced = args?.[0] || null;
      const q = normQuery(getInput()?.value || "");
      const key = forced?.id ? `id:${forced.id}` : `q:${normText(q)}`;

      if (searchInFlight && key && key === searchInFlightKey) {
        return searchInFlight;
      }

      if (searchInFlight) {
        try {
          await searchInFlight;
        } catch (_) {}
      }

      switchToMatchView();
      clearLineupsForNewSearch();
      hideSuggestions();

      const promise = Promise.resolve(original.apply(this, args));
      searchInFlight = promise;
      searchInFlightKey = key;

      try {
        return await promise;
      } finally {
        if (searchInFlight === promise) {
          searchInFlight = null;
          searchInFlightKey = "";
        }
      }
    };

    wrapped.__crSearchCoordinator = true;
    window.showTeam = wrapped;
  }

  function applySearchFixes() {
    const input = getInput();
    const btn = document.getElementById("btnSearch");
    if (!input) return;

    if (!input.dataset.crChangeFix) {
      input.dataset.crChangeFix = "1";
      input.addEventListener(
        "change",
        (e) => {
          e.stopImmediatePropagation();
          hideSuggestions();
        },
        true,
      );
    }

    if (!input.dataset.crSuggestFix) {
      input.dataset.crSuggestFix = "1";

      input.addEventListener(
        "input",
        () => {
          rememberVisibleSuggestions();
          clearTimeout(recoveryTimer);

          const q = normQuery(input.value);
          if (!q || q.length < 2) return;

          const localMatches = matchingSuggestions(lastGoodSuggestItems, q);

          if (localMatches.length && typeof window.updateDatalist === "function") {
            setTimeout(() => {
              if (normQuery(input.value) !== q) return;
              window.updateDatalist(localMatches);
            }, 0);
          }

          recoveryTimer = setTimeout(async () => {
            if (normQuery(input.value) !== q) return;
            if (hasUsefulVisibleSuggestions(q)) return;

            if (localMatches.length && typeof window.updateDatalist === "function") {
              window.updateDatalist(localMatches);
              return;
            }

            try {
              if (typeof window.apiGet !== "function") return;
              const r = await window.apiGet(
                `/teams?search=${encodeURIComponent(q)}`,
                { retries: 1, delays: [350] },
              );
              const items = r?.ok && !r?.errors ? normalizeTeamRows(r.arr) : [];
              if (
                normQuery(input.value) === q &&
                items.length &&
                typeof window.updateDatalist === "function"
              ) {
                lastGoodSuggestItems = items;
                window.updateDatalist(items);
              }
            } catch (err) {
              console.warn("Suggestion recovery failed", err);
            }
          }, 520);
        },
        true,
      );

      input.addEventListener("focus", () => {
        const q = normQuery(input.value);
        const localMatches = matchingSuggestions(lastGoodSuggestItems, q);
        if (
          q.length >= 2 &&
          localMatches.length &&
          typeof window.updateDatalist === "function"
        ) {
          window.updateDatalist(localMatches);
        }
      });
    }

    if (btn && !btn.dataset.crSearchFix) {
      btn.dataset.crSearchFix = "1";
      btn.addEventListener(
        "click",
        async (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();

          const q = normQuery(input.value);
          if (!q || q.length < 2) return;

          try {
            if (typeof window.markWelcomeDone === "function") {
              window.markWelcomeDone();
            }

            rememberVisibleSuggestions();
            hideSuggestions();

            btn.disabled = true;
            const oldText = btn.textContent;
            btn.dataset.crOldText = oldText || "Cerca";
            btn.textContent = "Cerco…";

            let forced = null;
            if (typeof window.findSuggestedByName === "function") {
              forced = window.findSuggestedByName(input.value);
            }
            if (!forced) {
              const local = matchingSuggestions(lastGoodSuggestItems, q);
              forced = local[0] || null;
            }

            if (typeof window.showTeam === "function") {
              await window.showTeam(forced);
            }
          } catch (err) {
            console.error("Search button error", err);
          } finally {
            btn.disabled = false;
            btn.textContent = btn.dataset.crOldText || "Cerca";
            delete btn.dataset.crOldText;
          }
        },
        true,
      );
    }
  }

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

    if (parts.length < 4 || parts.reduce((a, b) => a + b, 0) !== 10) {
      return data;
    }

    const desired = {
      GK: 1,
      DEF: parts[0],
      MID: parts.slice(1, -1).reduce((a, b) => a + b, 0),
      ATT: parts[parts.length - 1],
    };

    const current = data.startXI.filter((p) => p?.id);
    const curByRole = { GK: [], DEF: [], MID: [], ATT: [] };
    for (const p of current) curByRole[roleOf(p)].push(p);

    const candidateGroups = data.candidates || {};
    const candByRole = {
      GK: candidateGroups.GK || [],
      DEF: candidateGroups.DEF || [],
      MID: candidateGroups.MID || [],
      ATT: candidateGroups.ATT || [],
    };

    const used = new Set();
    const take = (source, count, forcedRole) => {
      const out = [];
      for (const p of source || []) {
        if (out.length >= count) break;
        const id = p?.id;
        if (!id || used.has(id)) continue;
        used.add(id);
        out.push({ ...p, pos: forcedRole });
      }
      return out;
    };

    let gk = take(curByRole.GK, desired.GK, "GK");
    if (gk.length < desired.GK) {
      gk = gk.concat(take(candByRole.GK, desired.GK - gk.length, "GK"));
    }

    let defs = take(curByRole.DEF, desired.DEF, "DEF");
    if (defs.length < desired.DEF) {
      defs = defs.concat(take(candByRole.DEF, desired.DEF - defs.length, "DEF"));
    }

    let atts = take(curByRole.ATT, desired.ATT, "ATT");
    if (atts.length < desired.ATT) {
      atts = atts.concat(take(candByRole.ATT, desired.ATT - atts.length, "ATT"));
    }

    const middleSources = [
      ...curByRole.MID,
      ...curByRole.ATT,
      ...candByRole.MID,
      ...candByRole.ATT,
      ...curByRole.DEF,
      ...candByRole.DEF,
    ];
    const mids = take(middleSources, desired.MID, "MID");

    const allSources = [
      ...current,
      ...candByRole.MID,
      ...candByRole.ATT,
      ...candByRole.DEF,
      ...candByRole.GK,
    ];

    let rebuilt = [...gk, ...defs, ...mids, ...atts];
    if (rebuilt.length < 11) {
      const extras = take(allSources, 11 - rebuilt.length, "MID");
      rebuilt = [...gk, ...defs, ...mids, ...extras, ...atts];
    }

    if (rebuilt.length >= 11) {
      data.startXI = rebuilt.slice(0, 11);
    }

    return data;
  }

  function applyFormationFix() {
    if (
      typeof window.estimateLineupForTeam !== "function" ||
      window.estimateLineupForTeam.__crFourLineFixed
    ) {
      return;
    }

    const original = window.estimateLineupForTeam;
    const wrapped = async function (...args) {
      const data = await original.apply(this, args);
      return repairFourLineEstimate(data);
    };
    wrapped.__crFourLineFixed = true;
    window.estimateLineupForTeam = wrapped;
  }

  function officialLineupPlaceholder(content) {
    content.innerHTML = `
      <p class="muted"><em>Formazione ufficiale non ancora disponibile.</em></p>
      <p class="muted" style="margin-top:6px;">
        La formazione stimata richiede più dati storici. Caricala solo se ti serve.
      </p>
      <p style="margin-top:10px;">
        <button type="button" class="btn primary" id="btnLoadEstimatedLineup">
          Carica formazione stimata
        </button>
      </p>
    `;
  }

  function applyLineupOnDemandFix() {
    if (
      typeof window.loadLineupsPitch !== "function" ||
      window.loadLineupsPitch.__crOnDemandFixed
    ) {
      return;
    }

    const original = window.loadLineupsPitch;

    const wrapped = async function () {
      const box = document.getElementById("lineupsBox");
      const content = document.getElementById("lineupsContent");
      if (!box || !content) return;

      box.classList.remove("hidden");

      if (typeof selectedFixture === "undefined" || !selectedFixture?.id) {
        content.innerHTML = `<p class="muted"><em>Seleziona un match per vedere le formazioni.</em></p>`;
        return;
      }

      content.innerHTML = `<p class="muted"><em>Verifico la formazione ufficiale…</em></p>`;

      let r = null;
      try {
        r = await apiGet(
          `/fixtures/lineups?fixture=${selectedFixture.id}`,
          { retries: 1, delays: [350] },
        );
      } catch (err) {
        console.warn("Official lineup precheck failed", err);
      }

      const hasOfficial = !!(
        r?.ok &&
        !r?.errors &&
        Array.isArray(r?.arr) &&
        r.arr.length > 0
      );

      if (hasOfficial) {
        return original.apply(this, arguments);
      }

      officialLineupPlaceholder(content);
      const btn = document.getElementById("btnLoadEstimatedLineup");
      if (!btn) return;

      btn.addEventListener(
        "click",
        async () => {
          btn.disabled = true;
          btn.textContent = "Caricamento stima…";
          try {
            await original();
          } catch (err) {
            console.error("Estimated lineup load error", err);
            content.innerHTML = `<p class="bad"><em>Non riesco a calcolare la formazione stimata.</em></p>`;
          }
        },
        { once: true },
      );
    };

    wrapped.__crOnDemandFixed = true;
    window.loadLineupsPitch = wrapped;
  }

  function applyAll() {
    if (applied) return;

    if (
      typeof window.showTeam !== "function" ||
      typeof window.apiGet !== "function" ||
      typeof window.loadLineupsPitch !== "function"
    ) {
      setTimeout(applyAll, 80);
      return;
    }

    applied = true;
    applyShowTeamCoordinator();
    applySearchFixes();
    applyFormationFix();
    applyLineupOnDemandFix();
    console.info("Calcio Report hotfix 2026 v2 attivo");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAll, { once: true });
  } else {
    applyAll();
  }
})();
