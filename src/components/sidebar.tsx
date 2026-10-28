"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icons";
import { LogoMark } from "./logo";
import { NavLink } from "./nav-link";
import { setMenuCollapsed } from "@/app/actions";
import { groupFor, type NavGroupData, type NavItem } from "@/lib/nav";

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

const badgeTone = {
  amber: "rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950",
  red: "rounded-full bg-red-400 px-1.5 text-[11px] font-semibold text-red-950",
  brand: "rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white",
};

/** Things waiting in a section, for the count on its rail icon. Low stock (red) is a warning, not a to-do. */
function waitingIn(g: NavGroupData) {
  return g.items.reduce((sum, i) => sum + (i.tone && i.tone !== "red" ? (i.badge ?? 0) : 0), 0);
}

function PageLinks({ items }: { items: NavItem[] }) {
  return items.map((item, n) => (
    <div key={item.href}>
      {item.section && item.section !== items[n - 1]?.section && <div className="menu-panel-section">{item.section}</div>}
      <NavLink href={item.href} exact={item.exact} except={item.except}>
        {item.badge ? (
          <span className="flex items-center justify-between">
            {item.label}
            <span className={badgeTone[item.tone ?? "brand"]} title={item.title}>
              {item.badge}
            </span>
          </span>
        ) : (
          item.label
        )}
      </NavLink>
    </div>
  ));
}

/**
 * The menu: a teal-navy rail with one icon per section (Home, Work, CRM, HR…), and beside it a white panel with
 * the pages of the section you are in, or the one you clicked on the rail. The panel can be hidden to leave just the
 * rail (remembered per person); then pointing at an icon shows its pages in a small card, and clicking it brings the
 * panel back. On phones both sit in a
 * drawer that slides in from the left.
 */
export function Sidebar({
  groups,
  company,
  account,
  defaultCollapsed = false,
}: {
  groups: NavGroupData[];
  company: string;
  /** My account and Sign out, at the foot of the rail. */
  account: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [query, setQuery] = useState("");
  const [, save] = useTransition();
  const search = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const railOnly = collapsed && desktop;
  const q = query.trim().toLowerCase();

  // The panel shows the section of the page you are on, until you pick another on the rail.
  const here = groupFor(groups, pathname);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedOn, setPickedOn] = useState(pathname);
  if (pickedOn !== pathname) {
    setPickedOn(pathname);
    setPicked(null);
  }
  const shown = groups.find((g) => g.title === picked) ?? here ?? groups[0];

  // Rail only: the pages of the section you point at, in a card beside its icon (fixed, so the rail can't clip it).
  const [fly, setFly] = useState<{ title: string; top: number; left: number; gap: number } | null>(null);
  const flyGroup = fly && groups.find((g) => g.title === fly.title);

  function setRail(next: boolean) {
    setCollapsed(next);
    setFly(null);
    save(() => {
      void setMenuCollapsed(next);
    });
  }

  function preview(g: NavGroupData, button: HTMLElement) {
    if (!railOnly) return;
    const r = button.getBoundingClientRect();
    const edge = button.closest(".menu-rail")?.getBoundingClientRect().right ?? r.right;
    setFly({ title: g.title, top: r.top, left: r.right, gap: edge - r.right + 8 });
  }

  /** Clicking a section shows its pages in the panel, bringing the panel back if it was hidden. */
  function pick(g: NavGroupData) {
    setPicked(g.title);
    setQuery("");
    if (railOnly) setRail(false);
  }

  const matches =
    q === ""
      ? []
      : groups
          .map((g) => ({ ...g, items: g.items.filter((i) => `${i.label} ${g.title}`.toLowerCase().includes(q)) }))
          .filter((g) => g.items.length > 0);

  function goToFirst() {
    const first = matches[0]?.items[0];
    if (!first) return;
    setQuery("");
    setOpen(false);
    router.push(first.href);
  }

  function findAPage() {
    if (railOnly) {
      setRail(false);
      window.setTimeout(() => search.current?.focus(), 320);
    } else search.current?.focus();
  }

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

  // Picking a section on the rail starts its panel at the top.
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [shown.title]);

  return (
    <aside className="sidebar print:hidden md:sticky md:top-3 md:shrink-0" data-collapsed={collapsed || undefined}>
      {/* Phones: a bar along the top with the Menu button. */}
      <div className="sidebar-bar md:hidden">
        <div className="brand-mark" role="img" aria-label="Edubotics">
          <LogoMark variant="reverse" />
        </div>
        <div className="ml-2 min-w-0 flex-1 leading-tight">
          <div className="font-display text-sm font-semibold">Orbit</div>
          <div className="sidebar-muted truncate text-[11px]">{company}</div>
        </div>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className="sidebar-toggle">
          Menu
        </button>
      </div>
      {/* Phones: tapping outside the drawer closes it. */}
      <div className="sidebar-backdrop md:hidden" data-open={open || undefined} onClick={() => setOpen(false)} aria-hidden />
      {/* Clicking a page link on a phone closes the drawer. */}
      <div
        className="sidebar-menu"
        data-open={open || undefined}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) {
            setOpen(false);
            setQuery("");
            setFly(null);
          }
        }}
      >
        <div className="menu-rail" onMouseLeave={() => setFly(null)}>
          <div className="brand-mark mb-2" role="img" aria-label={`Orbit, ${company}`} title={`Orbit · ${company}`}>
            <LogoMark variant="reverse" />
          </div>
          <button type="button" className="menu-rail-item" onClick={findAPage} title="Find a page" aria-label="Find a page">
            <Icon name="search" className="h-[18px] w-[18px]" />
          </button>
          <nav aria-label="Sections" className="menu-rail-list">
            {groups.map((g) => {
              const count = waitingIn(g);
              return (
                <button
                  key={g.title}
                  type="button"
                  className="menu-rail-item"
                  data-shown={(!railOnly && g === shown) || undefined}
                  data-here={g === here || undefined}
                  aria-pressed={!railOnly && g === shown}
                  title={g.title}
                  onClick={() => pick(g)}
                  onMouseEnter={(e) => preview(g, e.currentTarget)}
                  onFocus={(e) => preview(g, e.currentTarget)}
                >
                  <Icon name={g.icon} className="h-[18px] w-[18px]" />
                  <span className="menu-rail-label">{g.short ?? g.title}</span>
                  {count > 0 && <span className="menu-rail-count">{count}</span>}
                </button>
              );
            })}
          </nav>
          <div className="menu-rail-foot">{account}</div>
        </div>
        <div className="menu-panel" inert={railOnly}>
          <div className="menu-panel-inner">
            <div className="flex items-center justify-between gap-2 px-2">
              <h2 className="menu-panel-title">{q ? "Find a page" : shown.title}</h2>
              <button
                type="button"
                className="menu-panel-close"
                onClick={() => (desktop ? setRail(true) : setOpen(false))}
                aria-label={desktop ? "Hide the pages panel" : "Close the menu"}
                title={desktop ? "Hide this panel" : "Close"}
              >
                <Icon name="chevron" className="h-3 w-3 rotate-180" />
              </button>
            </div>
            <label className="menu-panel-search">
              <Icon name="search" className="h-4 w-4 shrink-0 opacity-60" />
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
                className="ml-2 min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <nav ref={panel} aria-label={q ? "Pages found" : `${shown.title} pages`} className="menu-panel-list">
              {q === "" ? (
                <PageLinks items={shown.items} />
              ) : matches.length > 0 ? (
                matches.map((g) => (
                  <div key={g.title}>
                    <div className="menu-panel-section">{g.title}</div>
                    <PageLinks items={g.items.map((i) => ({ ...i, section: undefined }))} />
                  </div>
                ))
              ) : (
                <p className="px-2 py-3 text-sm text-slate-500">No page called “{query.trim()}”.</p>
              )}
            </nav>
          </div>
        </div>
      </div>
      {railOnly && fly && flyGroup && (
        <div
          className="nav-flyout"
          style={{ top: fly.top, left: fly.left, paddingLeft: fly.gap } as CSSProperties}
          onMouseEnter={() => setFly(fly)}
          onMouseLeave={() => setFly(null)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFly(null);
          }}
          ref={(el) => {
            // Keep the card on screen when its section sits low in the rail.
            if (!el) return;
            const room = window.innerHeight - el.offsetHeight - 12;
            if (fly.top > room) el.style.top = `${Math.max(12, room)}px`;
          }}
        >
          <div className="nav-flyout-card">
            <div className="nav-flyout-title">{flyGroup.title}</div>
            <div className="space-y-0.5">
              <PageLinks items={flyGroup.items.map((i) => ({ ...i, section: undefined }))} />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
