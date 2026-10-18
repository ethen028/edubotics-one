import Link from "next/link";
import type { ReactNode } from "react";
import { NavIcon } from "./nav-icon";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  icon,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
  icon?: string;
}) {
  return (
    <div className={`page-header mb-8 flex flex-wrap items-end justify-between gap-4 ${eyebrow ? "workspace-page-header" : "border-b border-slate-200 pb-6"}`}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-3 flex items-center gap-2.5"><span className="workspace-header-icon"><NavIcon name={icon ?? "operations"} appearance="clay" /></span><span className="eyebrow text-brand-700">{eyebrow}</span></div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">{subtitle}</p>}
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
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center text-sm leading-relaxed text-slate-500">{children}</div>;
}

export function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const inner = (
    <>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="stat-value mt-3 font-display font-semibold tracking-tight text-slate-900 tabular-nums">{value}</div>
    </>
  );
  return href ? (
    <Link href={href} className="card stat-card block hover:border-brand-500">
      {inner}
    </Link>
  ) : (
    <div className="card stat-card">{inner}</div>
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
