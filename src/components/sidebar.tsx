"use client";

import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

/** What is typed in the menu's "Find a page" box; groups open while it isn't empty. */
export const MenuSearch = createContext("");

/** Sidebar that is always open on desktop and collapses behind a Menu button on phones. */
export function Sidebar({ header, children }: { header: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const q = query.trim().toLowerCase();

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

  function goToFirst() {
    const first = menu.current?.querySelector<HTMLAnchorElement>("a.nav-link:not([hidden])");
    if (!first) return;
    setQuery("");
    setOpen(false);
    router.push(first.getAttribute("href")!);
  }

  return (
    <aside className="sidebar print:hidden md:sticky md:top-3 md:w-64 md:shrink-0">
      <div className="flex h-full flex-col p-4">
        <div className="flex items-center justify-between md:mb-4">
          {header}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="sidebar-toggle md:hidden"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        {/* Clicking a link on mobile closes the menu. */}
        <div
          ref={menu}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) {
              setOpen(false);
              setQuery("");
            }
          }}
          className={`sidebar-menu ${open ? "flex" : "hidden"} mt-4 flex-1 flex-col overflow-y-auto md:mt-0 md:flex`}
        >
          <label className="nav-search">
            <Icon name="search" className="h-4 w-4 shrink-0 opacity-70" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") goToFirst();
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Find a page…"
              aria-label="Find a page"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <MenuSearch value={q}>{children}</MenuSearch>
        </div>
      </div>
    </aside>
  );
}
