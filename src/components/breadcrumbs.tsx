"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { breadcrumbsFor } from "@/lib/breadcrumbs";

export function Breadcrumbs() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  const crumbs = breadcrumbsFor(pathname);
  return <nav aria-label="Breadcrumb" className="workspace-breadcrumbs"><ol>{crumbs.map((crumb, index) => <li key={crumb.href}>
    {index > 0 && <span aria-hidden="true" className="text-slate-400">/</span>}
    {index === crumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : crumb.linked ? <Link href={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
  </li>)}</ol></nav>;
}
