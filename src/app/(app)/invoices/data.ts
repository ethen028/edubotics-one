import "server-only";
import type { Organization, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeState, payState, settledAmount } from "@/lib/invoices";
import { invoiceMoney } from "@/lib/credit-notes";
import { todayIST } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { toDateInput } from "@/lib/format";
import type { LineDraft } from "./invoice-form";

export function orgAddress(o: Pick<Organization, "address" | "city" | "district" | "state">) {
  return [o.address, o.city, o.district, o.state].filter(Boolean).join(", ");
}

/** Everything the invoice form's pickers need. */
export async function invoiceFormOptions() {
  const [settings, orgs, contacts, deals, projects] = await Promise.all([
    getSettings(),
    db.organization.findMany({ orderBy: { name: "asc" } }),
    db.contact.findMany({ select: { id: true, name: true, organizationId: true }, orderBy: { name: "asc" } }),
    db.deal.findMany({ where: { stage: "WON" }, select: { id: true, title: true, organizationId: true }, orderBy: { closedAt: "desc" } }),
    db.project.findMany({ select: { id: true, name: true, organizationId: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    settings: {
      companyState: settings.companyState,
      gstEnabled: settings.gstEnabled,
      defaultGstRate: settings.defaultGstRate,
      defaultSac: settings.defaultSac,
    },
    paymentTermsDays: settings.paymentTermsDays,
    orgs: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      address: orgAddress(o),
      gstin: o.gstin,
      state: normalizeState(o.state, settings.companyState),
    })),
    contacts,
    deals: deals.map((d) => ({ id: d.id, name: d.title, organizationId: d.organizationId })),
    projects,
  };
}

export type FormOptions = Awaited<ReturnType<typeof invoiceFormOptions>>;

export function line(settings: FormOptions["settings"], description = "", unitPrice = ""): LineDraft {
  return {
    description,
    sac: settings.defaultSac ?? "",
    quantity: "1",
    unitPrice,
    gstRate: String(settings.gstEnabled ? settings.defaultGstRate : 0),
  };
}

export function dateIn(days: number, from: Date) {
  return toDateInput(new Date(from.getTime() + days * 86400000));
}

/** How much of a won deal is already on live invoices (drafts and issued, not cancelled). Before tax. */
export async function billedForDeal(dealId: string) {
  const r = await db.invoice.aggregate({ where: { dealId, status: { not: "CANCELLED" } }, _sum: { subtotal: true } });
  return Number(r._sum.subtotal ?? 0);
}

/** Invoices with what has been received, what credit notes took off, and where each one stands today. */
export async function invoicesWithBalance(where: Prisma.InvoiceWhereInput = {}) {
  const today = todayIST();
  const invoices = await db.invoice.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, phone: true, email: true } },
      contact: { select: { name: true, phone: true, email: true } },
      payments: { select: { amount: true, tds: true, receivedOn: true } },
      creditNotes: { select: { status: true, total: true, refundAmount: true } },
      // The last payment reminder that went out, for the Payments due page.
      emails: { where: { status: "SENT", kind: "PAYMENT_REMINDER" }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ issueDate: "desc" }, { seq: "desc" }, { createdAt: "desc" }],
  });
  return invoices.map((inv) => {
    const settled = settledAmount(inv.payments);
    const live = inv.status === "ISSUED";
    const money = invoiceMoney(inv.total, settled, inv.creditNotes);
    return {
      ...inv,
      settled,
      credited: money.credited,
      owedBack: live ? money.owedBack : 0,
      balance: live ? money.balance : 0,
      daysLate: live ? Math.round((today.getTime() - inv.dueDate.getTime()) / 86400000) : 0,
      state: payState(inv, settled, today, money.credited - money.refunded),
    };
  });
}
