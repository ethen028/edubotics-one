export type LaunchStatus = "ready" | "setup" | "owner";

export type LaunchGate = {
  key: string;
  title: string;
  status: LaunchStatus;
  evidence: string[];
  action: string;
  href: string;
};

export function gateStatus(ready: boolean, ownerInputRequired = false): LaunchStatus {
  if (ready) return "ready";
  return ownerInputRequired ? "owner" : "setup";
}

export function launchSummary(gates: Pick<LaunchGate, "status">[]) {
  return gates.reduce(
    (summary, gate) => ({ ...summary, [gate.status]: summary[gate.status] + 1 }),
    { ready: 0, setup: 0, owner: 0 } satisfies Record<LaunchStatus, number>,
  );
}

export function productionOriginReady(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}
