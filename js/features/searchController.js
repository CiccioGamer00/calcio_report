// js/features/searchController.js
// CALCIO REPORT CORE V2
// Unico ingresso per suggerimenti, selezione squadra e fixture principale.

(() => {
  window.__CR_CORE_V2_SEARCH__ = true;

  const input =
    document.getElementById("teamInput") ||
    document.getElementById("teamSearchInput");
  const btnSearch = document.getElementById("btnSearch");
  const box = document.getElementById("teamSuggestBox");
  const datalist =
    document.getElementById("teamSuggestions") ||
    document.getElementById("teamsList");

  if (!input) return;
  if (box) input.removeAttribute("list");

  const SUGGEST_DEBOUNCE_MS = 300;
  const SUGGEST_CACHE_TTL_MS = 10 * 60 * 1000;
  const suggestCache = new Map();

  let suggestTimer = null;
  let suggestSeq = 0;
  let suggestAbort = null;
  let pendingSuggestion = null;
  let activeSearchAbort = null;
  let lastSuggestQuery = "";
  let lastSuggestItems = [];
  let pointerGesture = null;

  const PREFERRED_CLUBS = new Set([
    "italy|ac milan",
    "italy|inter",
    "italy|juventus",
    "italy|napoli",
    "italy|as roma",
    "italy|lazio",
    "italy|atalanta",
    "italy|bologna",
    "italy|fiorentina",
    "italy|torino",
    "spain|real madrid",
    "spain|barcelona",
    "spain|atletico madrid",
    "england|manchester city",
    "england|manchester united",
    "england|liverpool",
    "england|arsenal",
    "england|chelsea",
    "england|tottenham",
    "germany|bayern munich",
    "germany|borussia dortmund",
    "france|paris saint germain",
  ]);

  const MAJOR_COUNTRIES = new Set([
    "italy",
    "england",
    "spain",
    "germany",
    "france",
    "portugal",
    "netherlands",
  ]);

  function norm(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function currentQuery() {
    return String(input.value || "").trim();
  }

  function safe(value) {
    if (typeof window.safeHTML === "function") return window.safeHTML(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isLocalDebug() {
    return ["localhost", "127.0.0.1"].includes(location.hostname);
  }

  function debug(label, data) {
    if (!isLocalDebug() && !window.DEBUG && !window.API_CONFIG?.debug) return;
    console.debug(`[CR V2] ${label}`, data || "");
  }

  function compactErrors(errors) {
    if (!errors) return "—";
    try {
      const raw = typeof errors === "string" ? errors : JSON.stringify(errors);
      return raw.length > 220 ? `${raw.slice(0, 217)}...` : raw;
    } catch {
      return String(errors);
    }
  }

  function localDiagnostic({ phase, result, team = null, searchId = null }) {
    if (!isLocalDebug()) return "";

    const parts = [
      `fase=${phase}`,
      `searchId=${searchId ?? "—"}`,
      `tipo=${result?.kind || "—"}`,
      `http=${result?.status ?? "—"}`,
      `cacheWorker=${result?.cache || "—"}`,
      `cacheBrowser=${result?.frontendCache || "—"}`,
      `relay=${result?.relay || "—"}`,
    ];

    if (team) {
      parts.push(`team=${team.name || "—"}`);
      parts.push(`id=${team.id || "—"}`);
      parts.push(`paese=${team.country || "—"}`);
    }

    if (result?.errors) parts.push(`errors=${compactErrors(result.errors)}`);

    const text = parts.join(" • ");
    window.__CR_LAST_SEARCH_DEBUG__ = { phase, searchId, team, result, text };

    return `<div class="muted" style="margin-top:10px;font-size:12px;line-height:1.4;word-break:break-word"><code>${safe(text)}</code></div>`;
  }

  function setMatch(html) {
    const el = document.getElementById("match");
    if (el) el.innerHTML = html;
  }

  function hideLineups() {
    document.getElementById("lineupsBox")?.classList.add("hidden");
  }

  function hideSuggestions(clear = false) {
    if (box) {
      box.classList.add("hidden");
      if (clear) box.innerHTML = "";
    }
    if (clear && datalist) datalist.innerHTML = "";
  }

  function mapTeams(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: row?.team?.id ?? null,
        name: row?.team?.name ?? "",
        logo: row?.team?.logo ?? "",
        country: row?.team?.country ?? row?.team?.nation ?? "",
      }))
      .filter((team) => team.id && team.name);
  }

  function preferredClubBoost(team) {
    const key = `${norm(team?.country)}|${norm(team?.name)}`;
    return PREFERRED_CLUBS.has(key) ? 25000 : 0;
  }

  function suggestionScore(team, query) {
    const q = norm(query);
    const name = norm(team?.name);
    const country = norm(team?.country);
    if (!q || !name) return -Infinity;

    let score = 0;
    if (name === q) score += 10000;
    else if (name.startsWith(q)) score += 5000;
    else if (name.split(" ").some((part) => part.startsWith(q))) score += 4000;
    else if (name.includes(q)) score += 3000;
    else return -Infinity;

    score += preferredClubBoost(team);
    if (MAJOR_COUNTRIES.has(country)) score += 300;

    return score - Math.min(name.length, 100);
  }

  function rankTeams(items, query) {
    return (Array.isArray(items) ? items : [])
      .map((team) => ({ team, score: suggestionScore(team, query) }))
      .filter((x) => Number.isFinite(x.score))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.team);
  }

  function rememberSuggestions(query, items) {
    suggestCache.set(norm(query), {
      ts: Date.now(),
      query: String(query || "").trim(),
      items: Array.isArray(items) ? items : [],
    });
  }

  function getExactSuggestCache(query) {
    const key = norm(query);
    const hit = suggestCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > SUGGEST_CACHE_TTL_MS) {
      suggestCache.delete(key);
      return null;
    }
    return hit.items;
  }

  function getReusableSuggestCache(query) {
    const q = norm(query);
    if (!q) return null;

    let best = null;
    for (const [key, entry] of suggestCache.entries()) {
      if (Date.now() - entry.ts > SUGGEST_CACHE_TTL_MS) {
        suggestCache.delete(key);
        continue;
      }

      // Una ricerca precedente più corta contiene un superset utile.
      // Es. risposta di "juv" riusata per "juventus" senza nuova API call.
      if (!q.startsWith(key) || !entry.items?.length) continue;
      if (!best || key.length > best.key.length) best = { key, entry };
    }

    if (!best) return null;
    const filtered = rankTeams(best.entry.items, query);
    return filtered.length ? filtered : null;
  }

  function renderSuggestions(items) {
    const list = (Array.isArray(items) ? items : []).slice(0, 12);
    lastSuggestItems = list;

    if (datalist) {
      datalist.innerHTML = list
        .map((team) => {
          const label = team.country ? `${team.country} — ${team.name}` : team.name;
          return `<option value="${safe(team.name)}" label="${safe(label)}"></option>`;
        })
        .join("");
    }

    if (!box) return;
    if (!list.length) {
      hideSuggestions(true);
      return;
    }

    box.innerHTML = list
      .map((team) => {
        const meta = team.country || "—";
        return `
          <button type="button" class="suggestItem"
            data-team-id="${safe(team.id)}"
            data-team-name="${safe(team.name)}"
            data-team-logo="${safe(team.logo || "")}"
            data-team-country="${safe(team.country || "")}">
            ${team.logo ? `<img class="suggestLogo" src="${safe(team.logo)}" alt="" onerror="this.style.display='none'; this.parentElement.querySelector('.suggestLogoFallback')?.classList.remove('hidden')" />` : ""}
            <span class="suggestLogoFallback ${team.logo ? "hidden" : ""}">⚽</span>
            <span class="suggestText">
              <span class="suggestName">${safe(team.name)}</span>
              <span class="suggestMeta">${safe(meta)}</span>
            </span>
          </button>`;
      })
      .join("");

    box.classList.remove("hidden");
  }

  function bestKnownSuggestion(query) {
    const q = norm(query);

    if (norm(lastSuggestQuery) === q && lastSuggestItems.length) {
      return rankTeams(lastSuggestItems, query)[0] || null;
    }

    const exact = getExactSuggestCache(query);
    if (exact?.length) return rankTeams(exact, query)[0] || null;

    const reusable = getReusableSuggestCache(query);
    return reusable?.[0] || null;
  }

  async function loadSuggestions(query) {
    const q = String(query || "").trim();
    if (q.length < 2) {
      lastSuggestQuery = "";
      lastSuggestItems = [];
      hideSuggestions(true);
      return;
    }

    const seq = ++suggestSeq;
    lastSuggestQuery = q;

    const exact = getExactSuggestCache(q);
    if (exact) {
      if (seq === suggestSeq && norm(currentQuery()) === norm(q)) {
        renderSuggestions(rankTeams(exact, q));
      }
      return;
    }

    const reusable = getReusableSuggestCache(q);
    if (reusable) {
      rememberSuggestions(q, reusable);
      if (seq === suggestSeq && norm(currentQuery()) === norm(q)) {
        renderSuggestions(reusable);
      }
      debug("suggest local reuse", { q, results: reusable.length });
      return;
    }

    suggestAbort?.abort();
    const controller = new AbortController();
    suggestAbort = controller;

    const promise = window.apiGetV2(`/teams?search=${encodeURIComponent(q)}`, {
      retries: 0,
      signal: controller.signal,
      cache: true,
    });

    pendingSuggestion = { key: norm(q), promise, controller };
    const result = await promise;

    if (pendingSuggestion?.promise === promise) pendingSuggestion = null;
    if (seq !== suggestSeq || norm(currentQuery()) !== norm(q)) return;

    debug("suggest", {
      q,
      kind: result.kind,
      status: result.status,
      cache: result.cache,
      relay: result.relay,
      reqId: result.reqId,
    });

    if (result.kind === "success") {
      const items = rankTeams(mapTeams(result.arr), q);
      rememberSuggestions(q, items);
      renderSuggestions(items);
      return;
    }

    if (result.kind === "empty") {
      rememberSuggestions(q, []);
      renderSuggestions([]);
      return;
    }

    if (result.kind !== "aborted") hideSuggestions(false);
  }

  function scheduleSuggestions() {
    clearTimeout(suggestTimer);
    const q = currentQuery();

    if (q.length < 2) {
      ++suggestSeq;
      suggestAbort?.abort();
      pendingSuggestion = null;
      hideSuggestions(true);
      return;
    }

    const reusable = getReusableSuggestCache(q);
    if (reusable) {
      ++suggestSeq;
      suggestAbort?.abort();
      pendingSuggestion = null;
      lastSuggestQuery = q;
      rememberSuggestions(q, reusable);
      renderSuggestions(reusable);
      return;
    }

    suggestTimer = setTimeout(() => {
      loadSuggestions(q).catch((err) => {
        if (err?.name !== "AbortError") console.error("CR V2 suggestions", err);
      });
    }, SUGGEST_DEBOUNCE_MS);
  }

  function resetLegacyPanels() {
    window.__PANEL_LOADED__ = {
      referee: false,
      teamsPanel: false,
      cornersPanel: false,
      shotsPanel: false,
      injuriesPanel: false,
      standingsPanel: false,
      indicatorsPanel: false,
      predictionPanel: false,
    };

    if (typeof window.setOnDemandPanelsPlaceholders === "function") {
      window.setOnDemandPanelsPlaceholders();
    }
  }

  function normalizeFixture(fx) {
    return {
      id: fx?.fixture?.id ?? null,
      date: fx?.fixture?.date ?? null,
      season: fx?.league?.season ?? null,
      leagueId: fx?.league?.id ?? null,
      leagueName: fx?.league?.name ?? "",
      home: {
        id: fx?.teams?.home?.id ?? null,
        name: fx?.teams?.home?.name ?? "",
        logo: fx?.teams?.home?.logo ?? "",
      },
      away: {
        id: fx?.teams?.away?.id ?? null,
        name: fx?.teams?.away?.name ?? "",
        logo: fx?.teams?.away?.logo ?? "",
      },
      referee: fx?.fixture?.referee || "—",
    };
  }

  function validFixture(fixture) {
    return Boolean(
      fixture?.id &&
        fixture?.leagueId &&
        fixture?.season &&
        fixture?.home?.id &&
        fixture?.away?.id,
    );
  }

  function renderMainFixture(
    rawFixture,
    nextTeamFixture,
    team,
    nextOpponentFixture = null,
  ) {
    if (typeof window.renderMatchBasic === "function") {
      setMatch(
        window.renderMatchBasic(
          rawFixture,
          nextTeamFixture || null,
          nextOpponentFixture,
          team.id,
        ),
      );
      return;
    }

    const home = rawFixture?.teams?.home?.name || "Casa";
    const away = rawFixture?.teams?.away?.name || "Trasferta";
    const when = rawFixture?.fixture?.date
      ? new Date(rawFixture.fixture.date).toLocaleString("it-IT")
      : "—";

    setMatch(
      `<div class="matchHero"><div class="mh-main"><div class="mh-name">${safe(home)}</div><div class="mh-score">VS</div><div class="mh-name">${safe(away)}</div></div><div class="mh-meta">${safe(when)}</div></div>`,
    );
  }

  function appendSuccessDiagnostic(result, team, searchId) {
    const html = localDiagnostic({
      phase: "success",
      result,
      team,
      searchId,
    });
    if (html) document.getElementById("match")?.insertAdjacentHTML("beforeend", html);
  }

  async function loadOpponentNext({
    rawFixture,
    fixture,
    nextTeamFixture,
    team,
    searchId,
    signal,
    mainResult,
  }) {
    let opponentId = null;
    if (Number(team.id) === Number(fixture.home.id)) opponentId = fixture.away.id;
    if (Number(team.id) === Number(fixture.away.id)) opponentId = fixture.home.id;
    if (!opponentId) return;

    const result = await window.apiGetV2(
      `/fixtures?team=${encodeURIComponent(opponentId)}&next=2&timezone=Europe/Rome`,
      {
        retries: 0,
        signal,
        searchId,
        cache: true,
      },
    );

    debug("opponent next fixture", {
      searchId,
      opponentId,
      kind: result.kind,
      status: result.status,
      cache: result.cache,
      relay: result.relay,
      reqId: result.reqId,
    });

    if (!window.crIsSearchActive(searchId) || result.kind === "aborted") return;
    if (Number(window.CR_STATE.selection.fixture?.id) !== Number(fixture.id)) return;
    if (result.kind !== "success") return;

    const nextOpponentFixture = (result.arr || []).find(
      (candidate) =>
        candidate?.fixture?.id &&
        Number(candidate.fixture.id) !== Number(fixture.id),
    );
    if (!nextOpponentFixture) return;

    window.CR_STATE.matchExtras.nextOpponent = nextOpponentFixture;
    renderMainFixture(
      rawFixture,
      nextTeamFixture,
      team,
      nextOpponentFixture,
    );
    appendSuccessDiagnostic(mainResult, team, searchId);
  }

  function errorMessage(result, phase) {
    switch (result?.kind) {
      case "auth":
        return "Sessione non valida. Effettua nuovamente il login.";
      case "paywall":
        return "Periodo di prova scaduto o accesso non attivo.";
      case "forbidden":
        return "Accesso non autorizzato.";
      case "rate_limit":
        return "API-Football ha raggiunto il limite temporaneo di richieste.";
      case "network_error":
        return "Problema di rete durante il collegamento al server.";
      case "server_error":
        return "Il server dati ha risposto con un errore temporaneo.";
      case "api_error":
        return "API-Football ha restituito un errore sui dati richiesti.";
      case "parse_error":
        return "Il server ha restituito una risposta non valida.";
      default:
        return phase === "team"
          ? "Non riesco a completare la ricerca della squadra."
          : "Non riesco a caricare il prossimo match.";
    }
  }

  function teamFromApiResult(result, query) {
    if (result?.kind !== "success") return null;
    return rankTeams(mapTeams(result.arr), query)[0] || null;
  }

  async function resolveTeam(
    query,
    forcedTeam,
    preResolvedTeam,
    pendingTeamPromise,
    searchId,
    signal,
  ) {
    if (forcedTeam?.id && forcedTeam?.name) return { team: forcedTeam, source: "click" };
    if (preResolvedTeam?.id && preResolvedTeam?.name) {
      return { team: preResolvedTeam, source: "suggestion-cache" };
    }

    if (pendingTeamPromise) {
      const pendingResult = await pendingTeamPromise;
      if (!window.crIsSearchActive(searchId)) return { stale: true };

      const pendingTeam = teamFromApiResult(pendingResult, query);
      if (pendingTeam) return { team: pendingTeam, source: "suggestion-inflight" };
      if (pendingResult?.kind && pendingResult.kind !== "aborted") {
        return { result: pendingResult };
      }
    }

    const result = await window.apiGetV2(`/teams?search=${encodeURIComponent(query)}`, {
      retries: 0,
      signal,
      searchId,
      cache: true,
    });

    debug("team lookup", {
      searchId,
      kind: result.kind,
      status: result.status,
      cache: result.cache,
      reqId: result.reqId,
    });

    if (!window.crIsSearchActive(searchId)) return { stale: true };
    if (result.kind !== "success") return { result };

    const team = rankTeams(mapTeams(result.arr), query)[0] || null;
    return team
      ? { team, source: "team-api" }
      : { result: { ...result, kind: "empty" } };
  }

  async function startTeamSearch(forcedTeam = null) {
    const query = String(forcedTeam?.name || currentQuery()).trim();
    if (query.length < 2) return;

    const queryKey = norm(query);
    const preResolvedTeam = forcedTeam || bestKnownSuggestion(query);
    const pendingTeamPromise =
      pendingSuggestion?.key === queryKey ? pendingSuggestion.promise : null;

    clearTimeout(suggestTimer);
    ++suggestSeq;

    if (!pendingTeamPromise) {
      suggestAbort?.abort();
      pendingSuggestion = null;
    }

    hideSuggestions(true);

    activeSearchAbort?.abort();
    activeSearchAbort = new AbortController();

    const searchId = window.crNextSearchId(query);
    const signal = activeSearchAbort.signal;

    hideLineups();
    resetLegacyPanels();
    setMatch(`<p class="muted"><em>Caricamento match...</em></p>`);

    if (typeof window.markWelcomeDone === "function") window.markWelcomeDone();

    if (btnSearch) {
      btnSearch.disabled = true;
      btnSearch.dataset.oldText = btnSearch.textContent || "Cerca";
      btnSearch.textContent = "Cerco…";
    }

    try {
      const teamResolved = await resolveTeam(
        query,
        forcedTeam,
        preResolvedTeam,
        pendingTeamPromise,
        searchId,
        signal,
      );

      if (!window.crIsSearchActive(searchId) || teamResolved?.stale) return;

      if (!teamResolved?.team) {
        const result = teamResolved?.result || { kind: "empty" };
        if (result.kind === "aborted") return;

        if (result.kind === "empty") {
          window.crSetSearchFailure(searchId, "empty", null);
          setMatch(
            `<p class="bad"><em>Nessuna squadra trovata per "${safe(query)}".</em></p>${localDiagnostic({ phase: "team", result, searchId })}`,
          );
        } else {
          window.crSetSearchFailure(searchId, "error", result);
          setMatch(
            `<p class="bad"><em>${safe(errorMessage(result, "team"))}</em></p>${localDiagnostic({ phase: "team", result, searchId })}`,
          );
        }
        return;
      }

      const team = teamResolved.team;
      input.value = team.name;

      debug("team selected", {
        searchId,
        source: teamResolved.source,
        team,
      });

      const fixtureResult = await window.apiGetV2(
        `/fixtures?team=${encodeURIComponent(team.id)}&next=2&timezone=Europe/Rome`,
        {
          retries: 0,
          signal,
          searchId,
          cache: true,
        },
      );

      debug("main fixture", {
        searchId,
        team,
        kind: fixtureResult.kind,
        status: fixtureResult.status,
        results: fixtureResult.arr?.length || 0,
        cache: fixtureResult.cache,
        relay: fixtureResult.relay,
        reqId: fixtureResult.reqId,
      });

      if (!window.crIsSearchActive(searchId)) return;
      if (fixtureResult.kind === "aborted") return;

      if (fixtureResult.kind === "empty") {
        window.crSetSearchFailure(searchId, "empty", null);
        setMatch(
          `<p class="bad"><em>Nessun prossimo match trovato per "${safe(team.name)}".</em></p>${localDiagnostic({ phase: "fixture", result: fixtureResult, team, searchId })}`,
        );
        return;
      }

      if (fixtureResult.kind !== "success") {
        window.crSetSearchFailure(searchId, "error", fixtureResult);
        setMatch(
          `<p class="bad"><em>${safe(errorMessage(fixtureResult, "fixture"))}</em></p>${localDiagnostic({ phase: "fixture", result: fixtureResult, team, searchId })}`,
        );
        return;
      }

      const uniqueFixtures = [];
      const seen = new Set();
      for (const fx of fixtureResult.arr || []) {
        const fixtureId = fx?.fixture?.id ?? null;
        if (!fixtureId || seen.has(fixtureId)) continue;
        seen.add(fixtureId);
        uniqueFixtures.push(fx);
        if (uniqueFixtures.length >= 2) break;
      }

      const rawFixture = uniqueFixtures[0] || null;
      const nextTeamFixture = uniqueFixtures[1] || null;
      const fixture = normalizeFixture(rawFixture);

      if (!rawFixture || !validFixture(fixture)) {
        const result = { kind: "invalid_fixture", status: fixtureResult.status };
        window.crSetSearchFailure(searchId, "error", result);
        setMatch(
          `<p class="bad"><em>Il prossimo match ricevuto non contiene tutti i dati necessari.</em></p>${localDiagnostic({ phase: "fixture-validate", result, team, searchId })}`,
        );
        return;
      }

      if (!window.crCommitSelection(searchId, team, fixture)) return;

      window.CR_STATE.matchExtras.nextTeam = nextTeamFixture;
      renderMainFixture(rawFixture, nextTeamFixture, team);
      appendSuccessDiagnostic(fixtureResult, team, searchId);

      window.__CR_LAST_SEARCH_DEBUG__ = {
        phase: "success",
        searchId,
        team,
        fixture,
        source: teamResolved.source,
      };

      debug("selection committed", {
        searchId,
        source: teamResolved.source,
        teamId: team.id,
        fixtureId: fixture.id,
      });

      loadOpponentNext({
        rawFixture,
        fixture,
        nextTeamFixture,
        team,
        searchId,
        signal,
        mainResult: fixtureResult,
      }).catch((err) => {
        if (window.crIsSearchActive(searchId) && err?.name !== "AbortError") {
          console.error("CR V2 opponent next fixture", err);
        }
      });
    } catch (err) {
      if (!window.crIsSearchActive(searchId) || err?.name === "AbortError") return;

      const failure = {
        kind: "controller_error",
        status: 0,
        errors: { message: String(err?.message || err || "unknown error") },
      };
      window.crSetSearchFailure(searchId, "error", failure);
      setMatch(
        `<p class="bad"><em>Errore imprevisto durante la ricerca.</em></p>${localDiagnostic({ phase: "controller", result: failure, searchId })}`,
      );
      console.error("CR V2 search", err);
    } finally {
      if (window.crIsSearchActive(searchId) && btnSearch) {
        btnSearch.disabled = false;
        btnSearch.textContent = btnSearch.dataset.oldText || "Cerca";
        delete btnSearch.dataset.oldText;
      }
    }
  }

  input.addEventListener(
    "input",
    (event) => {
      scheduleSuggestions();
      event.stopImmediatePropagation();
    },
    true,
  );

  input.addEventListener(
    "change",
    (event) => event.stopImmediatePropagation(),
    true,
  );

  input.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      startTeamSearch().catch((err) => console.error("CR V2 Enter", err));
    },
    true,
  );

  input.addEventListener(
    "focus",
    (event) => {
      event.stopImmediatePropagation();
      const q = currentQuery();
      const items = getReusableSuggestCache(q) || getExactSuggestCache(q);
      if (q.length >= 2 && items?.length) {
        lastSuggestQuery = q;
        renderSuggestions(items);
      }
    },
    true,
  );

  input.addEventListener(
    "blur",
    (event) => {
      event.stopImmediatePropagation();
      setTimeout(() => hideSuggestions(false), 120);
    },
    true,
  );

  btnSearch?.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      startTeamSearch().catch((err) => console.error("CR V2 Search button", err));
    },
    true,
  );

  if (box) {
    const MOVE_THRESHOLD = 12;

    box.addEventListener(
      "pointerdown",
      (event) => {
        const item = event.target?.closest?.(".suggestItem");
        if (!item) return;

        event.stopImmediatePropagation();
        pointerGesture = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        };
      },
      true,
    );

    box.addEventListener(
      "pointermove",
      (event) => {
        if (!pointerGesture || pointerGesture.pointerId !== event.pointerId) return;
        const dx = Math.abs(event.clientX - pointerGesture.x);
        const dy = Math.abs(event.clientY - pointerGesture.y);
        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) pointerGesture.moved = true;
      },
      true,
    );

    box.addEventListener(
      "pointercancel",
      (event) => {
        if (pointerGesture?.pointerId === event.pointerId) pointerGesture = null;
      },
      true,
    );

    box.addEventListener(
      "click",
      (event) => {
        const item = event.target?.closest?.(".suggestItem");
        if (!item) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const moved = Boolean(pointerGesture?.moved);
        pointerGesture = null;
        if (moved) return;

        const team = {
          id: Number(item.getAttribute("data-team-id") || 0) || null,
          name: item.getAttribute("data-team-name") || "",
          logo: item.getAttribute("data-team-logo") || "",
          country: item.getAttribute("data-team-country") || "",
        };
        if (!team.id || !team.name) return;

        input.value = team.name;
        hideSuggestions(true);
        startTeamSearch(team).catch((err) => console.error("CR V2 suggestion", err));
      },
      true,
    );
  }

  window.startTeamSearch = startTeamSearch;

  setTimeout(() => {
    window.showTeam = (forcedTeam = null) => startTeamSearch(forcedTeam);
  }, 0);
})();
