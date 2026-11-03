/** Splitting long lists into pages: read `?page=` from the address, ask the database for one page, show Previous/Next. */

export const PAGE_SIZE = 50;
const MAX_PAGE = 10_000;

/** The page number from the address: a whole number from 1 up; anything else is page 1. */
export function pageNumber(raw: string | undefined): number {
  if (!raw || !/^\d{1,6}$/.test(raw)) return 1;
  return Math.min(Math.max(Number(raw), 1), MAX_PAGE);
}

/** What to ask the database for: one extra row tells us whether there is a next page. */
export function pageQuery(page: number, size = PAGE_SIZE) {
  return { skip: (page - 1) * size, take: size + 1 };
}

/** The rows to show on this page and whether a next page exists. Works on database rows or a list already in memory. */
export function pageRows<T>(rows: T[], page: number, size = PAGE_SIZE, alreadySkipped = true) {
  const start = alreadySkipped ? 0 : (page - 1) * size;
  return { rows: rows.slice(start, start + size), more: rows.length > start + size, first: (page - 1) * size + 1 };
}

/** The same address with a different page; page 1 drops the parameter so links stay short. */
export function pageHref(params: Record<string, string | undefined>, page: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "page") p.set(k, v);
  if (page > 1) p.set("page", String(page));
  return p.size ? `?${p}` : "?";
}
