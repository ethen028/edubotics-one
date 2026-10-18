"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { NavIcon } from "./nav-icon";

const NavigationQuery = createContext("");
export const useNavigationQuery = () => useContext(NavigationQuery);
/** Full page directory, opened from the single ARC navigation bar. */
export function Sidebar({ header, children }: { header: ReactNode; children: ReactNode }) {
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLElement>(null);
  return (
    <aside ref={panel} id="workspace-directory" popover="auto" role="dialog" aria-label="All pages"
      className="workspace-directory app-sidebar bg-brand-900 text-white print:hidden"
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); panel.current?.hidePopover(); } }}
      onToggle={event => { if (event.newState === "closed") setQuery(""); }}>
      <div className="sidebar-inner flex h-full min-h-0 flex-col p-4">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="sidebar-brand">{header}</div>
          <button type="button" popoverTarget="workspace-directory" popoverTargetAction="hide"
            aria-label="Close all pages" className="sidebar-collapse flex">
            <NavIcon name="close" />
          </button>
        </div>
        <div
          id="workspace-navigation"
          onClick={event => { if ((event.target as HTMLElement).closest("a")) panel.current?.hidePopover(); }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <label className="sidebar-search mb-4 block shrink-0">
            <span className="sr-only">Find a page</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a page…" aria-controls="primary-navigation"
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-400/30" />
          </label>
          <NavigationQuery.Provider value={query.trim().toLowerCase()}>
            {children}
          </NavigationQuery.Provider>
        </div>
      </div>
    </aside>
  );
}
