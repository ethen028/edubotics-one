import type { DailyWorkStatus, TimesheetStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { DAILY_STATUS_LABEL } from "@/lib/daily-log";
import { formatDateTime } from "@/lib/format";

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

/** WorkPulse's edit trail: shown on an entry changed after it was first logged. */
export function EditedNote({ count, at }: { count: number; at: Date | null }) {
  return (
    <div className="text-xs text-amber-700">
      Edited{count > 1 ? ` ${count} times` : ""}
      {at ? `, last on ${formatDateTime(at)}` : ""}
    </div>
  );
}
