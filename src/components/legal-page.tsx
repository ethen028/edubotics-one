import Link from "next/link";
import { PublicFooter } from "./public-footer";
import type { ReactNode } from "react";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-5 py-10">
    <Link href="/careers" className="link text-sm">Edubotics One · Careers</Link>
    <main id="main-content" tabIndex={-1} className="space-y-5 py-8 text-sm leading-7 text-slate-700">
      <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
      <p className="text-xs text-slate-500">Updated 17 October 2026</p>
      {children}
    </main>
    <PublicFooter />
  </div>;
}
