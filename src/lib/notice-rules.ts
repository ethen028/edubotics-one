/**
 * Notice board rules, with no database or server imports, so both the Next pages and the Convex functions
 * (convex/notices.ts) use the same ones.
 */

export const POLICY_CATEGORIES = ["HR and leave", "Conduct", "Travel and expenses", "Safety", "IT and data", "Other"] as const;

type Role = "ADMIN" | "HR" | "MANAGER" | "EMPLOYEE";

/** Who may post notices: admins, HR and managers. */
export const NOTICE_POSTERS: readonly Role[] = ["ADMIN", "HR", "MANAGER"];

/** Admins edit any notice; managers and HR only their own. */
export const canEditNotice = (user: { id: string; role: Role }, notice: { authorId: string }) =>
  user.role === "ADMIN" || notice.authorId === user.id;

/** An acknowledgement only counts for the notice version it was given on. */
export const isAcked = (notice: { version: number }, ack: { version: number } | undefined | null) => !!ack && ack.version >= notice.version;

/** Turning acknowledgement on, or asking again after a change, starts a new round (a new version). */
export function nextNoticeVersion(
  notice: { version: number; requiresAck: boolean },
  change: { requiresAck: boolean; askAgain: boolean },
) {
  const newRound = change.requiresAck && (!notice.requiresAck || change.askAgain);
  return { newRound, version: newRound ? notice.version + 1 : notice.version };
}

/** Policies keep a category and no end date; announcements the reverse. A due date only matters when acknowledgement is asked. */
export function tidyNotice<T extends { kind: "ANNOUNCEMENT" | "POLICY"; category?: string | null; showUntil?: number | null; requiresAck: boolean; ackDueDate?: number | null }>(n: T) {
  return {
    ...n,
    category: n.kind === "POLICY" ? n.category ?? undefined : undefined,
    showUntil: n.kind === "ANNOUNCEMENT" ? n.showUntil ?? undefined : undefined,
    ackDueDate: n.requiresAck ? n.ackDueDate ?? undefined : undefined,
  };
}

/** Pending acknowledgements, oldest due first; ones with no due date last, then by posting time. */
export function sortPending<T extends { ackDueDate?: number | null; createdAt: number }>(rows: T[]) {
  return [...rows].sort(
    (a, b) => (a.ackDueDate ?? Infinity) - (b.ackDueDate ?? Infinity) || a.createdAt - b.createdAt,
  );
}

/** Board order: policies pinned first then by category and title; announcements pinned first then newest. */
export function sortBoard<T extends { kind: string; pinned: boolean; category?: string | null; title: string; createdAt: number }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.kind === "POLICY") return (a.category ?? "\uffff").localeCompare(b.category ?? "\uffff") || a.title.localeCompare(b.title);
    return b.createdAt - a.createdAt;
  });
}
