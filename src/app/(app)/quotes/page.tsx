import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { formatMoney } from "@/lib/invoices";
import { quoteStateColor, quoteStateLabel, type QuoteState } from "@/lib/quotes";
import { quotesWithState } from "./data";

export const metadata = { title: "Quotes" };

const FILTERS: [string, string, (s: QuoteState) => boolean][] = [
  ["waiting", "Waiting for answer", (s) => s === "WAITING"],
  ["expired", "Expired", (s) => s === "EXPIRED"],
  ["draft", "Drafts", (s) => s === "DRAFT"],
  ["accepted", "Accepted", (s) => s === "ACCEPTED"],
  ["declined", "Declined", (s) => s === "DECLINED"],
  ["all", "All", () => true],
];

export default async function QuotesPage({ searchParams }: PageProps<"/quotes">) {
  await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const filter = FILTERS.find(([k]) => k === sp.show) ?? FILTERS[0];
  const quotes = await quotesWithState();
  const shown = quotes.filter((q) => filter[2](q.state));

  const today = todayIST();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const yearAgo = new Date(today.getTime() - 365 * 86400000);
  const waiting = quotes.filter((q) => q.state === "WAITING");
  const expiringSoon = waiting.filter((q) => q.daysLeft <= 7);
  const acceptedThisMonth = quotes.filter((q) => q.state === "ACCEPTED" && q.decidedOn && q.decidedOn >= monthStart);
  // Of the quotes answered (or left to expire) in the last year, how many the schools took.
  const answered = quotes.filter(
    (q) => (q.state === "ACCEPTED" || q.state === "DECLINED" || q.state === "EXPIRED") && q.quoteDate >= yearAgo,
  );
  const winRate = answered.length ? Math.round((answered.filter((q) => q.state === "ACCEPTED").length / answered.length) * 100) : null;
  const toInvoice = quotes.filter((q) => q.state === "ACCEPTED" && q.billed < Number(q.subtotal) - 0.005);

  return (
    <>
      <PageHeader
        title="Quotes"
        subtitle="Price quotes to schools and institutions. An accepted quote wins its deal and turns into an invoice."
        actions={
          <Link href="/quotes/new" className="btn-primary">
            New quote
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={`Waiting for answer (${waiting.length})`}
          value={formatINR(waiting.reduce((n, q) => n + Number(q.subtotal), 0))}
          href="/quotes?show=waiting"
        />
        <Stat label="Expiring in 7 days" value={expiringSoon.length} href="/quotes?show=waiting" />
        <Stat label="Accepted this month" value={formatINR(acceptedThisMonth.reduce((n, q) => n + Number(q.subtotal), 0))} />
        <Stat label="Accepted, last 12 months" value={winRate === null ? "—" : `${winRate}%`} />
      </div>

      {toInvoice.length > 0 && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm">
          {toInvoice.length === 1 ? "One accepted quote is" : `${toInvoice.length} accepted quotes are`} not fully invoiced yet:{" "}
          {toInvoice.map((q, i) => (
            <span key={q.id}>
              {i > 0 && ", "}
              <Link href={`/quotes/${q.id}`} className="link">
                {q.number} ({q.organization.name})
              </Link>
            </span>
          ))}
          .
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, label, test]) => (
          <Link
            key={k}
            href={`?show=${k}`}
            className={`rounded-full px-3 py-1 ${k === filter[0] ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {label} ({quotes.filter((q) => test(q.state)).length})
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty>
          {quotes.length === 0 ? "No quotes yet. Start one here, or from a deal in the CRM." : `No ${filter[1].toLowerCase()} quotes.`}
        </Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Quote</th>
                <th>School / institution</th>
                <th>Deal</th>
                <th>Date</th>
                <th>Valid until</th>
                <th className="text-right">Before GST</th>
                <th className="text-right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => (
                <tr key={q.id}>
                  <td>
                    <Link href={`/quotes/${q.id}`} className="link whitespace-nowrap">
                      {q.number ?? "Draft"}
                    </Link>
                  </td>
                  <td>{q.organization.name}</td>
                  <td>
                    {q.deal ? (
                      <Link href={`/crm/deals/${q.deal.id}`} className="link">
                        {q.deal.title}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap">{formatDate(q.quoteDate)}</td>
                  <td className={`whitespace-nowrap ${q.state === "EXPIRED" ? "text-amber-700" : ""}`}>
                    {formatDate(q.validUntil)}
                    {q.state === "WAITING" && q.daysLeft <= 7 && (
                      <div className="text-xs text-amber-700">{q.daysLeft === 0 ? "last day" : `${q.daysLeft} days left`}</div>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">{formatMoney(q.subtotal)}</td>
                  <td className="text-right whitespace-nowrap">{formatMoney(q.total)}</td>
                  <td>
                    <Badge color={quoteStateColor[q.state]}>{quoteStateLabel[q.state]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
