import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const excluded = new Set(["node_modules", ".next", ".git", "coverage", "out", "build", "backups"]);
const rules = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["Stripe live key", /\bsk_live_[A-Za-z0-9]{20,}\b/],
];
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(path.relative(root, full));
  }
  return files;
}
let files;
try { files = execFileSync("git", ["ls-files", "-z"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\0").filter(Boolean); }
catch { files = await walk(root); }
let failed = false;
for (const file of files) {
  const base = path.basename(file);
  // Local environment files are intentionally not read. A committed one is an error.
  if (base.startsWith(".env") && base !== ".env.example") {
    try { execFileSync("git", ["ls-files", "--error-unmatch", file], { cwd: root, stdio: "ignore" });
      console.error(`${file}: environment file must not be committed`); failed = true;
    } catch { /* Local ignored file in an archive checkout. */ }
    continue;
  }
  if (file.split(/[\\/]/).some((part) => excluded.has(part))) continue;
  const bytes = await readFile(path.join(root, file));
  if (bytes.includes(0)) continue;
  const lines = bytes.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [name, pattern] of rules) if (pattern.test(line)) {
      console.error(`${file}:${index + 1}: possible ${name} (value redacted)`); failed = true;
    }
    const assignment = line.match(/\b(?:SESSION_SECRET|API_KEY|ACCESS_TOKEN|ENCRYPTION_KEY)\s*[=:]\s*["']([^"']{20,})["']/i);
    if (assignment && !/^(?:\$|ci-only-|test-|example-|replace-|your-|build-time-placeholder-)/i.test(assignment[1])) {
      console.error(`${file}:${index + 1}: possible hardcoded credential (value redacted)`); failed = true;
    }
  });
}
if (failed) process.exitCode = 1;
else console.log("Source secret pattern scan passed (local .env files and generated files excluded).");
