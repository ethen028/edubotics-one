import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/invoices";
import { invoicesWithBalance } from "../data";

export const metadata = { title: "Payments due" };

const BUCKETS = [
  ["Not yet due", (d: number) => d <= 0],
  ["1–30 days late", (d: number) => d >= 1 && d <= 30],
  ["31–60", (d: number) => d >= 31 && d <= 60],
  ["61–90", (d: number) => d >= 61 && d <= 90],
  ["Over 90", (d: number) => d > 90],
] as const;

/** Who owes what, school by school, oldest debts first: the list to work through when chasing payments. */
export default async function DuesPage() {
  await requireUser(["ADMIN", "MANAGER"]);
  const open = (await invoicesWithBalance({ status: "ISSUED" })).filter((i) => i.balance > 0);

  const bySchool = new Map<
    string,
    { org: (typeof open)[number]["organization"]; contact: (typeof open)[number]["contact"]; invoices: typeof open }
  >();
  for (const i of open) {
    const row = bySchool.get(i.organizationId) ?? { org: i.organization, contact: i.contact, invoices: [] };
    row.contact ??= i.contact;
    row.invoices.push(i);
    bySchool.set(i.organizationId, row);
  }
  const schools = [...bySchool.values()]
    .map((s) => ({
      ...s,
      total: s.invoices.reduce((n, i) => n + i.balance, 0),
      buckets: BUCKETS.map(([, test]) => s.invoices.filter((i) => test(i.daysLate)).reduce((n, i) => n + i.balance, 0)),
      oldest: Math.max(...s.invoices.map((i) => i.daysLate)),
      invoices: s.invoices.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()),
    }))
    .sort((a, b) => b.oldest - a.oldest || b.total - a.total);
  const column = (k: number) => schools.reduce((n, s) => n + s.buckets[k], 0);
  const total = schools.reduce((n, s) => n + s.total, 0);

  return (
    <>
      <PageHeader
        title="Payments due"
        subtitle="Unpaid invoices by school, the longest overdue first."
        actions={
          <Link href="/invoices" className="btn-secondary">
            All invoices
          </Link>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Still to collect" value={formatMoney(total)} />
        <Stat label="Overdue" value={formatMoney(total - column(0))} />
        <Stat label="Over 60 days late" value={formatMoney(column(3) + column(4))} />
        <Stat label="Schools owing" value={schools.length} />
      </div>

      {schools.length === 0 ? (
        <Empty>Nothing is owed right now.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>School / institution</th>
                {BUCKETS.map(([label]) => (
                  <th key={label} className="text-right">
                    {label}
                  </th>
                ))}
                <th className="text-right">Total due</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.org.id}>
                  <td>
                    <Link href={`/crm/organizations/${s.org.id}`} className="link">
                      {s.org.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {[s.contact?.name, s.contact?.phone ?? s.org.phone].filter(Boolean).join(" · ")}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {s.invoices.map((i) => (
                        <li key={i.id}>
                          <Link href={`/invoices/${i.id}`} className="link">
                            {i.number}
                          </Link>{" "}
                          <span className={i.daysLate > 0 ? "text-red-600" : "text-slate-500"}>
                            {formatMoney(i.balance)}, due {formatDate(i.dueDate)}
                            {i.daysLate > 0 && ` (${i.daysLate} days late)`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  {s.buckets.map((v, k) => (
                    <td key={k} className={`text-right whitespace-nowrap ${v > 0 && k > 0 ? "text-red-600" : ""}`}>
                      {v > 0 ? formatMoney(v) : "—"}
                    </td>
                  ))}
                  <td className="text-right font-semibold whitespace-nowrap">{formatMoney(s.total)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                {BUCKETS.map(([label], k) => (
                  <td key={label} className="text-right whitespace-nowrap">
                    {formatMoney(column(k))}
                  </td>
                ))}
                <td className="text-right whitespace-nowrap">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
