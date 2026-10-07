import Link from "next/link";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";
import { financialYear } from "@/lib/invoices";
import { todayIST } from "@/lib/time";
import { audienceLabel, dateSpan, modeLabel } from "@/lib/workshops";
import { WorkshopBadge } from "./ui";

export const metadata = { title: "Workshops" };

/** FY start (1 April) of a financial year label like "26-27". */
const fyStart = (fy: string) => new Date(Date.UTC(2000 + Number(fy.slice(0, 2)), 3, 1));

export default async function WorkshopsPage({ searchParams }: PageProps<"/workshops">) {
  const user = await requireUser();
  const manager = isManagerOrAdmin(user);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const today = todayIST();
  const fy = financialYear(today);
  const since = fyStart(fy);

  const [workshops, regsThisYear, collected, certsThisYear, found] = await Promise.all([
    db.workshop.findMany({
      include: {
        organization: { select: { name: true } },
        trainers: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
        _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
      },
      orderBy: { startDate: "desc" },
    }),
    db.workshopRegistration.count({ where: { status: "REGISTERED", workshop: { startDate: { gte: since }, status: { not: "CANCELLED" } } } }),
    manager ? db.workshopPayment.aggregate({ where: { paidOn: { gte: since } }, _sum: { amount: true } }) : null,
    db.workshopCertificate.count({ where: { fy, status: "ISSUED" } }),
    sp.cert
      ? db.workshopCertificate.findFirst({
          where: { number: { equals: sp.cert.trim(), mode: "insensitive" } },
          include: { registration: { include: { workshop: { select: { id: true, title: true, startDate: true, endDate: true } } } } },
        })
      : null,
  ]);
  const upcoming = workshops.filter((w) => w.status === "UPCOMING" && w.endDate >= today).reverse();
  const past = workshops.filter((w) => !upcoming.includes(w));

  const table = (list: typeof workshops) => (
    <div className="card overflow-x-auto p-0">
      <table className="table">
        <thead>
          <tr>
            <th>Workshop</th>
            <th>Dates</th>
            <th>Host</th>
            <th>Trainers</th>
            <th className="text-right">Registered</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {list.map((w) => (
            <tr key={w.id}>
              <td>
                <Link href={`/workshops/${w.id}`} className="link font-medium">
                  {w.title}
                </Link>
                <div className="text-xs text-slate-500">
                  {audienceLabel[w.audience]} · {modeLabel[w.mode]}
                </div>
              </td>
              <td className="whitespace-nowrap">{dateSpan(w)}</td>
              <td>{w.organization?.name ?? <span className="text-slate-400">Our own</span>}</td>
              <td className="text-slate-600">{w.trainers.map((t) => t.user.name).join(", ") || <span className="text-amber-700">None yet</span>}</td>
              <td className="text-right whitespace-nowrap">
                {w._count.registrations}
                {w.capacity ? <span className="text-slate-400"> / {w.capacity}</span> : null}
              </td>
              <td>
                <WorkshopBadge status={w.status === "UPCOMING" && w.endDate < today ? "COMPLETED" : w.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Workshops"
        subtitle="College and professional workshops: registrations, fees, attendance and certificates."
        actions={
          manager && (
            <Link href="/workshops/new" className="btn-primary">
              New workshop
            </Link>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Upcoming workshops" value={upcoming.length} />
        <Stat label={`Participants this year (${fy})`} value={regsThisYear} />
        {manager && <Stat label="Fees received this year" value={formatINR(Number(collected?._sum.amount ?? 0))} />}
        <Stat label="Certificates issued this year" value={certsThisYear} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Coming up</h2>
        {upcoming.length ? table(upcoming) : <Empty>No workshops coming up.{manager && " Press “New workshop” to plan one."}</Empty>}
      </section>

      {past.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold">Past and cancelled</h2>
          {table(past)}
        </section>
      )}

      <section className="card max-w-xl">
        <h2 className="font-semibold">Check a certificate</h2>
        <p className="mb-3 text-xs text-slate-500">When a college or employer asks whether a certificate is genuine, look up its number here.</p>
        <form className="flex gap-2">
          <input name="cert" defaultValue={sp.cert ?? ""} placeholder="e.g. EBG/CERT/26-27/0001" className="input" />
          <button className="btn-secondary">Check</button>
        </form>
        {sp.cert && (
          <div className="mt-3 text-sm">
            {!found ? (
              <p className="text-red-700">No certificate has the number “{sp.cert}”.</p>
            ) : (
              <p>
                {found.status === "ISSUED" ? <Badge color="green">Genuine</Badge> : <Badge color="red">Cancelled</Badge>}{" "}
                <strong>{found.number}</strong> was issued to <strong>{found.registration.name}</strong> on {formatDate(found.issuedOn)} for{" "}
                <Link href={`/workshops/${found.registration.workshop.id}`} className="link">
                  {found.registration.workshop.title}
                </Link>{" "}
                ({dateSpan(found.registration.workshop)}).
                {found.status === "CANCELLED" && ` Cancelled: “${found.cancelReason}”.`}
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
