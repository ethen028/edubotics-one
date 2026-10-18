"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { NavIcon } from "./nav-icon";

type Destination = { label: string; href: string; icon: string; routes: string[] };
const scrollBehavior = (): ScrollBehavior => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/** Primary ARC navigation, with the complete directory available on demand. */
export function WorkspaceDock({ items }: { items: Destination[] }) {
  const pathname = usePathname();
  const viewport = useRef<HTMLDivElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  // Prefer the most specific route; / must never select Home on every page.
  const matches = items.flatMap((item, index) => item.routes
    .filter(route => pathname === route || (route !== "/" && pathname.startsWith(`${route}/`)))
    .map(route => ({ index, length: route.length })));
  const active = matches.sort((a, b) => b.length - a.length)[0]?.index ?? -1;
  const indicator = hovered ?? focused ?? active;

  function reveal(index: number, behavior: ScrollBehavior = "auto") {
    const frame = viewport.current;
    const link = links.current[index];
    if (!frame || !link) return;
    const left = link.offsetLeft - 8;
    const right = link.offsetLeft + link.offsetWidth + 8;
    if (left < frame.scrollLeft) frame.scrollTo({ left, behavior });
    else if (right > frame.scrollLeft + frame.clientWidth) frame.scrollTo({ left: right - frame.clientWidth, behavior });
  }

  useEffect(() => { reveal(active); }, [active]);
  useEffect(() => {
    const frame = viewport.current;
    if (!frame) return;
    const update = () => setEdges({ start: frame.scrollLeft <= 1, end: frame.scrollLeft + frame.clientWidth >= frame.scrollWidth - 1 });
    const observer = new ResizeObserver(() => { reveal(active); update(); });
    observer.observe(frame);
    if (frame.firstElementChild) observer.observe(frame.firstElementChild);
    frame.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); frame.removeEventListener("scroll", update); };
  }, [active]);

  function onKeyDown(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    const next = event.key === "ArrowRight" ? Math.min(index + 1, items.length - 1)
      : event.key === "ArrowLeft" ? Math.max(index - 1, 0)
      : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    links.current[next]?.focus({ preventScroll: true });
    reveal(next, scrollBehavior());
  }

  return <nav aria-label="Workspace" className="arc-dock print:hidden">
    <button type="button" popoverTarget="workspace-directory" aria-label="All pages" title="All pages"
      className="arc-directory-trigger"><NavIcon name="menu" /><span>All pages</span></button>
    <button type="button" className="arc-scroll arc-scroll-back" aria-label="Scroll navigation left" disabled={edges.start}
      onClick={() => viewport.current?.scrollBy({ left: -276, behavior: scrollBehavior() })}><NavIcon name="chevron" /></button>
    <div className="arc-viewport" ref={viewport}>
      <div className="arc-track" onPointerLeave={() => setHovered(null)}
        style={{ "--arc-index": Math.max(indicator, 0) } as CSSProperties}>
        <span aria-hidden="true" className="arc-cursor" data-visible={indicator >= 0} />
        {items.map((item, index) => <Link key={item.href} href={item.href} prefetch={false}
          ref={element => { links.current[index] = element; }}
          className="arc-link" aria-current={active === index ? "location" : undefined}
          onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(index); }}
          onFocus={() => { setFocused(index); reveal(index); }} onBlur={() => setFocused(null)}
          onKeyDown={event => onKeyDown(event, index)}>
          <span className="arc-glyph"><NavIcon name={item.icon} /></span><span>{item.label}</span>
        </Link>)}
      </div>
    </div>
    <button type="button" className="arc-scroll" aria-label="Scroll navigation right" disabled={edges.end}
      onClick={() => viewport.current?.scrollBy({ left: 276, behavior: scrollBehavior() })}><NavIcon name="chevron" /></button>
  </nav>;
}
