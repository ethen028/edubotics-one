/** Server-only callers: bounded, process-local operational counts; never store visitor identifiers. */
const HOUR = 60 * 60 * 1000;
const RETENTION = 24 * HOUR;
const known = new Set(["/", "/login", "/careers", "/privacy", "/terms", "/cookies", "/guide", "/api/health", "/admin/health"]);

export function normalizeMetricPath(input: string): string {
  const path = input.split(/[?#]/, 1)[0];
  if (known.has(path)) return path;
  if (/^\/careers\/[^/]+\/apply$/.test(path)) return "/careers/[job]/apply";
  if (/^\/careers\/[^/]+$/.test(path)) return "/careers/[job]";
  if (path.startsWith("/_next/")) return "/_next/*";
  if (path.startsWith("/api/")) return "/api/*";
  return "other";
}

type Row = { route: string; status: string; count: number; durationTotal: number; durationCount: number };
type SafeError = { id: string; at: number; route: string };
type TelemetryState = { startedAt: number; buckets: Map<number, Map<string, Row>>; errors: SafeError[] };
const stateKey = Symbol.for("edubotics.telemetry.v1");
const scope = globalThis as typeof globalThis & { [stateKey]?: TelemetryState };
const state: TelemetryState = scope[stateKey] ??= { startedAt: Date.now(), buckets: new Map(), errors: [] };

function prune(now: number) {
  for (const hour of state.buckets.keys()) if (hour < now - RETENTION) state.buckets.delete(hour);
  state.errors = state.errors.filter((event) => event.at >= now - RETENTION).slice(-100);
}

/** Status is the response observed by the caller, not necessarily a final downstream response. */
export function recordRequest(path: string, status: number, duration?: number): void {
  const now = Date.now();
  prune(now);
  const hour = Math.floor(now / HOUR) * HOUR;
  const bucket = state.buckets.get(hour) ?? new Map<string, Row>();
  state.buckets.set(hour, bucket);
  const route = normalizeMetricPath(path);
  const group = Number.isInteger(status) && status >= 100 && status <= 599 ? `${Math.floor(status / 100)}xx` : "unknown";
  const key = `${route}:${group}`;
  const row = bucket.get(key) ?? { route, status: group, count: 0, durationTotal: 0, durationCount: 0 };
  row.count++;
  if (typeof duration === "number" && Number.isFinite(duration) && duration >= 0 && duration <= 3_600_000) {
    row.durationTotal += duration;
    row.durationCount++;
  }
  bucket.set(key, row);
}

/** Deliberately ignores error contents: messages/stacks may contain secrets or personal data. */
export function reportServerError(_error: unknown, context?: { path?: string }): string {
  const now = Date.now();
  prune(now);
  const event = { id: crypto.randomUUID(), at: now, route: normalizeMetricPath(context?.path ?? "") };
  state.errors.push(event);
  state.errors = state.errors.slice(-100);
  console.error(JSON.stringify({ event: "server_error", ...event }));
  return event.id;
}

export function telemetrySnapshot() {
  prune(Date.now());
  const totals = new Map<string, Row>();
  for (const bucket of state.buckets.values()) for (const [key, row] of bucket) {
    const total = totals.get(key) ?? { ...row, count: 0, durationTotal: 0, durationCount: 0 };
    total.count += row.count;
    total.durationTotal += row.durationTotal;
    total.durationCount += row.durationCount;
    totals.set(key, total);
  }
  return { startedAt: state.startedAt, rows: [...totals.values()], errors: state.errors.map((event) => ({ ...event })) };
}
