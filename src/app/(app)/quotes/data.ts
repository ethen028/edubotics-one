import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { quoteState } from "@/lib/quotes";
import { todayIST } from "@/lib/time";
import { invoiceFormOptions } from "../invoices/data";

/** The invoice form's pickers, with every deal that is still open or won (a quote usually comes before the win). */
export async function quoteFormOptions() {
  const [options, deals] = await Promise.all([
    invoiceFormOptions(),
    db.deal.findMany({
      where: { stage: { not: "LOST" } },
      select: { id: true, title: true, organizationId: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return { ...options, deals: deals.map((d) => ({ id: d.id, name: d.title, organizationId: d.organizationId })) };
}

/** Quotes with where each stands today and how much has been invoiced against it (before GST). */
export async function quotesWithState(where: Prisma.QuoteWhereInput = {}) {
  const today = todayIST();
  const quotes = await db.quote.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true } },
      deal: { select: { id: true, title: true } },
      invoices: { where: { status: { not: "CANCELLED" } }, select: { subtotal: true } },
    },
    orderBy: [{ quoteDate: "desc" }, { seq: "desc" }, { createdAt: "desc" }],
  });
  return quotes.map((q) => ({
    ...q,
    state: quoteState(q, today),
    billed: q.invoices.reduce((n, i) => n + Number(i.subtotal), 0),
    daysLeft: Math.round((q.validUntil.getTime() - today.getTime()) / 86400000),
  }));
}
