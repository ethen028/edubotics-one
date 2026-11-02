// Checks the read-only agent loop with a fake Claude API and a fake sandbox. No network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgentTask } from "../src/lib/agent/claude-loop";
import type { SandboxResult } from "../src/lib/agent/sandbox";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function scripted(responses: unknown[]) {
  const requests: Array<{ tools: Array<{ name: string }>; messages: Array<{ role: string; content: unknown }> }> = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const next = responses.shift();
    if (!next) throw new Error("no more scripted responses");
    return json(next);
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const catalog = {
  types: "type Claim = { id: string };",
  entries: [
    {
      name: "summarizeClaims",
      description: "counts and money totals per status for claims in a month",
      declaration: "summarizeClaims(args: { month?: string }): Promise<ClaimSummary>;",
    },
    {
      name: "getClaim",
      description: "one claim by id",
      declaration: "getClaim(args: { id: string }): Promise<Claim | null>;",
    },
  ],
};

const base = { task: "How much is pending?", catalog, callApi: async () => null, apiKey: "test-key" };

test("the agent runs code, sends the output back, and returns Claude's final answer", async () => {
  const { fetchImpl, requests } = scripted([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "run_code", input: { code: "console.log(1)" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Pending total is 1,200.00." }] },
  ]);
  const ran: string[] = [];
  const result = await runAgentTask({
    ...base,
    fetchImpl,
    runSandbox: async ({ code }): Promise<SandboxResult> => {
      ran.push(code);
      return { ok: true, logs: ["1200.00"] };
    },
  });
  assert.equal(result.answer, "Pending total is 1,200.00.");
  assert.equal(result.turns, 2);
  assert.deepEqual(ran, ["console.log(1)"]);
  const sent = requests[1].messages.at(-1)!.content as Array<{ tool_use_id: string; content: string; is_error: boolean }>;
  assert.equal(sent[0].tool_use_id, "t1");
  assert.equal(sent[0].is_error, false);
  assert.match(sent[0].content, /1200\.00/);
});

test("search_api returns matching declarations without running any code", async () => {
  const { fetchImpl, requests } = scripted([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "s1", name: "search_api", input: { query: "totals" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] },
  ]);
  let ran = false;
  await runAgentTask({ ...base, fetchImpl, runSandbox: async () => ((ran = true), { ok: true, logs: [] }) });
  assert.equal(ran, false);
  const sent = requests[1].messages.at(-1)!.content as Array<{ tool_use_id: string; is_error?: boolean; content: string }>;
  assert.equal(sent[0].tool_use_id, "s1");
  assert.equal(sent[0].is_error, undefined);
  assert.match(sent[0].content, /summarizeClaims\(args/);
  assert.doesNotMatch(sent[0].content, /getClaim\(args/);
});

test("both tools are offered to Claude, and the full declarations are not in the tool description", async () => {
  const { fetchImpl, requests } = scripted([{ stop_reason: "end_turn", content: [{ type: "text", text: "hi" }] }]);
  await runAgentTask({ ...base, fetchImpl });
  assert.deepEqual(requests[0].tools.map((t) => t.name), ["search_api", "run_code"]);
  assert.doesNotMatch(JSON.stringify(requests[0].tools), /getClaim\(args/);
});

test("a failed run is sent back as an error so Claude can try again", async () => {
  const { fetchImpl, requests } = scripted([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "run_code", input: { code: "x" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "I could not read that." }] },
  ]);
  await runAgentTask({
    ...base,
    fetchImpl,
    runSandbox: async () => ({ ok: false, logs: [], error: "Timed out" }),
  });
  const sent = requests[1].messages.at(-1)!.content as Array<{ is_error: boolean }>;
  assert.equal(sent[0].is_error, true);
});

test("a tool call with the wrong shape is refused without running anything", async () => {
  const { fetchImpl, requests } = scripted([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "run_code", input: { code: 42 } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] },
  ]);
  let ran = false;
  await runAgentTask({ ...base, fetchImpl, runSandbox: async () => ((ran = true), { ok: true, logs: [] }) });
  assert.equal(ran, false);
  const sent = requests[1].messages.at(-1)!.content as Array<{ is_error: boolean }>;
  assert.equal(sent[0].is_error, true);
});

test("the loop stops after maxTurns instead of running forever", async () => {
  const toolUse = { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "run_code", input: { code: "x" } }] };
  const { fetchImpl } = scripted([toolUse, toolUse, toolUse]);
  await assert.rejects(
    runAgentTask({ ...base, fetchImpl, maxTurns: 3, runSandbox: async () => ({ ok: true, logs: [] }) }),
    /did not finish within 3 steps/,
  );
});

test("without an API key the loop refuses to start", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(
      runAgentTask({ ...base, apiKey: undefined, fetchImpl: (async () => json({})) as typeof fetch }),
      /ANTHROPIC_API_KEY is not set/,
    );
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("an HTTP error from Claude is reported without echoing the response body", async () => {
  await assert.rejects(
    runAgentTask({ ...base, fetchImpl: (async () => new Response("secret body", { status: 500 })) as typeof fetch }),
    /HTTP 500/,
  );
});
