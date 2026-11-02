import "server-only";
import { db } from "@/lib/db";
import { monthEnd, monthStart } from "@/lib/plan-rules";
import { commissionFor } from "@/lib/commission-math";

export { byPerson, commissionFor } from "@/lib/commission-math";

export const DEFAULT_COMMISSION_RATE = 5;

export type CommissionRow = {
  userId: string;
  userName: string;
  invoiceNo: string;
  dealTitle: string;
  school: string;
  receivedOn: Date;
  received: number;
  base: number;
  commission: number;
};

/**
 * What each sales executive earns for a month: 5% of the money received that month (plus TDS the school kept)
 * on invoices raised from a deal they own, without GST. Payments on invoices with no deal, or a deal with no
 * owner, earn nothing and are listed separately so they can be checked.
 */
export async function commissionRows(month: Date, rate: number) {
  const from = monthStart(month);
  const to = new Date(monthEnd(month).getTime() + 86400000);
  const payments = await db.invoicePayment.findMany({
    where: { receivedOn: { gte: from, lt: to }, invoice: { status: "ISSUED" } },
    include: {
      invoice: {
        select: {
          number: true,
          subtotal: true,
          total: true,
          organization: { select: { name: true } },
          deal: { select: { title: true, owner: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { receivedOn: "asc" },
  });
  const rows: CommissionRow[] = [];
  const unassigned: { invoiceNo: string; school: string; receivedOn: Date; received: number }[] = [];
  for (const p of payments) {
    const received = Number(p.amount) + Number(p.tds);
    const owner = p.invoice.deal?.owner;
    if (!owner) {
      unassigned.push({ invoiceNo: p.invoice.number ?? "—", school: p.invoice.organization.name, receivedOn: p.receivedOn, received });
      continue;
    }
    const { base, commission } = commissionFor(received, Number(p.invoice.subtotal), Number(p.invoice.total), rate);
    rows.push({
      userId: owner.id,
      userName: owner.name,
      invoiceNo: p.invoice.number ?? "—",
      dealTitle: p.invoice.deal!.title,
      school: p.invoice.organization.name,
      receivedOn: p.receivedOn,
      received,
      base,
      commission,
    });
  }
  return { rows, unassigned };
}
