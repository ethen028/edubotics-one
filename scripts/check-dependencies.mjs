import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Temporary, explicit tooling-only exceptions. Reassess before this date.
// Never feed untrusted patterns to ESLint.
const reviewed = new Set([
  "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
]);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this check with npm run security:dependencies");
const result = spawnSync(process.execPath, [npmCli, "audit", "--json"], { encoding: "utf8", timeout: 60_000 });
let report;
try { report = JSON.parse(result.stdout); } catch { throw new Error("npm audit did not return a valid report"); }
if (result.error || report.error || !report.vulnerabilities) throw new Error("Dependency audit could not complete");
const packages = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url))).packages;
const exceptionsCurrent = Date.now() < Date.parse("2026-11-17T00:00:00Z");
let blocked = false;
const seen = new Set();
function reviewedTooling(name, visiting = new Set()) {
  const issue = report.vulnerabilities[name];
  if (!issue || visiting.has(name)) return false;
  visiting.add(name);
  return issue.nodes.length > 0 && issue.nodes.every((node) => packages[node]?.dev === true) &&
    issue.via.length > 0 && issue.via.every((via) => typeof via === "string"
      ? reviewedTooling(via, new Set(visiting)) : reviewed.has(via.url));
}
for (const [name, issue] of Object.entries(report.vulnerabilities)) {
  if (!["high", "critical"].includes(issue.severity)) continue;
  if (exceptionsCurrent && issue.severity === "high" && reviewedTooling(name)) {
    for (const via of issue.via) if (typeof via !== "string") seen.add(via.url);
  } else { console.error(`Blocked dependency: ${name} (${issue.severity})`); blocked = true; }
}
for (const url of seen) console.warn(`REVIEW REQUIRED by 2026-11-17: accepted tooling-only advisory ${url}`);
if (blocked) process.exitCode = 1;
else console.log("Dependency gate passed; any accepted advisories are listed above.");
