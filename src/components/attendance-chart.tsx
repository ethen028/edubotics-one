import Link from "next/link";
import type { DayDetail } from "@/lib/attendance-data";
import { STATUS_LABEL, dateKey, formatMinutes, heatCell, heatWeeks, type HeatCell } from "@/lib/attendance";
import { formatDate } from "@/lib/format";

/** How many weeks the chart covers: about six months, which still fits a phone without scrolling sideways. */
export const CHART_WEEKS = 26;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEGEND: { cell: HeatCell; label: string }[] = [
  { cell: 0, label: "Nothing worked" },
  { cell: 1, label: "Under half a day" },
  { cell: 2, label: "Short of the target" },
  { cell: 3, label: "Target met" },
  { cell: 4, label: "Overtime" },
];

/**
 * A square for every day of the last six months, shaded by how much of the daily target was worked, so a run
 * of short days or a patch of absences shows at a glance. Modelled on the activity calendars on spaceui.one and
 * componentry.dev, in the one teal: deeper means more. Each square names its day and hours when pointed at;
 * the month names open that month below.
 */
export function AttendanceChart({ days, today, target }: { days: Map<string, DayDetail>; today: Date; target: number }) {
  const weeks = heatWeeks(today, CHART_WEEKS);
  const todayKey = dateKey(today);
  // The first week's month name is dropped when the next month starts a week or two later, so the two never overlap.
  const labels = weeks.map((w, i) => (i === 0 && (weeks[1]?.month || weeks[2]?.month) ? null : w.month));
  const counts = { full: 0, short: 0, absent: 0, leave: 0 };
  for (const w of weeks)
    for (const d of w.days) {
      const r = days.get(dateKey(d));
      if (!r) continue;
      const c = heatCell(r, dateKey(d) > todayKey, target);
      if (c === 3 || c === 4) counts.full++;
      else if (c === 1 || c === 2) counts.short++;
      else if (c === 0) counts.absent++;
      else if (c === "leave") counts.leave++;
    }

  return (
    <section className="card mb-6" aria-labelledby="attendance-chart-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="attendance-chart-title" className="font-semibold">
          Last six months
        </h2>
        <p className="text-xs text-slate-500">
          {counts.full} full days · {counts.short} short · {counts.absent} absent · {counts.leave} on leave
        </p>
      </div>
      <div className="heat">
        <span aria-hidden="true" />
        <div className="heat-months" style={{ gridTemplateColumns: `repeat(${CHART_WEEKS}, minmax(0, 1fr))` }}>
          {labels.map((label, i) =>
            label ? (
              <Link key={i} href={`?month=${dateKey(weeks[i].days.find((d) => d.getUTCDate() === 1) ?? weeks[i].days[0]).slice(0, 7)}`} style={{ gridColumnStart: i + 1 }}>
                {label}
              </Link>
            ) : null,
          )}
        </div>
        <div className="heat-days" aria-hidden="true">
          {DAY_NAMES.map((d, i) => (
            <span key={d}>{i % 2 === 1 ? d : ""}</span>
          ))}
        </div>
        <div
          className="heat-grid"
          role="img"
          aria-label={`Attendance for the last ${CHART_WEEKS} weeks: ${counts.full} full days, ${counts.short} short days, ${counts.absent} absent, ${counts.leave} on leave.`}
          style={{ gridTemplateColumns: `repeat(${CHART_WEEKS}, minmax(0, 1fr))` }}
        >
          {weeks.flatMap((w) =>
            w.days.map((d) => {
              const key = dateKey(d);
              const r = days.get(key);
              const cell = r ? heatCell(r, key > todayKey, target) : "future";
              const title =
                cell === "future" ? undefined : `${formatDate(d)} · ${r ? STATUS_LABEL[r.status] : ""}${r && r.worked > 0 ? ` · ${formatMinutes(r.worked)}` : ""}`;
              return <span key={key} className="heat-cell" data-cell={cell} data-today={key === todayKey || undefined} title={title} />;
            }),
          )}
        </div>
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span>Less</span>
        {LEGEND.map((l) => (
          <span key={l.cell} className="heat-cell" data-cell={l.cell} title={l.label} />
        ))}
        <span>More</span>
        <span className="heat-legend-gap" />
        <span className="heat-cell" data-cell="leave" />
        <span>Leave</span>
        <span className="heat-cell" data-cell="off" />
        <span>Day off</span>
      </div>
    </section>
  );
}
