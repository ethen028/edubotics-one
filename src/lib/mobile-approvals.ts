import "server-only";
import type { CurrentUser } from "./auth";
import { pendingApprovals } from "./approvals";
import { formatTime } from "./attendance";
import { formatDate, formatINR } from "./format";
import { addDays } from "./week";
import { progress } from "./projects";
import { requestNo } from "./inventory";
import { poNo } from "./purchase-math";
import { CATEGORY_LABEL, VEHICLE_LABEL } from "./expenses";

/**
 * What waits in Approvals, as the phone draws it: the same items as the web page (src/lib/approvals.ts), each
 * with a heading, a few plain lines and what can be done with it. Deciding goes through src/lib/decisions.ts.
 */

export type PhoneApprovalKind = "leave" | "correction" | "timesheet" | "claim" | "project" | "stock" | "purchase" | "resignation";
export type PhoneApproval = {
  kind: PhoneApprovalKind;
  id: string;
  who: string;
  lines: string[];
  /** Short in stock, no receipt, and the like. */
  warning?: string;
  /** Expense claims: the claimed amount, which can be lowered when approving. */
  amount?: number;
  /** Where the full record is in Orbit, for "Open in Orbit". */
  path: string;
  /** Resignations need a last working day, so they are accepted on the web page for now. */
  decideHere: boolean;
  /** Projects are "sent back" rather than rejected. */
  rejectLabel: string;
  /** Whether the decision can carry a note. */
  takesNote: boolean;
};
export type PhoneApprovalGroup = { kind: PhoneApprovalKind; title: string; items: PhoneApproval[] };

const person = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;
const range = (a: Date, b: Date) => (a.getTime() === b.getTime() ? formatDate(a) : `${formatDate(a)} to ${formatDate(b)}`);

export async function approvalsForPhone(user: CurrentUser): Promise<{ total: number; groups: PhoneApprovalGroup[] }> {
  const a = await pendingApprovals(user);
  const base = { decideHere: true, rejectLabel: "Reject", takesNote: true };
  const groups: PhoneApprovalGroup[] = [
    {
      kind: "leave", title: "Leave",
      items: a.leave.map((r) => ({
        ...base, kind: "leave", id: r.id, who: person(r.employee), path: "/hr/approvals",
        lines: [`${r.leaveType.name} · ${r.halfDay ? "half day" : `${r.days} day${r.days === 1 ? "" : "s"}`} · ${range(r.startDate, r.endDate)}`, r.reason],
      })),
    },
    {
      kind: "correction", title: "Missed punch-outs",
      items: a.corrections.map((c) => ({
        ...base, kind: "correction", id: c.id, who: person(c.employee), path: "/approvals", takesNote: false,
        lines: [`${formatDate(c.session.workDate)} · in ${formatTime(c.session.checkIn)}, asks out at ${formatTime(c.requestedCheckOut)}`, c.reason],
      })),
    },
    {
      kind: "timesheet", title: "Timesheets",
      items: a.timesheets.map((t) => {
        const total = t.entries.reduce((s, e) => s + Number(e.hours), 0);
        const byProject = new Map<string, number>();
        for (const e of t.entries) byProject.set(e.project?.name ?? "Other work", (byProject.get(e.project?.name ?? "Other work") ?? 0) + Number(e.hours));
        return {
          ...base, kind: "timesheet" as const, id: t.id, who: person(t.employee), path: "/timesheets/team", rejectLabel: "Send back",
          lines: [`${formatDate(t.weekStart)} to ${formatDate(addDays(t.weekStart, 6))} · ${total} h`, [...byProject].map(([n, h]) => `${n} ${h} h`).join(" · ")],
        };
      }),
    },
    {
      kind: "claim", title: "Expense claims",
      items: a.claims.map((c) => ({
        ...base, kind: "claim", id: c.id, who: person(c.employee), path: "/expenses/team", amount: Number(c.amount),
        lines: [
          `${formatDate(c.date)} · ${CATEGORY_LABEL[c.category]}${c.vehicle ? `, ${VEHICLE_LABEL[c.vehicle as keyof typeof VEHICLE_LABEL] ?? c.vehicle} ${Number(c.distanceKm)} km` : ""} · ${formatINR(c.amount)}`,
          c.description,
          [c.project?.name, c.organization?.name].filter(Boolean).join(" · "),
        ].filter(Boolean),
        ...(c.receipt ? {} : { warning: "No receipt" }),
      })),
    },
    {
      kind: "project", title: "Projects",
      items: a.projects.map((p) => ({
        ...base, kind: "project", id: p.id, who: p.name, path: `/projects/${p.id}`, rejectLabel: "Send back",
        lines: [`Owner ${p.owner.name} · ${progress(p.tasks)}% complete`],
      })),
    },
    {
      kind: "stock", title: "Kit and part requests",
      items: a.stock.map((r) => {
        const short = r.lines.filter((l) => l.item.onHand < l.quantity);
        return {
          ...base, kind: "stock" as const, id: r.id, who: `${requestNo(r.number)} · ${r.requester.name}`, path: `/inventory/requests/${r.id}`,
          lines: [r.lines.map((l) => `${l.quantity} ${l.item.unit} ${l.item.name}`).join(" · "), [r.project?.name, r.neededBy ? `needed ${formatDate(r.neededBy)}` : null].filter(Boolean).join(" · "), r.purpose].filter(Boolean),
          ...(short.length ? { warning: `Short in stock: ${short.map((l) => `${l.item.name} (${l.item.onHand} left)`).join(", ")}` } : {}),
        };
      }),
    },
    {
      kind: "purchase", title: "Purchase orders",
      items: a.purchases.map((o) => ({
        ...base, kind: "purchase", id: o.id, who: `${poNo(o.number)} · ${o.requester.name}`, path: `/purchases/${o.id}`,
        lines: [`${o.vendor.name} · ${formatINR(o.total)}`, o.lines.map((l) => `${l.quantity} ${l.unit} ${l.description}`).join(" · "), o.purpose].filter(Boolean),
      })),
    },
    {
      kind: "resignation", title: "Resignations",
      items: a.resignations.map((r) => ({
        ...base, kind: "resignation", id: r.id, who: person(r.employee), path: `/hr/exits/${r.id}`, decideHere: false,
        lines: [`Resigned ${formatDate(r.noticeGivenOn)} · asks to leave ${formatDate(r.proposedLastDay)} · notice ${r.noticeDays} days`, r.reason ?? ""].filter(Boolean),
      })),
    },
  ];
  return { total: a.total, groups: groups.filter((g) => g.items.length > 0) };
}
