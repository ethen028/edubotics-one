"use client";

import { useState, type ReactNode } from "react";

/** Sidebar that is always open on desktop and collapses behind a Menu button on phones. */
export function Sidebar({ header, children }: { header: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="bg-brand-900 text-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0">
      <div className="flex h-full flex-col p-4">
        <div className="flex items-center justify-between md:mb-5">
          {header}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="rounded-md px-2 py-1 text-sm text-slate-200 ring-1 ring-white/20 md:hidden"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        {/* Clicking a link on mobile closes the menu. */}
        <div
          onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
          className={`${open ? "flex" : "hidden"} mt-4 flex-1 flex-col overflow-y-auto md:mt-0 md:flex`}
        >
          {children}
        </div>
      </div>
    </aside>
  );
}
