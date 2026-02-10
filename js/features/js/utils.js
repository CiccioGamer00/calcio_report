// js/utils.js

function safeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// API search: solo lettere/numeri/spazi
function sanitizeSearch(s) {
  return String(s ?? "")
    .replace(/[^0-9a-zA-ZÀ-ÖØ-öø-ÿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePositionIT(pos) {
  const p = String(pos || "").trim().toLowerCase();
  if (!p) return null;

  const map = {
    goalkeeper: "Portiere",
    "goal keeper": "Portiere",
    defender: "Difensore",
    midfielder: "Centrocampista",
    attacker: "Attaccante",
    forward: "Attaccante",
    striker: "Attaccante",
  };
  return map[p] || pos; // se non riconosco, lascio com’è
}