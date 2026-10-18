"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Children, isValidElement, type ReactNode } from "react";
import { useNavigationQuery } from "./sidebar";
import { iconForRoute, NavIcon } from "./nav-icon";

function textContent(node: ReactNode): string {
  return Children.toArray(node).map((child): string => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    return isValidElement<{ children?: ReactNode }>(child) ? textContent(child.props.children) : "";
  }).join(" ");
}

export function NavLink({ href, children, exact = false }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const query = useNavigationQuery();
  const active = href === "/" || exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  if (query && !`${textContent(children)} ${href}`.toLowerCase().includes(query)) return null;
  return (
    <Link
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      data-active={active || undefined}
      className={`nav-link flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm transition-colors ${
        active ? "border-brand-300 bg-white/10 font-semibold text-white" : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <NavIcon name={iconForRoute(href)} />
      <span className="min-w-0 flex-1">{children}</span>
    </Link>
  );
}
