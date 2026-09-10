// js/state.js
// CALCIO REPORT CORE V2
// Stato centrale retrocompatibile con il frontend attuale.

let selectedTeam = null;
let selectedFixture = null;

const UI_STATE = {
  refList: false,
  refTeam: false,
  teamList: false,
  teamCards: false,
  cornersList: false,
  cornersPerMatch: false,
  shotsList: false,
  shotsPerMatch: false,
  injuriesList: true,
};

const CR_PANEL_NAMES = [
  "referee",
  "teamsPanel",
  "cornersPanel",
  "shotsPanel",
  "injuriesPanel",
  "standingsPanel",
  "indicatorsPanel",
  "predictionPanel",
];

function makePanelState() {
  return {
    status: "idle", // idle | loading | success | empty | error
    loaded: false,
    fixtureId: null,
    searchId: 0,
    error: null,
  };
}

function makePanelsState() {
  return Object.fromEntries(CR_PANEL_NAMES.map((name) => [name, makePanelState()]));
}

const CR_STATE = {
  search: {
    activeId: 0,
    status: "idle", // idle | searching | success | empty | error
    query: "",
    error: null,
  },

  selection: {
    team: null,
    fixture: null,
  },

  matchExtras: {
    nextTeam: null,
    nextOpponent: null,
    standingsMini: null,
    officialLineup: null,
  },

  panels: makePanelsState(),
};

function crNextSearchId(query = "") {
  CR_STATE.search.activeId += 1;
  CR_STATE.search.status = "searching";
  CR_STATE.search.query = String(query || "").trim();
  CR_STATE.search.error = null;

  CR_STATE.selection.team = null;
  CR_STATE.selection.fixture = null;
  CR_STATE.matchExtras.nextTeam = null;
  CR_STATE.matchExtras.nextOpponent = null;
  CR_STATE.matchExtras.standingsMini = null;
  CR_STATE.matchExtras.officialLineup = null;
  CR_STATE.panels = makePanelsState();

  // Compatibilità temporanea col codice legacy.
  selectedTeam = null;
  selectedFixture = null;

  return CR_STATE.search.activeId;
}

function crIsSearchActive(searchId) {
  return Number(searchId) === Number(CR_STATE.search.activeId);
}

function crCommitSelection(searchId, team, fixture) {
  if (!crIsSearchActive(searchId)) return false;
  if (!team?.id || !fixture?.id) return false;

  CR_STATE.selection.team = team;
  CR_STATE.selection.fixture = fixture;
  CR_STATE.search.status = "success";
  CR_STATE.search.error = null;

  // Compatibilità temporanea col codice legacy.
  selectedTeam = team;
  selectedFixture = fixture;

  return true;
}

function crSetSearchFailure(searchId, status, error = null) {
  if (!crIsSearchActive(searchId)) return false;
  CR_STATE.search.status = status === "empty" ? "empty" : "error";
  CR_STATE.search.error = error;
  return true;
}

function crSetPanelState(panelName, patch = {}) {
  if (!CR_STATE.panels[panelName]) CR_STATE.panels[panelName] = makePanelState();
  Object.assign(CR_STATE.panels[panelName], patch || {});
  return CR_STATE.panels[panelName];
}

function crResetPanelState(panelName) {
  CR_STATE.panels[panelName] = makePanelState();
  return CR_STATE.panels[panelName];
}

window.CR_STATE = CR_STATE;
window.crNextSearchId = crNextSearchId;
window.crIsSearchActive = crIsSearchActive;
window.crCommitSelection = crCommitSelection;
window.crSetSearchFailure = crSetSearchFailure;
window.crSetPanelState = crSetPanelState;
window.crResetPanelState = crResetPanelState;
