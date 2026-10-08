import Link from "next/link";
import type { ReactNode } from "react";
import { isAdmin, requireUser } from "@/lib/auth";
import { PageHeader, Stat } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { fyLabel } from "@/lib/accounts";
import { accountsSummary, openBalances } from "./data";

export const metadata = { title: "Accounts summary" };

/** Rupees with a minus sign for money going the other way, "–" for nothing. */
function Amount({ value, strong, tone }: { value: number; strong?: boolean; tone?: boolean }) {
  if (value === 0) return <span className="text-slate-400">–</span>;
  const color = tone ? (value < 0 ? "text-red-700" : "text-emerald-700") : "";
  return <span className={`${color} ${strong ? "font-semibold" : ""}`}>{value < 0 ? `−${formatINR(-value)}` : formatINR(value)}</span>;
}

function Line({ label, value, note, href, minus, strong }: { label: ReactNode; value: number; note?: string; href?: string; minus?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "border-t border-slate-200 font-semibold" : ""}`}>
      <div>
        {href ? (
          <Link href={href} className="link">
            {label}
          </Link>
        ) : (
          label
        )}
        {note && <div className="text-xs font-normal text-slate-500">{note}</div>}
      </div>
      <div className="text-right whitespace-nowrap">
        <Amount value={minus ? -value : value} strong={strong} tone={strong} />
      </div>
    </div>
  );
}

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  // Purchase bills and payables are admin pages; managers see the totals without the links.
  const admin = isAdmin(user);
  const { fy: fyParam } = (await searchParams) as Record<string, string | undefined>;
  const [a, open] = await Promise.all([accountsSummary(fyParam), openBalances()]);
  const t = a.total;
  const inProgress = a.fy === a.current;
  const period = inProgress ? `${fyLabel(a.fy)} so far` : fyLabel(a.fy);

  return (
    <>
      <PageHeader
        title="Accounts summary"
        subtitle="Income and spending by month, GST collected and paid, and a simple profit and loss, from the invoices, bills, payroll and claims already in the app."
        actions={
          <a href={`/accounts/export?fy=${a.fy}`} download className="btn-secondary">
            Download spreadsheet
          </a>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Financial year</span>
        {a.fys.map((fy) => (
          <Link
            key={fy}
            href={fy === a.current ? "/accounts" : `/accounts?fy=${fy}`}
            className={`rounded-full border px-3 py-1 ${fy === a.fy ? "border-brand-500 bg-brand-50 font-medium text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
          >
            {fyLabel(fy)}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Income, ${period}`} value={formatINR(t.income)} />
        <Stat label="Spending" value={formatINR(t.spending)} />
        <Stat
          label={t.profit < 0 ? "Loss" : "Profit"}
          value={<span className={t.profit < 0 ? "text-red-700" : "text-emerald-700"}>{formatINR(Math.abs(t.profit))}</span>}
        />
        <Stat
          label={t.gstToPay < 0 ? "GST credit carried forward" : "GST to pay (collected less paid)"}
          value={formatINR(Math.abs(t.gstToPay))}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold">Profit and loss, {period}</h2>
          <p className="mb-3 text-xs text-slate-500">Counted when invoiced, billed or earned, before GST.</p>
          <div className="text-sm">
            <div className="pt-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">Income</div>
            <Line label="Invoiced to schools and colleges" value={t.sales} href="/invoices" />
            <Line label="Less credit notes" value={t.credited} minus href="/credit-notes" />
            <Line label="Workshop fees received" value={t.workshopFees} note="Per-person fees, as received" href="/workshops" />
            <Line label="Total income" value={t.income} strong />
            <div className="pt-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Spending</div>
            <Line label="Bought from vendors" value={t.purchases} minus href={admin ? "/purchases/payables" : undefined} />
            <Line label="Salaries" value={t.salaries} minus note="Finalised payroll, after loss of pay" />
            <Line label="Staff expense claims" value={t.claims} minus href="/expenses/team" />
            <Line label="Total spending" value={t.spending} minus strong />
            <div className="mt-2">
              <Line label={t.profit < 0 ? "Loss" : "Profit"} value={t.profit} strong />
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section className="card">
            <h2 className="font-semibold">Money in and out, {period}</h2>
            <p className="mb-3 text-xs text-slate-500">What actually reached or left the bank or cash box.</p>
            <div className="text-sm">
              <Line label="Received from schools and colleges" value={t.receivedSchools} note="TDS they held back is not counted here" href="/invoices/dues" />
              <Line label="Workshop fees received" value={t.receivedWorkshops} />
              <Line label="Refunded to schools" value={t.refunds} minus />
              <Line label="Paid to vendors" value={t.paidVendors} minus href={admin ? "/purchases/payables" : undefined} />
              <Line label="Salaries paid" value={t.paidSalaries} minus note="Net pay, with claims paid in salary" />
              <Line label="Claims paid outside payroll" value={t.paidClaims} minus />
              <Line label={t.netCash < 0 ? "More went out than came in" : "More came in than went out"} value={t.netCash} strong />
            </div>
          </section>

          <section className="card">
            <h2 className="mb-2 font-semibold">Owed today</h2>
            <div className="text-sm">
              <Line label="Schools still owe us" value={open.owedToUs} href="/invoices/dues" />
              {open.owedBack > 0 && <Line label="We owe schools back (credit notes)" value={open.owedBack} minus href="/credit-notes" />}
              <Line label="We still owe vendors" value={open.toVendors} minus href={admin ? "/purchases/payables" : undefined} />
              <Line label="Approved claims not yet paid" value={open.claimsToPay} minus href="/expenses/team" />
            </div>
          </section>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-3 font-semibold">Month by month</h2>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Income</th>
                <th className="text-right">Spending</th>
                <th className="text-right">Profit</th>
                <th className="text-right">Money in</th>
                <th className="text-right">Money out</th>
                <th className="text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((m) => (
                <tr key={m.key}>
                  <td className="whitespace-nowrap">{m.label}</td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.income} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.spending} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.profit} tone />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.moneyIn} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.moneyOut} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.netCash} tone />
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                <td className="text-right whitespace-nowrap">
                  <Amount value={t.income} />
                </td>
                <td className="text-right whitespace-nowrap">
                  <Amount value={t.spending} />
                </td>
                <td className="text-right whitespace-nowrap">
                  <Amount value={t.profit} tone />
                </td>
                <td className="text-right whitespace-nowrap">
                  <Amount value={t.moneyIn} />
                </td>
                <td className="text-right whitespace-nowrap">
                  <Amount value={t.moneyOut} />
                </td>
                <td className="text-right whitespace-nowrap">
                  <Amount value={t.netCash} tone />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-semibold">GST collected and paid</h2>
        <p className="mb-3 text-xs text-slate-500">
          {a.gstEnabled
            ? "Collected on invoices less credit notes, against GST on vendor bills. A guide for the monthly return; the invoice and credit note spreadsheets carry the detail your accountant files from."
            : "GST is switched off in Admin → Settings → Invoices, so new invoices carry no GST."}
        </p>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">CGST</th>
                <th className="text-right">SGST</th>
                <th className="text-right">IGST</th>
                <th className="text-right">Collected</th>
                <th className="text-right">Paid on bills</th>
                <th className="text-right">To pay</th>
              </tr>
            </thead>
            <tbody>
              {[...a.rows, { ...t, key: "total", label: "Total" }].map((m) => (
                <tr key={m.key} className={m.key === "total" ? "font-semibold" : ""}>
                  <td className="whitespace-nowrap">{m.label}</td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.cgstOut} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.sgstOut} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.igstOut} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.gstNetOut} />
                    {m.gstCredited > 0 && <div className="text-xs font-normal text-slate-500">after {formatINR(m.gstCredited)} credit notes</div>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Amount value={m.gstIn} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {m.gstToPay < 0 ? (
                      <span className="text-emerald-700">{formatINR(-m.gstToPay)} credit</span>
                    ) : (
                      <Amount value={m.gstToPay} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card mb-6 max-w-2xl">
        <h2 className="mb-2 font-semibold">Income tax held back (TDS), {period}</h2>
        <div className="text-sm">
          <Line label="Held back by schools from our invoices" value={t.tdsBySchools} note="Claim it in the company's income tax return; check it against Form 26AS" />
          <Line label="We held back from vendors" value={t.tdsOnVendors} note="Due to the government by the 7th of the next month" />
          <Line label="We held back from salaries" value={t.tdsOnSalaries} note="Only when TDS is switched on for payroll" />
        </div>
      </section>

      <details className="card max-w-3xl text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-900">How these numbers are worked out</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Income counts issued invoices on their invoice date, before GST. Drafts and cancelled invoices are left out.</li>
          <li>
            A credit note lowers income and GST in the month it is dated. Past 30 November after the invoice&apos;s financial year GST can no longer be
            reduced, so the whole credit, tax included, comes off income instead.
          </li>
          <li>Workshop fees paid by each person count when received, as entered. Workshops the host college pays for are billed with a normal invoice.</li>
          <li>Vendor bills count on the bill date, before GST, whether the goods went into stock or were used up.</li>
          <li>Salaries count once a month&apos;s payroll is finalised: earned pay after loss of pay and recoveries. Employer PF and ESI are not tracked.</li>
          <li>Expense claims count once approved, on the day the money was spent. Rejected and waiting claims are left out.</li>
          <li>Money in leaves out TDS the school held back; money out leaves out TDS held back from vendors. Both are listed under TDS.</li>
          <li>Rent, electricity, bank charges and anything else paid outside the app are not here yet.</li>
        </ul>
      </details>
    </>
  );
}
