import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { RATING_LABEL } from "@/lib/hr-constants";
import { reviewStatus, scoreOf } from "@/lib/reviews";

const csv = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** One row per person in the cycle: status, scores, final rating and the written summary. */
export async function GET(_: Request, { params }: RouteContext<"/hr/reviews/cycles/[id]/export">) {
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const cycle = await db.reviewCycle.findUniqueOrThrow({
    where: { id },
    include: {
      reviews: {
        include: {
          employee: { select: { code: true, firstName: true, lastName: true, designation: true, department: { select: { name: true } } } },
          reviewer: { select: { name: true } },
          goals: true,
        },
        orderBy: [{ employee: { firstName: "asc" } }, { employee: { lastName: "asc" } }],
      },
    },
  });
  const header = [
    "Code",
    "Name",
    "Designation",
    "Department",
    "Reviewer",
    "Status",
    "Goals",
    "Self score",
    "Manager score",
    "Final rating",
    "Rating",
    "Strengths",
    "To improve",
    "Shared on",
    "Signed off on",
    "Employee comment",
  ];
  const lines = [header.map(csv).join(",")];
  for (const r of cycle.reviews) {
    const shared = !!r.managerSubmittedAt;
    lines.push(
      [
        r.employee.code,
        `${r.employee.firstName} ${r.employee.lastName}`.trim(),
        r.employee.designation,
        r.employee.department?.name,
        r.reviewer?.name ?? "Any admin",
        reviewStatus(r, cycle.stage).label,
        r.goals.length,
        r.selfSubmittedAt ? scoreOf(r.goals, "self") : "",
        shared ? scoreOf(r.goals, "manager") : "",
        shared ? r.managerRating : "",
        shared && r.managerRating ? RATING_LABEL[r.managerRating] : "",
        shared ? r.managerStrengths : "",
        shared ? r.managerImprove : "",
        shared ? formatDate(r.managerSubmittedAt) : "",
        r.acknowledgedAt ? formatDate(r.acknowledgedAt) : "",
        r.employeeComment,
      ]
        .map(csv)
        .join(","),
    );
  }
  const name = `${cycle.name.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
  return new Response(lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
