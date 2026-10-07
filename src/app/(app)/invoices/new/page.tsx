import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { normalizeState } from "@/lib/invoices";
import { todayIST } from "@/lib/time";
import { toDateInput } from "@/lib/format";
import { InvoiceForm, type InvoiceDefaults } from "../invoice-form";
import { createInvoice } from "../actions";
import { billedForDeal, dateIn, invoiceFormOptions, line, orgAddress } from "../data";

export const metadata = { title: "New invoice" };

/**
 * Opened blank, or from an accepted quote (?quote=), a won deal (?deal=), a delivery project (?project=)
 * or an institution (?org=).
 */
export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const options = await invoiceFormOptions();
  const today = todayIST();

  const quote = sp.quote
    ? await db.quote.findUnique({ where: { id: sp.quote, status: "ACCEPTED" }, include: { lines: { orderBy: { position: "asc" } } } })
    : null;
  const project = sp.project ? await db.project.findUnique({ where: { id: sp.project } }) : null;
  const dealId = quote?.dealId ?? sp.deal ?? project?.dealId ?? undefined;
  const deal = dealId ? await db.deal.findUnique({ where: { id: dealId } }) : null;
  const orgId = quote?.organizationId ?? sp.org ?? deal?.organizationId ?? project?.organizationId ?? undefined;
  const org = orgId ? await db.organization.findUnique({ where: { id: orgId } }) : null;
  const billed = deal ? await billedForDeal(deal.id) : 0;
  const remaining = deal ? Math.max(0, Number(deal.value) - billed) : 0;

  const description = deal
    ? [deal.program ?? deal.title, deal.students && `${deal.students} students`].filter(Boolean).join(", ")
    : (project?.name ?? "");

  // A quote's first invoice copies its lines; later ones bill what is left of it as one line.
  const quoteBilled = quote
    ? Number(
        (await db.invoice.aggregate({ where: { quoteId: quote.id, status: { not: "CANCELLED" } }, _sum: { subtotal: true } }))._sum
          .subtotal ?? 0,
      )
    : 0;
  const quoteLeft = quote ? Math.max(0, Number(quote.subtotal) - quoteBilled) : 0;
  const quoteLines = quote
    ? quoteBilled === 0
      ? quote.lines.map((l) => ({
          description: l.description,
          sac: l.sac ?? "",
          quantity: String(Number(l.quantity)),
          unitPrice: String(Number(l.unitPrice)),
          gstRate: String(Number(l.gstRate)),
        }))
      : [line(options.settings, `Balance as per our quotation ${quote.number}`, quoteLeft ? String(quoteLeft) : "")]
    : null;

  const defaults: InvoiceDefaults = {
    organizationId: org?.id,
    contactId: deal?.contactId,
    dealId: deal?.id,
    projectId: project?.id ?? (deal ? (await db.project.findFirst({ where: { dealId: deal.id }, select: { id: true } }))?.id : null),
    quoteId: quote?.id,
    billToName: quote?.billToName ?? org?.name,
    billToAddress: quote ? quote.billToAddress : org ? orgAddress(org) : null,
    billToGstin: quote ? quote.billToGstin : org?.gstin,
    placeOfSupply: quote?.placeOfSupply ?? normalizeState(org?.state, options.settings.companyState),
    issueDate: toDateInput(today),
    dueDate: dateIn(options.paymentTermsDays, today),
    notes: quote ? `As per our quotation ${quote.number}.` : null,
    lines: quoteLines ?? [line(options.settings, description, remaining ? String(remaining) : "")],
  };

  return (
    <>
      <PageHeader
        title="New invoice"
        subtitle={
          quote
            ? `From accepted quote ${quote.number} (${formatINR(quote.subtotal)} before GST${quoteBilled ? `, ${formatINR(quoteBilled)} already billed` : ""}). Change the amounts to bill an instalment.`
            : deal
            ? `For the won deal “${deal.title}” (${formatINR(deal.value)}${billed ? `, ${formatINR(billed)} already billed` : ""}). Change the amount to bill an instalment.`
            : "Saved as a draft. It gets its number when you issue it."
        }
      />
      <div className="max-w-5xl">
        <InvoiceForm
          action={createInvoice}
          orgs={options.orgs}
          contacts={options.contacts}
          deals={options.deals}
          projects={options.projects}
          settings={options.settings}
          defaults={defaults}
          submitLabel="Save draft"
        />
      </div>
    </>
  );
}
