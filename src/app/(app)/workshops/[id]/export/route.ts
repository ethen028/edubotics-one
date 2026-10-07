import { getCurrentUser, isManagerOrAdmin } from "@/lib/auth";
import { methodLabel } from "@/lib/invoices";
import { todayIST } from "@/lib/time";
import { canMarkAttendance, standing, workshopDays } from "@/lib/workshops";
import { loadWorkshop } from "../../data";
import { db } from "@/lib/db";

const csv = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Participants with contact details, attendance by day, fees and certificate numbers, for a spreadsheet. */
export async function GET(_: Request, { params }: RouteContext<"/workshops/[id]/export">) {
  const user = await getCurrentUser();
  const w = await loadWorkshop((await params).id);
  if (!user || !w || !canMarkAttendance(user, w)) return new Response("Not found", { status: 404 });
  const money = isManagerOrAdmin(user) && w.feeType === "PER_PERSON";
  const days = workshopDays(w);
  const today = todayIST();
  const payments = money
    ? await db.workshopPayment.findMany({ where: { registration: { workshopId: w.id } }, orderBy: { paidOn: "asc" } })
    : [];
  const rows = [
    [
      "Name",
      "Email",
      "Phone",
      "College / company",
      "Course / designation",
      "Status",
      ...days.map((d, i) => `Day ${i + 1} (${day(d)})`),
      "Days attended",
      ...(money ? ["Fee", "Paid", "Due", "Payments"] : []),
      "Certificate no.",
      "Registered on",
    ],
    ...w.registrations.map((r) => {
      const st = standing(w, r, today);
      const mark = (d: Date) => {
        const a = r.attendance.find((x) => x.date.getTime() === d.getTime());
        return a ? (a.present ? "Present" : "Absent") : "";
      };
      return [
        r.name,
        r.email,
        r.phone,
        r.institution,
        r.detail,
        r.status === "REGISTERED" ? "Registered" : "Cancelled",
        ...days.map(mark),
        st.attended,
        ...(money
          ? [
              Number(r.fee),
              st.paid,
              st.due,
              payments
                .filter((p) => p.registrationId === r.id)
                .map((p) => `${day(p.paidOn)} ${methodLabel[p.method]} ${Number(p.amount)}${p.reference ? ` (${p.reference})` : ""}`)
                .join("; "),
            ]
          : []),
        r.certificate?.status === "ISSUED" ? r.certificate.number : "",
        day(r.createdAt),
      ];
    }),
  ];
  const name = w.title.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "workshop";
  return new Response(rows.map((r) => r.map(csv).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-participants.csv"` },
  });
}
