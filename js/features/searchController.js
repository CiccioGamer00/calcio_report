// js/features/searchController.js
// Controller ricerca caricato PRIMA di teamFlow.js.
// Evita il doppio avvio sul change, rende operativo il bottone Cerca
// e rende la tendina scrollabile in sicurezza su touch.

(() => {
  const input =
    document.getElementById("teamInput") ||
    document.getElementById("teamSearchInput");
  const btn = document.getElementById("btnSearch");
  const box = document.getElementById("teamSuggestBox");

  if (!input) return;

  // Registrato prima del listener "change" di teamFlow.
  // Un blur/click sui tab non può rilanciare una seconda ricerca.
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

  function hideSuggestions() {
    if (!box) return;
    box.classList.add("hidden");
    box.innerHTML = "";
  }

  async function runSearch(forcedTeam = null) {
    const q = String(input.value || "").trim();
    if (q.length < 2 || typeof window.showTeam !== "function") return;

    hideLineups();

    if (typeof window.markWelcomeDone === "function") {
      window.markWelcomeDone();
    }

    let forced = forcedTeam;
    if (!forced && typeof window.findSuggestedByName === "function") {
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

  // TOUCH: teamFlow seleziona su pointerdown, ottimo col mouse ma pericoloso
  // su smartphone perché il primo contatto di uno swipe viene scambiato per tap.
  // Intercettiamo touch/pen prima di teamFlow e selezioniamo solo su pointerup
  // se il dito non si è mosso abbastanza da essere uno scroll.
  if (box) {
    let touch = null;
    const MOVE_THRESHOLD = 12;

    box.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;

        const item = e.target?.closest?.(".suggestItem");
        if (!item) return;

        e.stopImmediatePropagation();
        touch = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          moved: false,
          item,
        };
      },
      true,
    );

    box.addEventListener(
      "pointermove",
      (e) => {
        if (!touch || e.pointerId !== touch.pointerId) return;
        const dx = Math.abs(e.clientX - touch.x);
        const dy = Math.abs(e.clientY - touch.y);
        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) touch.moved = true;
      },
      true,
    );

    box.addEventListener(
      "pointercancel",
      (e) => {
        if (touch && e.pointerId === touch.pointerId) touch = null;
      },
      true,
    );

    box.addEventListener(
      "pointerup",
      (e) => {
        if (!touch || e.pointerId !== touch.pointerId) return;

        e.stopImmediatePropagation();
        const current = touch;
        touch = null;

        if (current.moved) return;

        const id = Number(current.item.getAttribute("data-team-id") || 0) || null;
        const name = current.item.getAttribute("data-team-name") || "";
        const logo = current.item.getAttribute("data-team-logo") || "";
        if (!id || !name) return;

        input.value = name;
        hideSuggestions();

        runSearch({ id, name, logo }).catch((err) =>
          console.error("Touch suggestion search", err),
        );
      },
      true,
    );
  }

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
