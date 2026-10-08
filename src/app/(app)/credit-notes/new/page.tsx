import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatDate, toDateInput } from "@/lib/format";
import { formatMoney } from "@/lib/invoices";
import { gstCreditDeadline } from "@/lib/credit-notes";
import { todayIST } from "@/lib/time";
import { createCreditNote } from "../actions";
import { invoiceForCredit } from "../data";
import { CreditNoteForm } from "../credit-note-form";

export const metadata = { title: "New credit note" };

/** Opened from an issued invoice (?invoice=). */
export default async function NewCreditNotePage({ searchParams }: PageProps<"/credit-notes/new">) {
  await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const ctx = sp.invoice ? await invoiceForCredit(sp.invoice) : null;
  if (!ctx) notFound();
  const { invoice } = ctx;
  const today = todayIST();
  const deadline = gstCreditDeadline(invoice.issueDate);
  const nothingLeft = ctx.remaining.total <= 0;

  return (
    <>
      <PageHeader
        title="New credit note"
        subtitle={
          <>
            Against invoice{" "}
            <Link href={`/invoices/${invoice.id}`} className="link">
              {invoice.number}
            </Link>{" "}
            to {invoice.organization.name}, dated {formatDate(invoice.issueDate)}, for {formatMoney(invoice.total)}.
          </>
        }
      />
      <div className="max-w-5xl space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-slate-500">Invoice total</div>
            <div className="font-semibold">{formatMoney(invoice.total)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Already credited</div>
            <div className="font-semibold">{formatMoney(ctx.credited)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Received + TDS</div>
            <div className="font-semibold">{formatMoney(ctx.settled)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Still due</div>
            <div className="font-semibold">{formatMoney(ctx.balance)}</div>
          </div>
        </div>
        {invoice.status !== "ISSUED" || nothingLeft ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            {invoice.status !== "ISSUED" ? "Only an issued invoice can have a credit note." : "This invoice has already been credited in full."}
          </p>
        ) : (
          <>
            {ctx.settled > 0 && (
              <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
                The school has already paid {formatMoney(ctx.settled)}. If the credit is more than the {formatMoney(ctx.balance)} still due, the
                difference shows as money to refund, and you can record the refund on the credit note.
              </p>
            )}
            {today > deadline && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                The GST deadline for reducing tax on this invoice was {formatDate(deadline)} (30 November after its financial year). A credit note
                still lowers what the school owes, but the GST already declared can&apos;t be reduced. Check with your accountant.
              </p>
            )}
            <CreditNoteForm
              action={createCreditNote.bind(null, invoice.id)}
              lines={ctx.lines.map((l) => ({
                id: l.id,
                description: l.description,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
                gstRate: Number(l.gstRate),
                amount: Number(l.amount),
                left: l.left,
              }))}
              interState={ctx.interState}
              taxed={ctx.lines.some((l) => Number(l.gstRate) > 0)}
              today={toDateInput(today)}
              minDate={toDateInput(invoice.issueDate)}
            />
          </>
        )}
      </div>
    </>
  );
}
