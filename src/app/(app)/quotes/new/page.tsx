import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatINR, toDateInput } from "@/lib/format";
import { normalizeState } from "@/lib/invoices";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/time";
import { InvoiceForm, type InvoiceDefaults } from "../../invoices/invoice-form";
import { dateIn, line, orgAddress } from "../../invoices/data";
import { createQuote } from "../actions";
import { quoteFormOptions } from "../data";

export const metadata = { title: "New quote" };

/** Opened blank, from a CRM deal (?deal=) or from an institution (?org=). */
export default async function NewQuotePage({ searchParams }: PageProps<"/quotes/new">) {
  await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const [options, settings] = await Promise.all([quoteFormOptions(), getSettings()]);
  const today = todayIST();

  const deal = sp.deal ? await db.deal.findUnique({ where: { id: sp.deal } }) : null;
  const orgId = sp.org ?? deal?.organizationId ?? undefined;
  const org = orgId ? await db.organization.findUnique({ where: { id: orgId } }) : null;
  const description = deal ? [deal.program ?? deal.title, deal.students && `${deal.students} students`].filter(Boolean).join(", ") : "";

  const defaults: InvoiceDefaults = {
    organizationId: org?.id,
    contactId: deal?.contactId,
    dealId: deal?.id,
    billToName: org?.name,
    billToAddress: org ? orgAddress(org) : null,
    billToGstin: org?.gstin,
    placeOfSupply: normalizeState(org?.state, options.settings.companyState),
    issueDate: toDateInput(today),
    dueDate: dateIn(settings.quoteValidDays, today),
    terms: settings.quoteTerms,
    lines: [line(options.settings, description, deal && Number(deal.value) > 0 ? String(Number(deal.value)) : "")],
  };

  return (
    <>
      <PageHeader
        title="New quote"
        subtitle={
          deal
            ? `For the deal “${deal.title}”${Number(deal.value) > 0 ? ` (now ${formatINR(deal.value)})` : ""}. Saved as a draft; it gets its number when you mark it sent.`
            : "Saved as a draft. It gets its number when you mark it sent."
        }
      />
      {deal && !org && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          This deal has no school or institution yet. Pick one below and the deal will take it when the quote is accepted.
        </p>
      )}
      <div className="max-w-5xl">
        <InvoiceForm
          kind="quote"
          action={createQuote}
          orgs={options.orgs}
          contacts={options.contacts}
          deals={options.deals}
          projects={[]}
          settings={options.settings}
          defaults={defaults}
          submitLabel="Save draft"
        />
      </div>
    </>
  );
}
