import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { rawDb } from "./db";
import { mainCompanyId } from "./company-scope";

/**
 * Which company of the group the current request works in. Staff always work in their own company; a
 * superadmin works in the company picked in the top bar (kept on their browser's session row). Before
 * sign-in (sign-in page, careers page) and in scripts it is the first company.
 */
const fixed = new AsyncLocalStorage<string>();

/** Runs `fn` with every query inside one company: background jobs looping over companies, and group pages. */
export function inCompany<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return fixed.run(companyId, fn);
}

let mainCompany: Promise<string> | undefined;
export function firstCompanyId() {
  mainCompany ??= mainCompanyId(rawDb).catch((e) => { mainCompany = undefined; throw e; });
  return mainCompany;
}

type SessionLike = { session: { activeCompanyId: string | null }; user: { companyId: string; isSuperadmin: boolean } };
export const companyOfSession = ({ session, user }: SessionLike) =>
  user.isSuperadmin && session.activeCompanyId ? session.activeCompanyId : user.companyId;

/** Next stops a render by throwing errors with a `digest` (or React's postpone); they are not failures. */
const isNextSignal = (e: unknown) =>
  typeof e === "object" && e !== null && (typeof (e as { digest?: unknown }).digest === "string" || "$$typeof" in e);

export async function currentCompanyId(): Promise<string> {
  const pinned = fixed.getStore();
  if (pinned) return pinned;
  let current: SessionLike | null = null;
  try {
    const { getCurrentSession } = await import("./auth");
    current = await getCurrentSession();
  } catch (e) {
    if (isNextSignal(e)) throw e; // Next's own signals (dynamic rendering, redirects) must pass through
    current = null; // outside a request (scripts, timers): no one is signed in
  }
  return current ? companyOfSession(current) : firstCompanyId();
}

/** The company the current request works in, with its name, for the top bar. */
export async function currentCompany() {
  const id = await currentCompanyId();
  return rawDb.company.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } });
}

/** Every company in the group, for the superadmin's switcher. */
export function allCompanies() {
  return rawDb.company.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
}

/** Whether another company in the group already numbers its documents with this prefix (EBG/26-27/001). */
export async function prefixTaken(prefix: string, exceptCompanyId?: string) {
  const other = await rawDb.companySettings.findFirst({
    where: { invoicePrefix: { equals: prefix, mode: "insensitive" }, ...(exceptCompanyId ? { companyId: { not: exceptCompanyId } } : {}) },
    select: { id: true },
  });
  return !!other;
}

/** Runs a background job once for each company in turn (reminders, clean-ups). */
export async function forEachCompany<T>(fn: () => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (const c of await allCompanies()) results.push(await inCompany(c.id, fn));
  return results;
}
