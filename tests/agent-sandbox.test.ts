// Runs the real runner (agent-sandbox/runner.mjs) in a plain Node process, with the same message protocol
// the Docker container uses. Docker itself is not tested here.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { dockerSandboxArgs, runInSandbox } from "../src/lib/agent/sandbox";

const RUNNER = path.resolve(process.cwd(), "agent-sandbox/runner.mjs");
const run = (code: string, call: (m: string, a: unknown) => Promise<unknown>, extra: { timeoutMs?: number; maxCalls?: number } = {}) =>
  runInSandbox({
    code,
    methods: ["summarize", "boom"],
    call,
    command: process.execPath,
    commandArgs: [RUNNER],
    ...extra,
  });

test("code can call the API through the host and print what it needs", async () => {
  const calls: Array<[string, unknown]> = [];
  const r = await run(
    `const s = await api.summarize({ scope: "mine" }); console.log("count", s.count); return 1;`,
    async (m, a) => {
      calls.push([m, a]);
      return { count: 3 };
    },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.logs, ["count 3"]);
  assert.deepEqual(calls, [["summarize", { scope: "mine" }]]);
});

test("errors thrown by the code come back as a failed run, not a crash", async () => {
  const r = await run(`throw new Error("bad month");`, async () => null);
  assert.equal(r.ok, false);
  assert.equal(r.error, "bad month");
});

test("a function the host does not offer cannot be reached", async () => {
  const r = await run(`await api.deleteEverything({});`, async () => null);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /deleteEverything/);
});

test("errors from the host API reach the code, which can handle them", async () => {
  const r = await run(
    `try { await api.boom({}); } catch (e) { console.log("caught:", e.message); }`,
    async () => {
      throw new Error("Unknown status");
    },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.logs, ["caught: Unknown status"]);
});

test("an endless loop is stopped at the time limit", async () => {
  const r = await run(`while (true) {}`, async () => null, { timeoutMs: 500 });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /Timed out/);
});

test("too many API calls stop the run", async () => {
  const r = await run(`for (;;) { await api.summarize({}); }`, async () => 1, { maxCalls: 5 });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /More than 5 API calls/);
});

test("the container is started with no network and a read-only disk", () => {
  const args = dockerSandboxArgs("orbit-agent-test", "img");
  for (const flag of ["--network", "none", "--read-only", "--cap-drop", "ALL", "--user", "65534:65534"]) {
    assert.ok(args.includes(flag), `missing ${flag}`);
  }
  assert.equal(args.at(-1), "img");
});
