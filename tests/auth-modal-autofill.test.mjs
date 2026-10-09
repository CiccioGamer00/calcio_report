import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(resolve(root, "app.js"), "utf8");

const functionStart = app.indexOf("function setupModalClose() {");
const functionEnd = app.indexOf("\nfunction goToPayment(", functionStart);
assert.ok(functionStart >= 0 && functionEnd > functionStart);
const source = app.slice(functionStart, functionEnd);

function makeElement() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, cb) { listeners.set(name, cb); },
  };
}

const close = makeElement();
const modal = makeElement();
let closes = 0;
const context = {
  document: {
    getElementById(id) { return id === "btnCloseAuth" ? close : id === "authModal" ? modal : null; },
  },
  closeAuthModal() { closes++; },
};
vm.runInNewContext(source + "\nsetupModalClose();", context);

assert.equal(close.listeners.has("click"), true, "La X deve chiudere il popup");
assert.equal(modal.listeners.has("click"), false, "Il backdrop non deve chiudere il popup durante l'autocompletamento");
close.listeners.get("click")();
assert.equal(closes, 1, "La chiusura esplicita deve funzionare");
console.log("PASS: login modal stays open on backdrop/autofill; close button works");
