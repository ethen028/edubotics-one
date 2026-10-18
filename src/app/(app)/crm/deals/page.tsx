import Link from "next/link";
import type { DealStage } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { daysFromNow, todayIST } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/action-form";
import { NavIcon } from "@/components/nav-icon";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { dealViewHref, parseDealView } from "@/lib/deal-view";
import { moveDeal } from "../actions";
import { DEAL_STAGES, OPEN_STAGES, dealStageColor } from "../constants";

export const metadata = { title: "Deals" };

function StageControl({ id, stage, title }: { id: string; stage: DealStage; title: string }) {
  return <form action={moveDeal.bind(null, id)} aria-label={`Move ${title}`} className="deal-stage-control">
    <select aria-label={`Stage for ${title}`} name="stage" defaultValue={stage} className="input">
      {DEAL_STAGES.map(value => <option key={value} value={value}>{humanize(value)}</option>)}
    </select>
    <SubmitButton className="btn-secondary btn-sm" pendingLabel="Moving…">Move</SubmitButton>
  </form>;
}

export default async function DealsPage({ searchParams }: PageProps<"/crm/deals">) {
  const user = await requireUser();
  const filters = parseDealView(await searchParams);
  const { q, mine, closed: showClosed, view } = filters;
  const deals = await db.deal.findMany({
    where: {
      ...(mine ? { ownerId: user.id } : {}),
      AND: [
        { OR: [{ stage: { in: [...OPEN_STAGES] } }, ...(showClosed ? [{ closedAt: { gte: daysFromNow(-90) } }] : [])] },
        ...(q ? [{ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { organization: { name: { contains: q, mode: "insensitive" as const } } }, { owner: { name: { contains: q, mode: "insensitive" as const } } }] }] : []),
      ],
    },
    include: { organization: true, owner: true },
    orderBy: [{ expectedClose: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  const stages = showClosed ? DEAL_STAGES : OPEN_STAGES;
  const open = deals.filter(deal => (OPEN_STAGES as readonly string[]).includes(deal.stage));
  const openValue = open.reduce((sum, deal) => sum + Number(deal.value), 0);
  const today = todayIST();
  const monthAhead = new Date(today.getTime() + 30 * 86400000);
  const closingSoon = open.filter(deal => deal.expectedClose && deal.expectedClose >= today && deal.expectedClose <= monthAhead).length;
  const overdue = open.filter(deal => deal.expectedClose && deal.expectedClose < today).length;
  const href = (update: Parameters<typeof dealViewHref>[1]) => dealViewHref(filters, update);

  return <div className="crm-workspace">
    <PageHeader title="Deal pipeline" subtitle="Manage relationships from first conversation to a closed deal."
      actions={<Link href="/crm/deals/new" className="btn-primary">Add deal</Link>} />
    <div className="crm-summary mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <div className="crm-summary-primary"><span>Open pipeline</span><strong>{formatINR(openValue)}</strong><small>{open.length} open {open.length === 1 ? "deal" : "deals"} in this view</small></div>
      <div><span>Matching deals</span><strong>{deals.length}</strong><small>{showClosed ? "Includes closures from the last 90 days" : "Open stages only"}</small></div>
      <div><span>Closing in 30 days</span><strong>{closingSoon}</strong><small>Expected close dates</small></div>
      <div><span>Past expected close</span><strong>{overdue}</strong><small>{overdue ? "Review the next step" : "No overdue close dates"}</small></div>
    </div>
    <div className="crm-toolbar">
      <form className="crm-search" aria-label="Search deals"><NavIcon name="search" />
        <input aria-label="Search deals" name="q" defaultValue={q} placeholder="Search deals, institutions or owners" maxLength={120} className="input" />
        {mine && <input type="hidden" name="mine" value="1" />}{showClosed && <input type="hidden" name="closed" value="1" />}{view === "list" && <input type="hidden" name="view" value="list" />}
        <button className="btn-secondary">Search</button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({mine: !mine})} className={`filter-chip ${mine ? "filter-chip-active" : ""}`} aria-current={mine ? "true" : undefined}>Only mine</Link>
        <Link href={href({closed: !showClosed})} className={`filter-chip ${showClosed ? "filter-chip-active" : ""}`} aria-current={showClosed ? "true" : undefined}>Include won/lost</Link>
        <nav aria-label="Deal view" className="deal-view-switch"><Link href={href({view:"board"})} aria-current={view === "board" ? "page" : undefined}><NavIcon name="operations" />Board</Link><Link href={href({view:"list"})} aria-current={view === "list" ? "page" : undefined}><NavIcon name="document" />List</Link></nav>
      </div>
    </div>
    {(q || mine) && <p className="mb-4 text-xs text-slate-500">{q && <>Results for “{q}” · </>}{mine && <>Owned by you · </>}<Link href={href({q:"",mine:false})} className="link">Clear search and owner filter</Link></p>}
    {deals.length === 0 && (q || mine) ? <Empty>No deals match these filters. Try another search or clear the filters.</Empty> : view === "list" ?
      <div className="card overflow-x-auto p-0"><table className="table"><caption className="sr-only">Deals matching the current filters</caption><thead><tr><th>Deal / institution</th><th>Value</th><th>Stage</th><th>Owner</th><th>Expected close</th><th>Move stage</th></tr></thead><tbody>
        {deals.map(deal => <tr key={deal.id}><td><Link href={`/crm/deals/${deal.id}`} className="link">{deal.title}</Link><p className="mt-1 text-xs text-slate-500">{deal.organization?.name ?? "No institution"}</p></td><td className="whitespace-nowrap font-semibold">{formatINR(deal.value)}</td><td><Badge color={dealStageColor[deal.stage]}>{humanize(deal.stage)}</Badge></td><td>{deal.owner?.name ?? "Unassigned"}</td><td>{deal.expectedClose ? formatDate(deal.expectedClose) : "Not set"}</td><td><StageControl id={deal.id} stage={deal.stage} title={deal.title} /></td></tr>)}
        {deals.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500">No deals yet. Add your first deal to start the pipeline.</td></tr>}
      </tbody></table></div> :
      <div className="deal-board" role="region" aria-label="Deal pipeline board; scroll horizontally to view all stages" tabIndex={0}>
        {stages.map(stage => {
          const column = deals.filter(deal => deal.stage === stage);
          const total = column.reduce((sum, deal) => sum + Number(deal.value), 0);
          return <section key={stage} className="deal-column" data-stage={stage} aria-label={`${humanize(stage)} deals`}>
            <header><div><span className="deal-stage-dot" aria-hidden="true" /><h2>{humanize(stage)}</h2><span className="deal-column-count">{column.length}</span></div><p>{formatINR(total)}</p></header>
            <div className="space-y-3">{column.map(deal => {
              const late = deal.expectedClose && deal.expectedClose < today && (OPEN_STAGES as readonly string[]).includes(deal.stage);
              return <article key={deal.id} className="deal-card">
                <div className="mb-3 flex items-center justify-between gap-2"><Badge color={dealStageColor[stage]}>{humanize(stage)}</Badge>{late && <Badge color="red">Past due</Badge>}</div>
                <Link href={`/crm/deals/${deal.id}`} className="deal-card-title">{deal.title}</Link>
                <p className="mt-1 text-xs text-slate-500">{deal.organization?.name ?? "No institution"}</p>
                <strong className="deal-card-value">{formatINR(deal.value)}</strong>
                <div className="deal-card-meta"><span className="member-initials" aria-hidden="true">{deal.owner?.name.split(" ").map(part=>part[0]).slice(0,2).join("") ?? "—"}</span><span>{deal.owner?.name ?? "Unassigned"}<small className={late ? "text-red-700" : "text-slate-500"}>{deal.expectedClose ? `Closes ${formatDate(deal.expectedClose)}` : "Close date not set"}</small></span></div>
                <StageControl id={deal.id} stage={deal.stage} title={deal.title} />
              </article>;
            })}{column.length === 0 && <div className="deal-column-empty"><NavIcon name="document" /><p>No {humanize(stage).toLowerCase()} deals</p><small>Deals in this stage will appear here.</small></div>}</div>
          </section>;
        })}
      </div>}
  </div>;
}
