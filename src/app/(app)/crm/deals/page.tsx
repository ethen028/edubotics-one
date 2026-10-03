import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { daysFromNow } from "@/lib/time";
import { Badge, PageHeader } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { moveDeal } from "../actions";
import { DEAL_STAGES, OPEN_STAGES, dealStageColor } from "../constants";

export const metadata = { title: "Deals" };

export default async function DealsPage({ searchParams }: PageProps<"/crm/deals">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const mine = sp.mine === "1";
  const showClosed = sp.closed === "1";
  const ninetyDaysAgo = daysFromNow(-90);

  const deals = await db.deal.findMany({
    where: {
      ...(mine ? { ownerId: user.id } : {}),
      // Closed deals only from the last 90 days, to keep the board readable.
      OR: [{ stage: { in: [...OPEN_STAGES] } }, ...(showClosed ? [{ closedAt: { gte: ninetyDaysAgo } }] : [])],
    },
    include: { organization: true, owner: true },
    orderBy: [{ expectedClose: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  const stages = showClosed ? DEAL_STAGES : OPEN_STAGES;
  const openValue = deals.filter((d) => (OPEN_STAGES as readonly string[]).includes(d.stage)).reduce((s, d) => s + Number(d.value), 0);
  const today = new Date();

  return (
    <>
      <PageHeader
        title="Deals"
        subtitle={`Open pipeline ${formatINR(openValue)}`}
        actions={
          <>
            <Link href={`?mine=${mine ? "0" : "1"}${showClosed ? "&closed=1" : ""}`} className="btn-secondary">
              {mine ? "Show everyone's" : "Only mine"}
            </Link>
            <Link href={`?closed=${showClosed ? "0" : "1"}${mine ? "&mine=1" : ""}`} className="btn-secondary">
              {showClosed ? "Hide won/lost" : "Show won/lost"}
            </Link>
            <Link href="/crm/deals/new" className="btn-primary">
              Add deal
            </Link>
          </>
        }
      />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const col = deals.filter((d) => d.stage === stage);
          const total = col.reduce((s, d) => s + Number(d.value), 0);
          return (
            <div key={stage} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <Badge color={dealStageColor[stage]}>{humanize(stage)}</Badge>
                <span className="text-xs text-slate-500">
                  {col.length} · {formatINR(total)}
                </span>
              </div>
              <div className="space-y-2">
                {col.map((d) => {
                  const late = d.expectedClose && d.expectedClose < today && (OPEN_STAGES as readonly string[]).includes(d.stage);
                  return (
                    <div key={d.id} className="card p-3 text-sm">
                      <Link href={`/crm/deals/${d.id}`} className="link block">
                        {d.title}
                      </Link>
                      <div className="mt-0.5 text-xs text-slate-500">{d.organization?.name ?? "No institution"}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-semibold">{formatINR(d.value)}</span>
                        <span className={`text-xs ${late ? "font-medium text-red-600" : "text-slate-500"}`}>
                          {d.expectedClose ? formatDate(d.expectedClose) : ""}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">{d.owner?.name}</span>
                        <form action={moveDeal.bind(null, d.id)} className="flex gap-1">
                          <select name="stage" defaultValue={d.stage} className="input w-auto px-1.5 py-0.5 text-xs">
                            {DEAL_STAGES.map((s) => (
                              <option key={s} value={s}>
                                {humanize(s)}
                              </option>
                            ))}
                          </select>
                          <button className="btn-secondary btn-sm">Move</button>
                        </form>
                      </div>
                    </div>
                  );
                })}
                {col.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">Empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
