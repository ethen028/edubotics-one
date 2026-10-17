import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { dailyPulse, readRange } from "@/lib/pulse";
import { kindLabel } from "@/lib/projects";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** The Daily pulse as a spreadsheet: one row per open project the user can see. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const range = readRange(request.nextUrl.searchParams.get("range") ?? undefined);
  const p = await dailyPulse(user, range);
  const rows = [
    ["Project", "Type", "Owner", "Stage", "Due", "Progress %", "Open tasks", "Blocked tasks", "Approved hours", "Not yet approved hours", "Signals"],
    ...p.rows.map((r) => [
      r.project.name,
      kindLabel[r.project.kind],
      r.project.owner.name,
      r.project.stage,
      day(r.project.dueDate),
      r.progress,
      r.openTasks,
      r.blocked,
      r.approvedHours,
      r.pendingHours,
      r.reasons.join("; "),
    ]),
  ];
  // A byte-order mark so Excel reads names in Malayalam and other scripts correctly.
  return new Response("﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-pulse-${range}-${day(p.today)}.csv"`,
    },
  });
}
