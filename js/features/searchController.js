// js/features/searchController.js
// Controller ricerca caricato PRIMA di teamFlow.js.
// Evita il doppio avvio sul change e rende operativo il bottone Cerca.

(() => {
  const input =
    document.getElementById("teamInput") ||
    document.getElementById("teamSearchInput");
  const btn = document.getElementById("btnSearch");

  if (!input) return;

  // IMPORTANTISSIMO: registrato prima del listener "change" di teamFlow.
  // Così un blur/click sui tab non può rilanciare una seconda ricerca.
  input.addEventListener(
    "change",
    (e) => {
      e.stopImmediatePropagation();
    },
    true,
  );

  function hideLineups() {
    document.getElementById("lineupsBox")?.classList.add("hidden");
  }

  async function runSearch() {
    const q = String(input.value || "").trim();
    if (q.length < 2 || typeof window.showTeam !== "function") return;

    hideLineups();

    if (typeof window.markWelcomeDone === "function") {
      window.markWelcomeDone();
    }

    let forced = null;
    if (typeof window.findSuggestedByName === "function") {
      forced = window.findSuggestedByName(input.value);
    }

    if (btn) {
      btn.disabled = true;
      btn.dataset.oldText = btn.textContent || "Cerca";
      btn.textContent = "Cerco…";
    }

    try {
      await window.showTeam(forced || null);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.oldText || "Cerca";
        delete btn.dataset.oldText;
      }
    }
  }

  btn?.addEventListener("click", (e) => {
    e.preventDefault();
    runSearch().catch((err) => console.error("Search controller", err));
  });

  // Dopo che teamFlow è stato caricato, protegge l'ultimo suggerimento valido:
  // se una ricerca più lunga torna vuota (es. mil -> milan), non cancella
  // un risultato già coerente come AC Milan.
  setTimeout(() => {
    if (
      typeof window.updateDatalist !== "function" ||
      window.updateDatalist.__crStableSuggestions
    ) {
      return;
    }

    const original = window.updateDatalist;
    let lastGood = [];

    const wrapped = function (items) {
      const list = Array.isArray(items) ? items : [];
      if (list.length) {
        lastGood = list;
        return original.call(this, list);
      }

      const q = String(input.value || "").trim().toLowerCase();
      const compatible = lastGood.filter((x) =>
        String(x?.name || "").toLowerCase().includes(q),
      );

      if (q.length >= 2 && compatible.length) {
        return original.call(this, compatible);
      }

      return original.call(this, list);
    };

    wrapped.__crStableSuggestions = true;
    window.updateDatalist = wrapped;
  }, 0);
})();
