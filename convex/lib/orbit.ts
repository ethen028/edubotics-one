import { ConvexError } from "convex/values";
import type { Auth } from "convex/server";
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { wrapDatabaseReader, wrapDatabaseWriter, type Rules } from "convex-helpers/server/rowLevelSecurity";
import { mutation, query } from "../_generated/server";
import type { DataModel } from "../_generated/dataModel";
import schema from "../schema";

/**
 * The only way Orbit's Convex functions are written: `companyQuery` and `companyMutation` instead of Convex's
 * plain `query` and `mutation`. They do for Convex what `requireUser` and `company-scope.ts` do for Prisma:
 *
 * 1. Read who is calling from the token Next signs for the current session (src/lib/convex.ts). No token: refused.
 * 2. Check the role when the function names roles (`companyMutation({ roles: ["ADMIN"], ... })`).
 * 3. Hand the function a `db` that only sees rows of the caller's company and refuses to write rows of
 *    another company (row-level security from convex-helpers). Tables without a rule are refused outright.
 */

export const ROLES = ["ADMIN", "HR", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

/** Who is calling, from the signed token. Ids are PostgreSQL ids while people still live there. */
export type Viewer = {
  id: string;
  sessionId: string;
  companyId: string;
  role: Role;
  isOwner: boolean;
};

export async function viewerFrom(auth: Auth): Promise<Viewer> {
  const identity = await auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in first.");
  const { subject, sid, companyId, role, isOwner } = identity;
  if (typeof sid !== "string" || typeof companyId !== "string" || !ROLES.includes(role as Role)) {
    throw new ConvexError("Sign in again.");
  }
  return { id: subject, sessionId: sid, companyId, role: role as Role, isOwner: isOwner === true };
}

type Scoped = { companyId: string };

/** Every table: read, change and add only rows of the caller's company. */
function companyRules(viewer: Viewer): Rules<object, DataModel> {
  const same = async (_: object, doc: Scoped) => doc.companyId === viewer.companyId;
  const rules: Rules<object, DataModel> = {};
  for (const table of Object.keys(schema.tables) as (keyof DataModel & string)[]) {
    rules[table] = { read: same, modify: same, insert: same };
  }
  return rules;
}

type RoleOption = { roles?: readonly Role[] };

function allowed(viewer: Viewer, roles?: readonly Role[]) {
  if (roles && !roles.includes(viewer.role)) throw new ConvexError("Not for your role.");
}

export const companyQuery = customQuery(query, {
  args: {},
  input: async (ctx, _args, { roles }: RoleOption) => {
    const viewer = await viewerFrom(ctx.auth);
    allowed(viewer, roles);
    return { ctx: { viewer, db: wrapDatabaseReader({}, ctx.db, companyRules(viewer), { defaultPolicy: "deny" }) }, args: {} };
  },
});

export const companyMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, _args, { roles }: RoleOption) => {
    const viewer = await viewerFrom(ctx.auth);
    allowed(viewer, roles);
    return { ctx: { viewer, db: wrapDatabaseWriter({}, ctx.db, companyRules(viewer), { defaultPolicy: "deny" }) }, args: {} };
  },
});
