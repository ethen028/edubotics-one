"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notifications";
import { commissionRows } from "@/lib/commission";
import { monthLabel, monthParam, parseMonth } from "@/lib/plan-rules";
import type { FormState } from "@/components/action-form";

function refresh() {
  revalidatePath("/crm/commission");
}

/** Saves the month's statement as it stands now, so later payments or edits don't change what was agreed. */
export async function prepareStatement(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return { error: "Only managers and admins prepare commission statements." };
  const month = parseMonth(String(formData.get("month") ?? ""));
  if (!month) return { error: "Pick a month." };
  const rate = Number(String(formData.get("rate") ?? "").replace("%", ""));
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) return { error: "The rate is a percent between 0 and 50." };
  const existing = await db.commissionStatement.findUnique({ where: { month } });
  if (existing?.status === "APPROVED") return { error: "This month's statement is already approved." };
  const { rows } = await commissionRows(month, rate);
  const total = Math.round(rows.reduce((s, r) => s + r.commission, 0) * 100) / 100;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000) || null;
  await db.$transaction(async (tx) => {
    if (existing) await tx.commissionStatement.delete({ where: { id: existing.id } });
    await tx.commissionStatement.create({
      data: {
        month,
        rate,
        total,
        notes,
        preparedById: user.id,
        lines: {
          create: rows.map((r) => ({
            userId: r.userId,
            invoiceNo: r.invoiceNo,
            dealTitle: r.dealTitle,
            school: r.school,
            receivedOn: r.receivedOn,
            received: r.received,
            base: r.base,
            commission: r.commission,
          })),
        },
      },
    });
  });
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  await notify(
    admins.map((a) => a.id),
    user.id,
    { kind: "commission.ready", title: `Commission statement for ${monthLabel(month)} is ready to approve`, href: `/crm/commission?month=${monthParam(month)}` },
  );
  await logActivity(user, "MONEY", "commission.prepared", `Commission statement for ${monthLabel(month)} prepared: ₹${total}`);
  refresh();
  return { ok: `Statement prepared: ${rows.length} payment${rows.length === 1 ? "" : "s"}.` };
}

export async function approveStatement(id: string) {
  const user = await requireUser();
  if (!isAdmin(user)) return;
  const s = await db.commissionStatement.findUnique({ where: { id }, include: { lines: { select: { userId: true } } } });
  if (!s || s.status === "APPROVED") return;
  await db.commissionStatement.update({ where: { id }, data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() } });
  await notify(
    s.lines.map((l) => l.userId),
    user.id,
    { kind: "commission.ready", title: `Your commission for ${monthLabel(s.month)} is approved`, href: `/crm/commission?month=${monthParam(s.month)}` },
  );
  await logActivity(user, "MONEY", "commission.approved", `Commission statement for ${monthLabel(s.month)} approved: ₹${s.total}`);
  refresh();
}
