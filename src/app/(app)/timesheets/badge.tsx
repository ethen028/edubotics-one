import type { TimesheetStatus } from "@prisma/client";
import { Badge } from "@/components/ui";

const statusColor: Record<TimesheetStatus, "gray" | "amber" | "green" | "red"> = {
  DRAFT: "gray",
  SUBMITTED: "amber",
  APPROVED: "green",
  REJECTED: "red",
};
const statusLabel: Record<TimesheetStatus, string> = {
  DRAFT: "Not submitted",
  SUBMITTED: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Sent back",
};

export function TimesheetBadge({ status }: { status: TimesheetStatus }) {
  return <Badge color={statusColor[status]}>{statusLabel[status]}</Badge>;
}
