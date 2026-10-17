"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    <Link
      href={href}
      className={`block rounded-md px-3 py-1.5 text-sm ${
        active ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
