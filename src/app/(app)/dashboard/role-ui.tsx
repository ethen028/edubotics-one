import Link from "next/link";
import type { ReactNode } from "react";

/** A dashboard section: a title, a link to the page it comes from, and its rows. */
export function Panel({ title, href, link = "Open", children, className = "" }: { title: string; href?: string; link?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="link shrink-0 text-sm">
            {link}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** One label and figure; red or amber when it needs someone. */
export function Line({ label, value, href, tone }: { label: ReactNode; value: ReactNode; href?: string; tone?: "red" | "amber" | "green" }) {
  const color =
    tone === "red" ? "font-medium text-red-600" : tone === "amber" ? "font-medium text-amber-700" : tone === "green" ? "font-medium text-emerald-700" : "text-slate-900";
  return (
    <li className="flex justify-between gap-3 py-1.5">
      {href ? (
        <Link href={href} className="min-w-0 truncate text-slate-600 hover:underline">
          {label}
        </Link>
      ) : (
        <span className="min-w-0 truncate text-slate-600">{label}</span>
      )}
      <span className={`shrink-0 tabular-nums ${color}`}>{value}</span>
    </li>
  );
}

export function Lines({ children, empty }: { children: ReactNode[]; empty: string }) {
  const rows = children.filter(Boolean);
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return <ul className="divide-y divide-slate-100 text-sm">{rows}</ul>;
}

/** Things waiting on this role, as amber chips at the top of the page. */
export function Attention({ items }: { items: (false | null | undefined | { text: string; href: string })[] }) {
  const list = items.filter((a): a is { text: string; href: string } => !!a);
  if (!list.length) return null;
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {list.map((a) => (
        <Link key={a.href + a.text} href={a.href} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 hover:border-amber-400">
          {a.text}
        </Link>
      ))}
    </div>
  );
}

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
export const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;
