/** Quote labels and states, shared by the server and pages. No database access here. */

export function quoteNumber(prefix: string, fy: string, seq: number) {
  return `${prefix}/Q/${fy}/${String(seq).padStart(3, "0")}`;
}

/** Where a quote stands today. A sent quote past its valid-until date shows as expired. */
export type QuoteState = "DRAFT" | "WAITING" | "EXPIRED" | "ACCEPTED" | "DECLINED" | "REVISED";

export function quoteState(q: { status: string; validUntil: Date }, today: Date): QuoteState {
  if (q.status === "SENT") return q.validUntil < today ? "EXPIRED" : "WAITING";
  return q.status as QuoteState;
}

export const quoteStateLabel: Record<QuoteState, string> = {
  DRAFT: "Draft",
  WAITING: "Waiting for answer",
  EXPIRED: "Expired",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  REVISED: "Replaced by a revision",
};

export const quoteStateColor: Record<QuoteState, "gray" | "blue" | "green" | "amber" | "red" | "purple"> = {
  DRAFT: "gray",
  WAITING: "blue",
  EXPIRED: "amber",
  ACCEPTED: "green",
  DECLINED: "red",
  REVISED: "gray",
};
