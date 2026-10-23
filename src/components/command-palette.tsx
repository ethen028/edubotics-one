"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { NavGroupData } from "@/lib/nav";
import { Icon, NAV_ICONS, type IconName } from "./icons";

type Entry = { href: string; label: string; group: string; icon: IconName };

/** Things people often start from anywhere; shown first when the box is empty. */
const QUICK: { href: string; label: string; needs?: string }[] = [
  { href: "/crm/leads/new", label: "Add a lead", needs: "/crm/leads" },
  { href: "/crm/deals/new", label: "Add a deal", needs: "/crm/deals" },
  { href: "/hr/leave", label: "Apply for leave", needs: "/hr/leave" },
  { href: "/expenses", label: "Claim an expense", needs: "/expenses" },
  { href: "/helpdesk/new", label: "Ask the helpdesk", needs: "/helpdesk" },
  { href: "/invoices/new", label: "Make an invoice", needs: "/invoices" },
];

type Recent = { href: string; label: string };
const recentKey = (userId: string) => `orbit:recent:${userId}`;

function readRecent(userId: string): Recent[] {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey(userId)) ?? "[]");
    return Array.isArray(list) ? list.filter((r) => typeof r?.href === "string" && typeof r?.label === "string") : [];
  } catch {
    return [];
  }
}

/** The page's own heading (a school's or person's name), which says more than the browser tab title. */
function pageHeading() {
  const h1 = document.querySelector<HTMLElement>("#main-content h1");
  return h1?.innerText.trim().replace(/\s+/g, " ").slice(0, 80) || null;
}

/**
 * Remembers the last pages this person opened on this computer or phone, for "Recently viewed" in the find box.
 * Kept in the browser only and per login, so someone else signing in on the same computer doesn't see them.
 */
function useRecentPages(userId: string) {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/") return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    // The heading can arrive a moment after the address changes (pages load in pieces), so look a few times.
    const record = () => {
      const label = pageHeading();
      if (!label && tries++ < 5) {
        timer = setTimeout(record, 300);
        return;
      }
      if (!label) return;
      try {
        const next = [{ href: pathname, label }, ...readRecent(userId).filter((r) => r.href !== pathname)].slice(0, 8);
        localStorage.setItem(recentKey(userId), JSON.stringify(next));
      } catch {
        // Private windows and full storage just go without the list.
      }
    };
    timer = setTimeout(record, 150);
    return () => clearTimeout(timer);
  }, [pathname, userId]);
  return pathname;
}

/**
 * "Find anything" box in the top bar. Opens with the button or Ctrl+K (⌘K on a Mac); type part of a page's
 * name, move with the arrow keys and press Enter to go there. "/" opens it too when the cursor isn't in a box.
 */
export function CommandPalette({ groups, userId }: { groups: NavGroupData[]; userId: string }) {
  const [open, setOpen] = useState(false);
  const pathname = useRecentPages(userId);
  // Read when the box opens (never on the server, where it starts closed).
  const recent = useMemo(() => (open ? readRecent(userId) : []), [open, userId]);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  const pages = useMemo<Entry[]>(
    () =>
      groups.flatMap((g) =>
        g.items.map((i) => ({ href: i.href, label: i.label, group: g.title, icon: NAV_ICONS[i.href] ?? g.icon })),
      ),
    [groups],
  );
  const quick = useMemo<Entry[]>(() => {
    const allowed = new Set(pages.map((p) => p.href));
    return QUICK.filter((q) => !q.needs || allowed.has(q.needs)).map((q) => ({ href: q.href, label: q.label, group: "Quick start", icon: "plus" as IconName }));
  }, [pages]);

  const recentEntries = useMemo<Entry[]>(() => {
    // Name the menu section each page sits under, from the longest menu link it starts with.
    const sectionOf = (href: string) =>
      pages
        .filter((p) => p.href !== "/" && (href === p.href || href.startsWith(`${p.href}/`)))
        .sort((a, b) => b.href.length - a.href.length)[0];
    return recent
      .filter((r) => r.href !== pathname)
      .slice(0, 5)
      .map((r) => {
        const section = sectionOf(r.href);
        return { href: r.href, label: r.label, group: section ? `Recent · ${section.label}` : "Recent", icon: "clock" as IconName };
      });
  }, [recent, pages, pathname]);

  const q = query.trim().toLowerCase();
  const results = q
    ? [...quick, ...pages, ...recentEntries].filter((e) => `${e.label} ${e.group}`.toLowerCase().includes(q)).slice(0, 12)
    : [...recentEntries, ...quick, ...pages.slice(0, recentEntries.length ? 4 : 8)];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest("input, textarea, select, [contenteditable='true']");
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setIndex(0);
  }

  function go(entry: Entry | undefined) {
    if (!entry) return;
    close();
    router.push(entry.href);
  }

  return (
    <>
      <button type="button" className="find-button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="search" className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Find a page or start something…</span>
        <kbd className="find-kbd">Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="palette"
        aria-label="Find anything"
        onClose={close}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <div className="palette-search">
          <Icon name="search" className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[index]);
              }
            }}
            placeholder="Type a page, like leave, invoices or calendar"
            aria-label="Find a page"
            aria-controls="palette-results"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="find-kbd">Esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" aria-label="Pages" className="palette-results">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No page matches &ldquo;{query}&rdquo;.</li>}
          {results.map((r, i) => (
            <li key={`${r.group}-${r.href}`} role="option" aria-selected={i === index}>
              <button
                type="button"
                className="palette-item"
                data-active={i === index || undefined}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(r)}
              >
                <Icon name={r.icon} className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">{r.label}</span>
                <span className="text-xs text-slate-500">{r.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
