import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
  /** Accepted for pages that pass one; the flat header shows no icon. */
  icon?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="eyebrow mb-1 text-brand-700">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-brand-100 text-brand-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  purple: "bg-violet-100 text-violet-800",
};

export function Badge({ children, color = "gray" }: { children: ReactNode; color?: keyof typeof badgeColors }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${badgeColors[color]}`}>
      {children}
    </span>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-surface/60 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const inner = (
    <>
      <div className={`stat-label text-xs font-medium text-slate-500 ${href ? "pr-8" : ""}`}>{label}</div>
      <div className="stat-value mt-3 text-xl font-bold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">{value}</div>
      {href && (
        <span className="stat-arrow">
          <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="card stat">
      {inner}
    </Link>
  ) : (
    <div className="card stat">{inner}</div>
  );
}

export function Options({ values, labels }: { values: readonly string[]; labels?: (v: string) => string }) {
  return (
    <>
      {values.map((v) => (
        <option key={v} value={v}>
          {labels ? labels(v) : v}
        </option>
      ))}
    </>
  );
}
