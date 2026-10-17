"use client";

import { useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { MenuSearch } from "./sidebar";

/**
 * A folding group in the menu (Work, CRM, HR…). It opens by itself when you are on one of its pages,
 * and every group opens while you are searching the menu.
 */
export function NavGroup({
  title,
  icon,
  paths,
  count = 0,
  children,
}: {
  title: string;
  icon: IconName;
  /** Pages that belong to this group, so it can open itself when you are on one. */
  paths: string[];
  /** Things waiting in this group, shown on the folded row. */
  count?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searching = useContext(MenuSearch) !== "";
  const here = paths.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
  const [open, setOpen] = useState(here);
  // Moving onto one of this group's pages opens it.
  const [wasHere, setWasHere] = useState(here);
  if (here !== wasHere) {
    setWasHere(here);
    if (here) setOpen(true);
  }
  const shown = open || searching;
  return (
    <div className="nav-group" data-open={shown || undefined}>
      <button type="button" className="nav-group-head" aria-expanded={shown} onClick={() => setOpen(!open)}>
        <Icon name={icon} className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{title}</span>
        {!shown && count > 0 && <span className="nav-badge">{count}</span>}
        <Icon name="chevron" className="nav-chevron" />
      </button>
      {shown && <div className="nav-group-body">{children}</div>}
    </div>
  );
}
