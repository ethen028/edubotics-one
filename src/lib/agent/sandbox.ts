// Host side of the agent sandbox. Starts one fresh runner per call to run_code, relays its API calls
// to `call`, and enforces a time limit, a call limit and an output limit.
// The default command runs the runner in a Docker container with no network. Tests pass a plain Node command.
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

export type SandboxCall = (method: string, args: unknown) => Promise<unknown>;

export type SandboxResult = { ok: boolean; logs: string[]; error?: string };

export type SandboxOptions = {
  code: string;
  methods: readonly string[];
  call: SandboxCall;
  timeoutMs?: number;
  maxCalls?: number;
  maxOutputBytes?: number;
  /** Override for tests. Default: docker, running the agent-sandbox image. */
  command?: string;
  commandArgs?: string[];
};

export type SandboxRunner = (opts: Omit<SandboxOptions, "command" | "commandArgs" | "timeoutMs">) => Promise<SandboxResult>;

export const SANDBOX_IMAGE = process.env.AGENT_SANDBOX_IMAGE ?? "orbit-agent-sandbox";

/** Docker flags that keep the code inside the box: no network, read-only disk, no privileges, limited memory, CPU and processes. */
export function dockerSandboxArgs(containerName: string, image: string = SANDBOX_IMAGE): string[] {
  return [
    "run",
    "-i",
    "--rm",
    "--name",
    containerName,
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "256m",
    "--pids-limit",
    "64",
    "--cpus",
    "1",
    "--user",
    "65534:65534",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=16m",
    image,
  ];
}

const LOG_LINE_LIMIT = 200;
const LOG_CHAR_LIMIT = 2000;

export async function runInSandbox(opts: SandboxOptions): Promise<SandboxResult> {
  const containerName = `orbit-agent-${randomUUID()}`;
  const usingDocker = !opts.command;
  const command = opts.command ?? "docker";
  const args = opts.commandArgs ?? dockerSandboxArgs(containerName);
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxCalls = opts.maxCalls ?? 50;
  const maxOutputBytes = opts.maxOutputBytes ?? 1_000_000;
  const allowed = new Set(opts.methods);

  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
  child.stdin?.on("error", () => {});
  child.stderr?.resume();

  return new Promise<SandboxResult>((resolve) => {
    let settled = false;
    let calls = 0;
    let bytes = 0;

    const finish = (result: SandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill("SIGKILL");
      if (usingDocker) execFile("docker", ["rm", "-f", containerName], () => {});
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, logs: [], error: `Timed out after ${Math.round(timeoutMs / 1000)} seconds` }),
      timeoutMs,
    );

    const reply = (id: number, body: { ok: true; value: unknown } | { ok: false; error: string }) => {
      child.stdin?.write(JSON.stringify({ type: "result", id, ...body, value: body.ok ? body.value ?? null : undefined }) + "\n");
    };

    const handleCall = async (msg: { id: number; method: string; args: unknown }) => {
      calls += 1;
      if (calls > maxCalls) return finish({ ok: false, logs: [], error: `More than ${maxCalls} API calls in one run` });
      if (!allowed.has(msg.method)) return reply(msg.id, { ok: false, error: `No such function: ${msg.method}` });
      try {
        reply(msg.id, { ok: true, value: await opts.call(msg.method, msg.args) });
      } catch (e) {
        reply(msg.id, { ok: false, error: e instanceof Error ? e.message : "The API call failed" });
      }
    };

    const lines = createInterface({ input: child.stdout! });
    lines.on("line", (line) => {
      bytes += Buffer.byteLength(line);
      if (bytes > maxOutputBytes) return finish({ ok: false, logs: [], error: "The code printed too much output" });
      let msg: { type?: string; id?: number; method?: string; args?: unknown; ok?: boolean; error?: string; logs?: unknown };
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.type === "call" && typeof msg.id === "number" && typeof msg.method === "string") {
        void handleCall({ id: msg.id, method: msg.method, args: msg.args });
      } else if (msg.type === "done") {
        const logs = Array.isArray(msg.logs)
          ? msg.logs.slice(0, LOG_LINE_LIMIT).map((l) => String(l).slice(0, LOG_CHAR_LIMIT))
          : [];
        finish({ ok: msg.ok === true, logs, error: msg.error });
      }
    });

    child.on("error", (e) => finish({ ok: false, logs: [], error: `Could not start the sandbox: ${e.message}` }));
    child.on("close", () => finish({ ok: false, logs: [], error: "The sandbox stopped without a result" }));

    child.stdin?.write(JSON.stringify({ type: "run", code: opts.code, methods: opts.methods }) + "\n");
  });
}
