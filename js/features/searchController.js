// js/features/searchController.js
// Controller ricerca caricato esplicitamente da index.html.
// Evita ricerche duplicate e rende il bottone Cerca indipendente dagli hotfix.

(() => {
  const input =
    document.getElementById("teamInput") ||
    document.getElementById("teamSearchInput");
  const btn = document.getElementById("btnSearch");
  const box = document.getElementById("teamSuggestBox");

  if (!input || !btn) return;

  let lastGoodItems = [];
  let restoreTimer = null;
  let searchPromise = null;

  const norm = (v) => String(v || "").trim().toLowerCase();
  const clean = (v) =>
    typeof window.sanitizeSearch === "function"
      ? window.sanitizeSearch(v)
      : String(v || "").trim();

  function readItemsFromBox() {
    if (!box) return [];
    return Array.from(box.querySelectorAll(".suggestItem"))
      .map((el) => ({
        id: Number(el.getAttribute("data-team-id") || 0) || null,
        name: el.getAttribute("data-team-name") || "",
        logo: el.getAttribute("data-team-logo") || "",
        country: el.querySelector(".suggestMeta")?.textContent?.trim() || "",
      }))
      .filter((x) => x.id && x.name);
  }

  function rememberVisibleSuggestions() {
    const items = readItemsFromBox();
    if (items.length) lastGoodItems = items;
  }

  function matchingLocal(query) {
    const q = norm(query);
    if (!q) return [];
    return lastGoodItems.filter((x) => norm(x.name).includes(q));
  }

  // Il vecchio teamFlow aveva un listener change che poteva rilanciare showTeam
  // al primo click fuori dall'input. Intercettiamo il change prima che raggiunga il target.
  document.addEventListener(
    "change",
    (e) => {
      if (e.target === input) e.stopPropagation();
    },
    true,
  );

  // Se la query più lunga torna vuota (es. mil -> mila -> milan),
  // conserva il suggerimento valido già ricevuto invece di far sparire la tendina.
  input.addEventListener("input", () => {
    rememberVisibleSuggestions();
    clearTimeout(restoreTimer);

    const q = clean(input.value);
    if (q.length < 2) return;

    restoreTimer = setTimeout(() => {
      const current = readItemsFromBox();
      const currentMatch = current.some((x) => norm(x.name).includes(norm(q)));
      if (currentMatch) {
        lastGoodItems = current;
        return;
      }

      const local = matchingLocal(q);
      if (local.length && typeof window.updateDatalist === "function") {
        window.updateDatalist(local);
      }
    }, 360);
  });

  input.addEventListener("focus", () => {
    const q = clean(input.value);
    if (q.length < 2) return;
    const local = matchingLocal(q);
    if (local.length && typeof window.updateDatalist === "function") {
      window.updateDatalist(local);
    }
  });

  async function runSearch() {
    const q = clean(input.value);
    if (q.length < 2 || searchPromise) return searchPromise;

    rememberVisibleSuggestions();

    let forced = null;
    if (typeof window.findSuggestedByName === "function") {
      forced = window.findSuggestedByName(input.value);
    }
    if (!forced) {
      const local = matchingLocal(q);
      forced =
        local.find((x) => norm(x.name) === norm(q)) ||
        local[0] ||
        null;
    }

    const oldText = btn.textContent || "Cerca";
    btn.disabled = true;
    btn.textContent = "Cerco…";

    try {
      if (typeof window.markWelcomeDone === "function") {
        window.markWelcomeDone();
      }
      if (typeof window.hideSuggestBox === "function") {
        window.hideSuggestBox();
      }

      if (typeof window.showTeam !== "function") return;
      searchPromise = Promise.resolve(window.showTeam(forced));
      await searchPromise;
    } finally {
      searchPromise = null;
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    runSearch().catch((err) => console.error("Search controller", err));
  });
})();
