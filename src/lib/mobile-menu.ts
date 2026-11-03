import type { NavGroupData } from "./nav";
import { canOpenPage } from "./page-access";

type Person = Parameters<typeof canOpenPage>[0];

export type PhoneMenuGroup = { title: string; icon: string; items: { href: string; label: string; badge?: number; section?: string }[] };

/**
 * The web menu (src/lib/nav.ts) as the phone app's More tab shows it: only pages this person may open
 * (checked again against src/lib/page-access.ts, so the two lists can't drift apart), badges only when
 * something is waiting, and nothing the app doesn't draw.
 */
export function phoneMenu(groups: NavGroupData[], user: Person): PhoneMenuGroup[] {
  return groups
    .map((g) => ({
      title: g.title,
      icon: g.icon,
      items: g.items
        .filter((i) => canOpenPage(user, i.href))
        .map((i) => ({ href: i.href, label: i.label, ...(i.badge ? { badge: i.badge } : {}), ...(i.section ? { section: i.section } : {}) })),
    }))
    .filter((g) => g.items.length > 0);
}
