// The read-only agent loop: ask Claude, let it search the API catalog, run the code it writes in the sandbox,
// send the output back, repeat. No database or auth imports, so it can be tested with a fake fetch and a fake sandbox.
import type { ApiCatalog } from "./catalog";
import { searchCatalog } from "./catalog";
import { runInSandbox, type SandboxCall, type SandboxResult, type SandboxRunner } from "./sandbox";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_MODEL = "claude-sonnet-5-5";
const RESULT_CHAR_LIMIT = 8000;

export type AgentTaskOptions = {
  task: string;
  /** The functions the sandbox offers, which the model finds with search_api. */
  catalog: ApiCatalog;
  /** Runs one API call for the person the agent works for. Permission checks happen here. */
  callApi: SandboxCall;
  maxTurns?: number;
  model?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  runSandbox?: SandboxRunner;
};

export type AgentTaskResult = { answer: string; turns: number };

const SYSTEM = [
  "You answer questions about Orbit data. You cannot change anything.",
  "First find the functions you need with search_api. Then write JavaScript and run it with run_code.",
  "In run_code, the global `api` has the functions search_api returned. Call them with await and print what you need with console.log.",
  "Money comes back as decimal strings. Use a summary function for totals instead of adding amounts yourself.",
  "Use only what the functions return. If nothing matches what was asked, say so; do not guess.",
  "When you have the answer, reply in plain English, short, with the figures and the month they cover.",
].join(" ");

type ContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: { code?: unknown; query?: unknown };
};
type ApiMessage = { role: "user" | "assistant"; content: unknown };
type MessagesResponse = { stop_reason: string | null; content: ContentBlock[] };

const SEARCH_TOOL = {
  name: "search_api",
  description:
    "Search the functions that run_code can call. Returns the declarations of the best matches. Search before you write code.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "What you need, in a few words" } },
    required: ["query"],
  },
};

const RUN_CODE_TOOL = {
  name: "run_code",
  description:
    "Run JavaScript in a sandbox with no internet access. Top-level await is allowed. " +
    "The global `api` has the functions that search_api returned. Anything you want back must be printed with console.log.",
  input_schema: {
    type: "object",
    properties: { code: { type: "string", description: "The JavaScript to run" } },
    required: ["code"],
  },
};

const textOf = (blocks: ContentBlock[]) =>
  blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();

const truncate = (s: string) => (s.length > RESULT_CHAR_LIMIT ? s.slice(0, RESULT_CHAR_LIMIT) + "\n[truncated]" : s);

export async function runAgentTask(opts: AgentTaskOptions): Promise<AgentTaskResult> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sandbox = opts.runSandbox ?? runInSandbox;
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const maxTurns = opts.maxTurns ?? 6;
  const methods = opts.catalog.entries.map((e) => e.name);
  const messages: ApiMessage[] = [{ role: "user", content: opts.task }];

  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: SYSTEM,
        tools: [SEARCH_TOOL, RUN_CODE_TOOL],
        messages,
      }),
    });
    if (!res.ok) throw new Error(`The Claude API returned HTTP ${res.status}`);
    const data = (await res.json()) as MessagesResponse;

    if (data.stop_reason !== "tool_use") return { answer: textOf(data.content), turns: turn };

    messages.push({ role: "assistant", content: data.content });
    const results: unknown[] = [];
    for (const block of data.content) {
      if (block.type !== "tool_use" || !block.id) continue;

      if (block.name === "search_api") {
        const query = typeof block.input?.query === "string" ? block.input.query : "";
        const hits = searchCatalog(opts.catalog.entries, query);
        const content =
          hits.length === 0
            ? "No function matches. Try different words."
            : JSON.stringify({
                types: opts.catalog.types,
                functions: hits.map((h) => `${h.declaration}  // ${h.description}`),
              });
        results.push({ type: "tool_result", tool_use_id: block.id, content: truncate(content) });
        continue;
      }

      if (block.name !== "run_code" || typeof block.input?.code !== "string") {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: "Use search_api to find functions, then run_code with a code string.",
        });
        continue;
      }
      const r: SandboxResult = await sandbox({ code: block.input.code, methods, call: opts.callApi });
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        is_error: !r.ok,
        content: truncate(JSON.stringify({ ok: r.ok, logs: r.logs, error: r.error ?? null })),
      });
    }
    if (results.length === 0) return { answer: textOf(data.content), turns: turn };
    messages.push({ role: "user", content: results });
  }
  throw new Error(`The agent did not finish within ${maxTurns} steps`);
}
