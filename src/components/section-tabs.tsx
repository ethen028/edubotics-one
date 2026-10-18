"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupFor, isActive, type NavGroupData } from "@/lib/nav";
import { Icon } from "./icons";

/**
 * Tabs along the top of the page with the other pages of the section you are in (Work, CRM, HR…), so you can
 * move between them without opening the menu. Hidden when the section has only one page.
 */
export function SectionTabs({ groups }: { groups: NavGroupData[] }) {
  const pathname = usePathname();
  const group = groupFor(groups, pathname);
  if (!group || group.items.length < 2) return null;
  return (
    <nav aria-label={`${group.title} pages`} className="section-tabs print:hidden">
      <span className="section-tabs-title">
        <Icon name={group.icon} className="h-4 w-4" />
        {group.title}
      </span>
      <div className="section-tabs-track">
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
