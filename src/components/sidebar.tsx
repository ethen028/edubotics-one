"use client";

import { createContext, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { setMenuCollapsed } from "@/app/actions";

/** What is typed in the menu's "Find a page" box; groups open while it isn't empty. */
export const MenuSearch = createContext("");
/** True while the menu on a computer is shrunk to its slim icon rail. */
export const MenuRail = createContext(false);

const DESKTOP = "(min-width: 768px)";
function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(DESKTOP);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

/**
 * The side menu. On computers it is a panel beside the page that shrinks to a slim icon rail (remembered per
 * person). On phones it is a bar on top with a drawer that slides in from the left.
 */
export function Sidebar({
  header,
  children,
  defaultCollapsed = false,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [query, setQuery] = useState("");
  const [, save] = useTransition();
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const desktop = useIsDesktop();
  const rail = collapsed && desktop;
  const q = query.trim().toLowerCase();

  function setRail(next: boolean) {
    setCollapsed(next);
    save(() => {
      void setMenuCollapsed(next);
    });
  }

  // Hide menu items whose name doesn't match, and groups left with nothing to show.
  useEffect(() => {
    const root = menu.current;
    if (!root) return;
    root.querySelectorAll<HTMLAnchorElement>("a.nav-link").forEach((a) => {
      a.hidden = q !== "" && !(a.textContent ?? "").toLowerCase().includes(q);
    });
    root.querySelectorAll<HTMLElement>(".nav-group").forEach((g) => {
      g.hidden = q !== "" && !g.querySelector("a.nav-link:not([hidden])");
    });
  }, [q]);

  // The phone drawer closes on Escape and keeps the page behind it from scrolling.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [open]);

  function goToFirst() {
    const first = menu.current?.querySelector<HTMLAnchorElement>("a.nav-link:not([hidden])");
    if (!first) return;
    setQuery("");
    setOpen(false);
    router.push(first.getAttribute("href")!);
  }

  return (
    <aside className="sidebar print:hidden md:sticky md:top-3 md:shrink-0" data-collapsed={collapsed || undefined}>
      <button
        type="button"
        className="sidebar-collapse hidden md:flex"
        onClick={() => setRail(!collapsed)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand the menu" : "Collapse the menu to icons"}
        title={collapsed ? "Expand the menu" : "Collapse the menu"}
      >
        <Icon name="chevron" className="sidebar-collapse-icon h-3.5 w-3.5" />
      </button>
      <div className="sidebar-inner flex h-full flex-col p-4">
        <div className="sidebar-head flex items-center justify-between md:mb-4">
          {header}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="sidebar-toggle md:hidden"
          >
            Menu
          </button>
        </div>
        {/* Phones: tapping outside the drawer closes it. */}
        <div className="sidebar-backdrop md:hidden" data-open={open || undefined} onClick={() => setOpen(false)} aria-hidden />
        {/* Clicking a link on a phone closes the drawer. */}
        <div
          ref={menu}
          data-open={open || undefined}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) {
              setOpen(false);
              setQuery("");
            }
          }}
          className="sidebar-menu"
        >
          <div className="mb-3 flex items-center justify-between md:hidden">
            <span className="sidebar-muted text-xs font-semibold tracking-wider uppercase">Menu</span>
            <button type="button" onClick={() => setOpen(false)} className="sidebar-toggle">
              Close
            </button>
          </div>
          <label
            className="nav-search"
            title={rail ? "Find a page" : undefined}
            onClick={(e) => {
              if (!rail) return;
              e.preventDefault();
              setRail(false);
              window.setTimeout(() => search.current?.focus(), 320);
            }}
          >
            <Icon name="search" className="h-4 w-4 shrink-0 opacity-70" />
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") goToFirst();
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Find a page…"
              aria-label="Find a page"
              tabIndex={rail ? -1 : 0}
              className="rail-hide ml-2 min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <MenuRail value={rail}>
            <MenuSearch value={q}>{children}</MenuSearch>
          </MenuRail>
        </div>
      </div>
    </aside>
  );
}
