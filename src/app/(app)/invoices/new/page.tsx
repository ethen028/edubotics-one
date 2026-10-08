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

/** Opened blank, or from a won deal (?deal=), a delivery project (?project=) or an institution (?org=). */
export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const options = await invoiceFormOptions();
  const today = todayIST();

  const project = sp.project ? await db.project.findUnique({ where: { id: sp.project } }) : null;
  const dealId = sp.deal ?? project?.dealId ?? undefined;
  const deal = dealId ? await db.deal.findUnique({ where: { id: dealId } }) : null;
  const orgId = sp.org ?? deal?.organizationId ?? project?.organizationId ?? undefined;
  const org = orgId ? await db.organization.findUnique({ where: { id: orgId } }) : null;
  const billed = deal ? await billedForDeal(deal.id) : 0;
  const remaining = deal ? Math.max(0, Number(deal.value) - billed) : 0;

  const description = deal
    ? [deal.program ?? deal.title, deal.students && `${deal.students} students`].filter(Boolean).join(", ")
    : (project?.name ?? "");

  const defaults: InvoiceDefaults = {
    organizationId: org?.id,
    contactId: deal?.contactId,
    dealId: deal?.id,
    projectId: project?.id ?? (deal ? (await db.project.findFirst({ where: { dealId: deal.id }, select: { id: true } }))?.id : null),
    billToName: org?.name,
    billToAddress: org ? orgAddress(org) : null,
    billToGstin: org?.gstin,
    placeOfSupply: normalizeState(org?.state, options.settings.companyState),
    issueDate: toDateInput(today),
    dueDate: dateIn(options.paymentTermsDays, today),
    lines: [line(options.settings, description, remaining ? String(remaining) : "")],
  };

  return (
    <>
      <PageHeader
        title="New invoice"
        subtitle={
          deal
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
