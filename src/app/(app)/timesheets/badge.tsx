import type { DailyWorkStatus, TimesheetStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { DAILY_STATUS_LABEL } from "@/lib/daily-log";

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

const dailyColor: Record<DailyWorkStatus, "green" | "blue" | "gray" | "red"> = {
  COMPLETED: "green",
  IN_PROGRESS: "blue",
  PENDING: "gray",
  BLOCKED: "red",
};

/** How a piece of logged work went (Task Flow's worksheet status). */
export function DailyStatusBadge({ status }: { status: DailyWorkStatus }) {
  return <Badge color={dailyColor[status]}>{DAILY_STATUS_LABEL[status]}</Badge>;
}
