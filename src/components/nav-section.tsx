"use client";

import { useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useNavigationQuery } from "./sidebar";
import { NavIcon } from "./nav-icon";

export function NavSection({ title, icon, routes, children }: { title: string; icon: string; routes: string[]; children: ReactNode }) {
  const pathname = usePathname();
  const query = useNavigationQuery();
  const id = useId();
  const active = routes.some(route => route === "/" ? pathname === route : pathname === route || pathname.startsWith(`${route}/`));
  const [choice, setChoice] = useState<{ path: string; open: boolean } | null>(null);
  const open = Boolean(query) || (choice?.path === pathname ? choice.open : active);
  return (
    <section className="nav-section" data-active={active || undefined}>
      <button type="button" className="nav-section-toggle" title={title} aria-expanded={open} aria-controls={id}
        onClick={() => setChoice({ path: pathname, open: !open })}>
        <NavIcon name={icon} />
        <span className="nav-section-label">{title}</span>
        <NavIcon name="chevron" className={`nav-chevron ${open ? "nav-chevron-open" : ""}`} />
      </button>
      <div id={id} className="nav-section-links" hidden={!open}>{children}</div>
    </section>
  );
}
