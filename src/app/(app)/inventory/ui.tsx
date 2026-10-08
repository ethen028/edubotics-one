import type { StockRequestStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { humanize } from "@/lib/format";

const COLOR: Record<StockRequestStatus, "gray" | "blue" | "green" | "amber" | "red" | "purple"> = {
  PENDING: "amber",
  APPROVED: "blue",
  REJECTED: "red",
  CANCELLED: "gray",
  ISSUED: "purple",
  CLOSED: "green",
};

const LABEL: Partial<Record<StockRequestStatus, string>> = {
  PENDING: "Waiting for approval",
  APPROVED: "Approved, to issue",
  ISSUED: "Issued, items out",
};

export function RequestBadge({ status }: { status: StockRequestStatus }) {
  return <Badge color={COLOR[status]}>{LABEL[status] ?? humanize(status)}</Badge>;
}

export function StockLevel({ onHand, reorderLevel, unit }: { onHand: number; reorderLevel: number; unit: string }) {
  const low = reorderLevel > 0 && onHand <= reorderLevel;
  return (
    <span className={low ? "font-semibold text-red-600" : "font-medium"}>
      {onHand} <span className="text-xs font-normal text-slate-500">{unit}</span>
      {low && <span className="ml-1.5"><Badge color="red">{onHand === 0 ? "Out of stock" : "Low"}</Badge></span>}
    </span>
  );
}
