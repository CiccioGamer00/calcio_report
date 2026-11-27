const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Miniflare } = require("miniflare");

async function main() {
  const root = path.resolve(__dirname, "../..");
  const storage = await mkdtemp(path.join(tmpdir(), "onb-04a-"));
  const calls = [];
  const seed = "GuestSeed " + "a".repeat(64);
  function start(flag) {
    return new Miniflare({
      modules: true,
      modulesRoot: root,
      scriptPath: path.join(root, "worker/worker.js"),
      compatibilityDate: "2026-07-01",
      d1Databases: ["DB"],
      d1Persist: storage,
      bindings: { GUEST_ENABLED: flag, GUEST_SECRET: "local-guest", CR_RELAY_SECRET: "local-relay",
        CR_RELAY_URL: "https://relay.invalid" },
      outboundService(request) {
        const url = new URL(request.url);
        calls.push(url.href);
        assert.equal(url.origin + url.pathname, "https://relay.invalid/fixtures");
        const team = Number(url.searchParams.get("team"));
        assert.ok([1, 3].includes(team));
        const fixture = {
          fixture: { id: team === 1 ? 101 : 202, date: "2026-12-01T18:00:00Z" },
          league: { id: 135, season: 2026 },
          teams: { home: { id: team, name: "Home" }, away: { id: team + 1, name: "Away" } }
        };
        return Response.json({ response: [fixture], errors: [] });
      }
    });
  }
  let mf;
  async function request(route, authorization, expected, method = "POST") {
    const response = await mf.dispatchFetch("https://guest.invalid/guest/" + route, {
      method, headers: { authorization }
    });
    const data = await response.json();
    assert.equal(response.status, expected, route + " " + (data.error || response.status));
    return data;
  }
  try {
    mf = start("0");
    const db = await mf.getD1Database("DB");
    for (const file of ["tests/fixtures/account-schema.sql", "worker/migrations/guest-v1.sql"]) {
      const sql = await readFile(path.join(root, file), "utf8");
      // Both schema files contain only table/index DDL and full-line comments.
      const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean);
      await db.batch(statements.map(s => db.prepare(s)));
    }
    await request("session", seed, 404);
    assert.equal(calls.length, 0);
    await mf.dispose();
    mf = start("1");
    const session = await request("session", seed, 200);
    assert.equal(session.fixture, null);
    const auth = "Guest " + session.token;
    const { ticket } = await request("resolve?team=1", auth, 200);
    const opened = await request("open?ticket=" + ticket, auth, 200);
    assert.equal(opened.fixture.fixture.id, 101);
    const denied = await request("resolve?team=3", auth, 409);
    assert.equal(denied.error, "GUEST_SECOND_FIXTURE");
    assert.deepEqual(denied.first, opened.fixture);
    assert.equal(calls.length, 2);
    await mf.dispose();
    mf = start("1");
    const resumed = await request("session", seed, 200);
    assert.deepEqual(resumed.fixture, opened.fixture);
    const resumedAuth = "Guest " + resumed.token;
    const reopened = await request("fixtures?id=101&timezone=Europe/Rome", resumedAuth, 200, "GET");
    assert.deepEqual(reopened.response, [opened.fixture]);
    for (const premium of ["predict", "indicators"]) {
      await request(premium, resumedAuth, 403, "GET");
    }
    assert.equal(calls.length, 2);
    console.log("PASS ONB-04A: flag off 404, session 200, open 101, second 409, restart/reopen 101, premium 403/403, mock calls 2");
  } finally {
    try { await mf?.dispose(); } finally { await rm(storage, { recursive: true, force: true }); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
