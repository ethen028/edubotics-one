// Runs model-written code for the Orbit agent. Plain Node, no imports beyond Node itself.
// It runs inside the sandbox container, which has no network. The only way out is this
// process's stdout and stdin, one JSON message per line:
//
//   host -> runner   {"type":"run","code":"...","methods":["listMyClaims", ...]}
//   host -> runner   {"type":"result","id":3,"ok":true,"value":...}  or  {"ok":false,"error":"..."}
//   runner -> host   {"type":"call","id":3,"method":"listMyClaims","args":{...}}
//   runner -> host   {"type":"done","ok":true,"logs":["..."]}  or  {"ok":false,"error":"..."}
//
// The host decides what each call returns. This file only forwards calls and captures console output.
import { createInterface } from "node:readline";
import { format } from "node:util";

const MAX_LOG_LINES = 200;
const MAX_LOG_CHARS = 2000;

const waiting = new Map();
const logs = [];
let nextId = 1;
let started = false;

const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");

function callHost(method, args) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    send({ type: "call", id, method, args: args ?? {} });
  });
}

function capture(...parts) {
  if (logs.length >= MAX_LOG_LINES) return;
  logs.push(format(...parts).slice(0, MAX_LOG_CHARS));
}

async function start({ code, methods }) {
  const api = Object.fromEntries(
    (Array.isArray(methods) ? methods : []).map((m) => [m, (args) => callHost(m, args)]),
  );
  const sandboxConsole = { log: capture, info: capture, warn: capture, error: capture };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  let ok = true;
  let error;
  try {
    await new AsyncFunction("api", "console", String(code))(api, sandboxConsole);
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : String(e);
  }
  send({ type: "done", ok, error, logs });
  process.exit(0);
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.type === "run" && !started) {
    started = true;
    start(msg);
  } else if (msg.type === "result") {
    const p = waiting.get(msg.id);
    if (!p) return;
    waiting.delete(msg.id);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new Error(msg.error ?? "The API call failed"));
  }
});
