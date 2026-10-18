"use client";

import { useContext, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { MenuRail, MenuSearch } from "./sidebar";

/**
 * A folding group in the menu (Work, CRM, HR…). It opens by itself when you are on one of its pages, and every
 * group opens while you are searching the menu. In the slim icon rail the group is one icon, and its pages
 * appear in a small panel beside it while you point at it.
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
  const rail = useContext(MenuRail);
  const head = useRef<HTMLButtonElement>(null);
  const here = paths.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
  const [open, setOpen] = useState(here);
  // Moving onto one of this group's pages opens it.
  const [wasHere, setWasHere] = useState(here);
  if (here !== wasHere) {
    setWasHere(here);
    if (here) setOpen(true);
  }
  const expanded = (open || searching) && !rail;

  // Rail panel: fixed beside the icon, so the menu's own scrolling can't clip it.
  const [fly, setFly] = useState<{ top: number; left: number; gap: number } | null>(null);
  function showFly() {
    if (!rail || !head.current) return;
    const r = head.current.getBoundingClientRect();
    const edge = head.current.closest(".sidebar")?.getBoundingClientRect().right ?? r.right;
    setFly({ top: r.top, left: r.right, gap: edge - r.right + 8 });
  }
  const hideFly = () => setFly(null);

  return (
    <div
      className="nav-group"
      data-open={expanded || undefined}
      data-here={here || undefined}
      onMouseEnter={showFly}
      onMouseLeave={hideFly}
      onFocus={showFly}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hideFly();
      }}
    >
      <button
        ref={head}
        type="button"
        className="nav-group-head"
        aria-expanded={rail ? fly !== null : expanded}
        onClick={rail ? showFly : () => setOpen(!open)}
      >
        <Icon name={icon} className="h-4 w-4 shrink-0" />
        <span className="rail-hide ml-2.5 flex-1 text-left">{title}</span>
        {!expanded && count > 0 && <span className="nav-badge">{count}</span>}
        <Icon name="chevron" className="nav-chevron" />
      </button>
      <div className="nav-group-wrap">
        <div className="nav-group-clip" inert={!expanded}>
          <div className="nav-group-body">{children}</div>
        </div>
      </div>
      {rail && fly && (
        <div
          className="nav-flyout"
          style={{ top: fly.top, left: fly.left, paddingLeft: fly.gap } as CSSProperties}
          ref={(el) => {
            // Keep the panel on screen when its group sits low in the rail.
            if (!el) return;
            const room = window.innerHeight - el.offsetHeight - 12;
            if (fly.top > room) el.style.top = `${Math.max(12, room)}px`;
          }}
        >
          <div className="nav-flyout-card">
            <div className="nav-flyout-title">{title}</div>
            <div className="space-y-0.5">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
