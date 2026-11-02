import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { formatINR } from "@/lib/format";
import { RANGE_PRESETS, isoDay, percentChange, rangeQuery, rangeText, type DashboardRange } from "@/lib/dashboard-range";

/** Rupees in lakhs for chart labels: ₹1.2L, ₹45k. */
export function short(n: number) {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 100_000) return `${sign}₹${(a / 100_000).toFixed(a >= 1_000_000 ? 0 : 1)}L`;
  if (a >= 1000) return `${sign}₹${Math.round(a / 1000)}k`;
  return `${sign}₹${Math.round(a)}`;
}

/** A link to the records behind a figure, for the dashboard's range or part of it. */
export function listHref(show: string, range: { from: Date; to: Date }, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ show, from: isoDay(range.from), to: isoDay(range.to), ...extra });
  return `/dashboard/list?${q}`;
}

/** The dashboard address for the same range, so going back keeps the dates. */
export function dashboardHref(range: DashboardRange) {
  const q = rangeQuery(range);
  return q ? `/dashboard?${q}` : "/dashboard";
}

/** Quick choices, a custom from–to, and a line saying what the page is showing and comparing with. */
export function RangePicker({ range, today }: { range: DashboardRange; today: Date }) {
  return (
    <section className="dash-range card mb-6" aria-label="Dates shown">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav className="dash-range-chips" aria-label="Quick dates">
          {RANGE_PRESETS.map((p) => (
            <Link
              key={p.key}
              href={p.key === "month" ? "/dashboard" : `/dashboard?range=${p.key}`}
              className="dash-chip"
              aria-current={range.key === p.key ? "true" : undefined}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <form method="get" action="/dashboard" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="range" value="custom" />
          <label className="text-xs font-medium text-slate-600">
            From
            <input type="date" name="from" required max={isoDay(today)} defaultValue={isoDay(range.from)} className="input mt-1 block w-[9.5rem] py-1.5" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input type="date" name="to" required max={isoDay(today)} defaultValue={isoDay(range.to)} className="input mt-1 block w-[9.5rem] py-1.5" />
          </label>
          <button type="submit" className={range.key === "custom" ? "btn-primary" : "btn-secondary"}>
            Show these dates
          </button>
        </form>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        <strong className="font-semibold text-slate-900">{rangeText(range.from, range.to)}</strong>, compared with {rangeText(range.prevFrom, range.prevTo)}.{" "}
        <span className="text-slate-500">Cards marked “Now” show today’s position whatever the dates.</span>
      </p>
    </section>
  );
}

/** "▲ 12%" against the period before; for money going out a rise is not shown as good news. */
export function Change({ now, before, rising = "good" }: { now: number; before: number; rising?: "good" | "neutral" }) {
  const pct = percentChange(now, before);
  if (pct === null) return <span className="dash-change">{now === 0 ? "Nothing in either period" : "Nothing the period before"}</span>;
  const tone = pct === 0 || rising === "neutral" ? "" : pct > 0 ? "is-up" : "is-down";
  return (
    <span className={`dash-change ${tone}`}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} {Math.abs(pct)}% <span className="text-slate-500">vs before</span>
    </span>
  );
}

/** A number card that opens the list behind it and shows the exact figures on hover or keyboard focus. */
export function Metric({
  label,
  value,
  href,
  tip,
  now,
  foot,
}: {
  label: string;
  value: string;
  href: string;
  tip: string;
  now?: boolean;
  foot?: ReactNode;
}) {
  return (
    <Link href={href} className="card stat dash-metric" data-tip={tip} aria-label={`${label}: ${value}. ${tip.replaceAll("\n", ". ")}`}>
      <div className="stat-label pr-8 text-xs font-medium text-slate-500">
        {label}
        {now && <span className="dash-now">Now</span>}
      </div>
      <div className="stat-value mt-3 text-xl font-bold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">{value}</div>
      {foot && <div className="mt-1.5 text-xs">{foot}</div>}
      <span className="stat-arrow">
        <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export type FlowBar = { from: Date; to: Date; label: string; in: number; out: number; vendors: number; salaries: number; claims: number; won: number };

/** Money in and out as paired bars, one pair per day, week or month; each pair opens that stretch's records. */
export function CashFlowChart({ bars, unit }: { bars: FlowBar[]; unit: DashboardRange["unit"] }) {
  const max = Math.max(1, ...bars.flatMap((b) => [b.in, b.out]));
  const empty = bars.every((b) => b.in === 0 && b.out === 0);
  const crowded = bars.length > 8;
  const everyOther = bars.length > 16;
  const when = (b: FlowBar) => (unit === "day" ? rangeText(b.from, b.to) : unit === "week" ? `Week of ${rangeText(b.from, b.to)}` : rangeText(b.from, b.to));
  return (
    <>
      <div className="relative flex h-44 items-end gap-1 border-b border-slate-200 sm:gap-3">
        {empty && (
          <div className="cashflow-empty">
            <strong>No money in or out on these dates</strong>
            <span>Payments received and money paid out will appear here.</span>
          </div>
        )}
        {bars.map((b, i) => {
          const tip = [
            when(b),
            `In ${formatINR(b.in)}`,
            `Out ${formatINR(b.out)}`,
            b.out > 0 ? `  vendors ${formatINR(b.vendors)} · salaries ${formatINR(b.salaries)} · claims ${formatINR(b.claims)}` : "",
            b.won > 0 ? `Deals won ${formatINR(b.won)}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          return (
            <Link
              key={i}
              href={listHref("money", b)}
              className="dash-bar group flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
              data-tip={tip}
              data-tip-align={i < 2 ? "start" : i >= bars.length - 2 ? "end" : undefined}
              aria-label={tip.replaceAll("\n", ". ")}
            >
              <div className="bar-track w-1/3">
                <div className="bar-fill bg-brand-600" style={{ height: `${(Math.max(0, b.in) / max) * 100}%` }} />
              </div>
              <div className="bar-track w-1/3">
                <div className="bar-fill bg-amber-400" style={{ height: `${(b.out / max) * 100}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 text-center text-[11px] sm:gap-3">
        {bars.map((b, i) => (
          <div key={i} className="min-w-0 flex-1 truncate">
            <div className="truncate font-medium text-slate-700">{everyOther && i % 2 ? " " : b.label}</div>
            {!crowded && (
              <>
                <div className="text-brand-700 tabular-nums">{short(b.in)}</div>
                <div className="text-amber-800 tabular-nums">{short(b.out)}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** Horizontal bars for a few labelled counts or amounts; each bar opens its list and shows its figure on hover. */
export function Bars({ rows }: { rows: { label: string; value: number; display: string; href?: string; tip?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r) => {
        const body = (
          <>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600 group-hover:text-slate-900 group-hover:underline">{r.label}</span>
              <span className="tabular-nums text-slate-900">{r.display}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-brand-500 transition-colors group-hover:bg-brand-700" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </>
        );
        return (
          <li key={r.label}>
            {r.href ? (
              <Link href={r.href} className="dash-row group block rounded-lg px-1 py-1" data-tip={r.tip}>
                {body}
              </Link>
            ) : (
              <div className="px-1 py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
