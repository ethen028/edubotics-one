"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { groupFor, isActive, type NavGroupData } from "@/lib/nav";
import { Icon } from "./icons";

type Pill = { left: number; width: number; slide: boolean };

/**
 * Tabs along the top of the page with the other pages of the section you are in (Work, CRM, HR…), so you can
 * move between them without opening the menu. Hidden when the section has only one page.
 *
 * The navy pill behind the open tab is one shape that glides to the tab you pick (an idea from the sliding-tab
 * components on uiarc.dev and skecher-ui.com). It only glides within one section; opening another section
 * puts it straight in place. Reduced motion turns the glide off in globals.css.
 */
export function SectionTabs({ groups }: { groups: NavGroupData[] }) {
  const pathname = usePathname();
  const group = groupFor(groups, pathname);
  const track = useRef<HTMLDivElement>(null);
  const lastGroup = useRef<string | null>(null);
  const [pill, setPill] = useState<Pill | null>(null);
  const activeHref = group?.items.find((item) => isActive(item, pathname))?.href;

  useLayoutEffect(() => {
    const el = track.current;
    const tab = el?.querySelector<HTMLElement>("[data-active]");
    if (!el || !tab) {
      setPill(null);
      return;
    }
    const sameGroup = lastGroup.current === group?.title;
    lastGroup.current = group?.title ?? null;
    const place = (slide: boolean) => setPill({ left: tab.offsetLeft, width: tab.offsetWidth, slide });
    place(sameGroup);
    // Keep the open tab in view on a phone, where the row scrolls sideways.
    if (tab.offsetLeft < el.scrollLeft || tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = tab.offsetLeft - 8;
    }
    const resize = new ResizeObserver(() => place(false));
    resize.observe(el);
    return () => resize.disconnect();
  }, [group?.title, activeHref]);

  if (!group || group.items.length < 2) return null;
  return (
    <nav aria-label={`${group.title} pages`} className="section-tabs print:hidden">
      <span className="section-tabs-title">
        <Icon name={group.icon} className="h-4 w-4" />
        {group.title}
      </span>
      <div ref={track} className="section-tabs-track" data-pill={pill ? "" : undefined}>
        {pill && (
          <span
            aria-hidden="true"
            className="section-tabs-pill"
            data-slide={pill.slide || undefined}
            style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
          />
        )}
        {group.items.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="section-tab"
              data-active={active || undefined}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
              {!!item.badge && <span className="section-tab-count">{item.badge}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
