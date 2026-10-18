import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { readRange, rangeText } from "@/lib/dashboard-range";
import { OPEN_STAGES } from "../../crm/constants";
import { moneyRecords, total } from "../records";
import { dashboardHref } from "../ui";

export const metadata = { title: "Dashboard records" };

type Line = { key: string; on: Date | null; what: ReactNode; who: string; amount: number | null; href?: string };

const SHOWS: Record<string, string> = {
  won: "Deals won",
  invoiced: "Invoiced, less credit notes",
  received: "Received from schools",
  paid: "Paid out",
  money: "Money in and out",
  sessions: "School sessions",
  pipeline: "Open deals",
};

function Section({ title, lines, money = true }: { title: string; lines: Line[]; money?: boolean }) {
  const sum = total(lines.map((l) => ({ amount: l.amount ?? 0 })));
  return (
    <section className="card mb-6 min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm font-semibold tabular-nums">{money ? formatINR(sum) : `${lines.length}`}</span>
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing on these dates.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {lines.map((l) => (
            <li key={l.key} className="flex items-baseline justify-between gap-3 py-2">
              <div className="min-w-0">
                {l.href ? (
                  <Link href={l.href} className="link">
                    {l.what}
                  </Link>
                ) : (
                  <span className="font-medium">{l.what}</span>
                )}
                <div className="truncate text-xs text-slate-500">
                  {l.on ? formatDate(l.on) : ""}
                  {l.who ? ` · ${l.who}` : ""}
                </div>
              </div>
              {l.amount !== null && <span className={`shrink-0 tabular-nums ${l.amount < 0 ? "text-red-600" : ""}`}>{formatINR(l.amount)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The records behind one dashboard figure or bar, for the same dates, so the total matches what was clicked. */
export default async function DashboardListPage({ searchParams }: PageProps<"/dashboard/list">) {
  await requireOwner();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const today = todayIST();
  const range = readRange({ range: "custom", from: sp.from, to: sp.to }, today);
  const show = sp.show && sp.show in SHOWS ? sp.show : "money";
  const back = (
    <Link href={dashboardHref(range)} className="btn-secondary">
      Back to dashboard
    </Link>
  );
  const sections: ReactNode[] = [];

  if (show === "sessions") {
    const status = ["COMPLETED", "MISSED", "CANCELLED"].includes(sp.status ?? "") ? (sp.status as "COMPLETED" | "MISSED" | "CANCELLED") : "COMPLETED";
    const rows = await db.programmeSession.findMany({
      where: { status, date: { gte: range.from, lte: range.to } },
      select: { id: true, date: true, startTime: true, classGroup: true, programme: { select: { name: true, organization: { select: { name: true } } } }, trainer: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 500,
    });
    sections.push(
      <Section
        key="s"
        money={false}
        title={`${humanize(status === "COMPLETED" ? "HELD" : status)} sessions`}
        lines={rows.map((r) => ({
          key: r.id,
          on: r.date,
          what: `${r.programme.organization?.name ?? r.programme.name}${r.classGroup ? ` · ${r.classGroup}` : ""}`,
          who: [r.startTime, r.trainer?.name].filter(Boolean).join(" · "),
          amount: null,
          href: `/operations/sessions/${r.id}`,
        }))}
      />,
    );
  } else if (show === "pipeline") {
    const stage = OPEN_STAGES.find((s) => s === sp.stage);
    const rows = await db.deal.findMany({
      where: { stage: stage ? stage : { in: [...OPEN_STAGES] } },
      select: { id: true, title: true, value: true, expectedClose: true, organization: { select: { name: true } } },
      orderBy: { value: "desc" },
    });
    sections.push(
      <Section
        key="p"
        title={`${stage ? humanize(stage) : "All open"} deals, now`}
        lines={rows.map((r) => ({ key: r.id, on: r.expectedClose, what: r.title, who: r.organization?.name ?? "", amount: Number(r.value), href: `/crm/deals/${r.id}` }))}
      />,
    );
  } else {
    const m = await moneyRecords(range.from, range.to, today);
    if (show === "won")
      sections.push(<Section key="w" title="Deals won" lines={m.won.map((r) => ({ key: r.id, on: r.on, what: r.title, who: r.organization?.name ?? "", amount: r.amount, href: `/crm/deals/${r.id}` }))} />);
    if (show === "invoiced") {
      sections.push(<Section key="i" title="Invoices issued" lines={m.invoices.map((r) => ({ key: r.id, on: r.on, what: r.number ?? "Invoice", who: r.organization.name, amount: r.amount, href: `/invoices/${r.id}` }))} />);
      sections.push(<Section key="c" title="Credit notes (taken off)" lines={m.creditNotes.map((r) => ({ key: r.id, on: r.on, what: r.number, who: r.invoice.organization.name, amount: r.amount, href: `/credit-notes/${r.id}` }))} />);
    }
    if (show === "received" || show === "money") {
      sections.push(
        <Section key="r" title="Payments received" lines={m.payments.map((r) => ({ key: r.id, on: r.on, what: r.invoice.number ?? "Invoice", who: `${r.invoice.organization.name} · ${humanize(r.method)}`, amount: r.amount, href: `/invoices/${r.invoice.id}` }))} />,
      );
      sections.push(<Section key="rf" title="Refunds to schools (taken off)" lines={m.refunds.map((r) => ({ key: r.id, on: r.on, what: r.number, who: r.invoice.organization.name, amount: r.amount, href: `/credit-notes/${r.id}` }))} />);
    }
    if (show === "paid" || show === "money") {
      sections.push(<Section key="v" title="Paid to vendors" lines={m.vendorPayments.map((r) => ({ key: r.id, on: r.on, what: `Bill ${r.bill.billNo}`, who: r.bill.vendor.name, amount: r.amount, href: `/purchases/bills/${r.bill.id}` }))} />);
      sections.push(<Section key="sa" title="Salaries" lines={m.salaries.map((r) => ({ key: r.month, on: r.on, what: `Payroll ${r.month}`, who: `${r.people} people · ${humanize(r.status)}`, amount: r.amount, href: `/payroll/${r.month}` }))} />);
      sections.push(<Section key="cl" title="Expense claims paid outside payroll" lines={m.claims.map((r) => ({ key: r.id, on: r.on, what: r.description, who: `${r.employee.firstName} ${r.employee.lastName}`, amount: r.amount }))} />);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Owner dashboard" title={SHOWS[show]} subtitle={show === "pipeline" ? "Open deals today, largest first." : rangeText(range.from, range.to)} actions={back} />
      {sections.length ? sections : <Empty>Nothing to show.</Empty>}
    </>
  );
}
