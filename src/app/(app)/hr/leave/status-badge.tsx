import type { LeaveStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { humanize } from "@/lib/format";

const colors = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "gray" } as const;

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge color={colors[status]}>{humanize(status)}</Badge>;
}
