"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, NAV_ICONS } from "./icons";

export function NavLink({
  href,
  children,
  exact = false,
  except = [],
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
  /** Sub-pages that have their own menu item, so this one isn't lit up there too. */
  except?: string[];
}) {
  const pathname = usePathname();
  const active =
    (href === "/" || exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)) &&
    !except.some((e) => pathname === e || pathname.startsWith(`${e}/`));
  return (
    <Link href={href} className="nav-link" data-active={active || undefined} aria-current={active ? "page" : undefined}>
      <Icon name={NAV_ICONS[href] ?? (href.startsWith("/hr/employees/") ? "user" : "dot")} className="nav-icon" />
      <span className="min-w-0 flex-1">{children}</span>
    </Link>
  );
}
