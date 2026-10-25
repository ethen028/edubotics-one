import { Prisma } from "@prisma/client";

/**
 * Keeps every query inside one company of the group. Every business table has a `companyId`; this Prisma
 * extension adds `companyId = <current company>` to each read, update and delete, and fills it in on every
 * create, nested creates included. Pages and actions therefore never name the company themselves.
 *
 * Not filtered: the sign-in tables below (looked up before anyone is signed in) and raw SQL, which has to
 * filter on "companyId" by hand. Includes follow relations from an already filtered row, so they stay in it.
 */
export const UNSCOPED_MODELS = new Set(["Company", "Session", "LoginAttempt", "AccountToken", "RateLimitBucket", "AccountMailJob"]);

type Field = { name: string; kind: string; type: string; relationFromFields?: readonly string[] };
type ModelInfo = { scoped: boolean; fields: Map<string, Field> };

const MODELS = new Map<string, ModelInfo>(
  Prisma.dmmf.datamodel.models.map((m) => [m.name, {
    scoped: !UNSCOPED_MODELS.has(m.name) && m.fields.some((f) => f.name === "companyId"),
    fields: new Map(m.fields.map((f) => [f.name, f as Field])),
  }]),
);

export const isScopedModel = (model: string) => MODELS.get(model)?.scoped ?? false;

type Data = Record<string, unknown>;
const isObject = (v: unknown): v is Data => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Uint8Array) && !Prisma.Decimal.isDecimal(v);
const each = (v: unknown, fn: (item: unknown) => unknown) => (Array.isArray(v) ? v.map(fn) : fn(v));

/** Adds the company to one row about to be created, and to anything created inside it. */
export function withCompanyData(model: string, data: unknown, companyId: string): unknown {
  if (!isObject(data)) return data;
  const info = MODELS.get(model);
  if (!info) return data;
  const out: Data = { ...data };
  if (info.scoped && out.companyId === undefined && out.company === undefined) {
    // Prisma takes either plain ids (employeeId: …) or relation objects (employee: { connect }), never both.
    const usesRelations = Object.keys(out).some((k) => {
      const f = info.fields.get(k);
      return f?.kind === "object" && (f.relationFromFields?.length ?? 0) > 0;
    });
    if (usesRelations) out.company = { connect: { id: companyId } };
    else out.companyId = companyId;
  }
  return withNestedCreates(info, out, companyId);
}

/** Walks update data (and create data) for nested creates, which need the company too. */
function withNestedCreates(info: ModelInfo, data: Data, companyId: string): Data {
  for (const [key, value] of Object.entries(data)) {
    const f = info.fields.get(key);
    if (f?.kind !== "object" || !isObject(value)) continue;
    const target = f.type;
    const nested: Data = { ...value };
    if (nested.create !== undefined) nested.create = each(nested.create, (c) => withCompanyData(target, c, companyId));
    if (isObject(nested.createMany)) {
      nested.createMany = { ...nested.createMany, data: each(nested.createMany.data, (c) => withCompanyData(target, c, companyId)) };
    }
    if (nested.connectOrCreate !== undefined) {
      nested.connectOrCreate = each(nested.connectOrCreate, (c) => isObject(c) ? { ...c, create: withCompanyData(target, c.create, companyId) } : c);
    }
    if (nested.upsert !== undefined) {
      nested.upsert = each(nested.upsert, (u) => isObject(u)
        ? { ...u, create: withCompanyData(target, u.create, companyId), update: withUpdateData(target, u.update, companyId) }
        : u);
    }
    if (nested.update !== undefined) {
      // To-many: [{ where, data }]; to-one: the data itself, or { where, data }.
      nested.update = each(nested.update, (u) => isObject(u) && "where" in u && isObject(u.data)
        ? { ...u, data: withUpdateData(target, u.data, companyId) }
        : withUpdateData(target, u, companyId));
    }
    data[key] = nested;
  }
  return data;
}

export function withUpdateData(model: string, data: unknown, companyId: string): unknown {
  const info = MODELS.get(model);
  return info && isObject(data) ? withNestedCreates(info, { ...data }, companyId) : data;
}

const MANY = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "updateMany", "updateManyAndReturn", "deleteMany"]);
const UNIQUE = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

/** The arguments of one query, rewritten to stay inside the company. Pure, so it is unit tested. */
export function scopeArgs(model: string, operation: string, args: Data | undefined, companyId: string): Data {
  const a: Data = { ...(args ?? {}) };
  if (MANY.has(operation)) {
    a.where = a.where ? { AND: [a.where, { companyId }] } : { companyId };
  } else if (UNIQUE.has(operation)) {
    a.where = { ...(a.where as Data), companyId };
  }
  if (operation === "create") a.data = withCompanyData(model, a.data, companyId);
  if (operation === "createMany" || operation === "createManyAndReturn") a.data = each(a.data, (d) => withCompanyData(model, d, companyId));
  if (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") a.data = withUpdateData(model, a.data, companyId);
  if (operation === "upsert") {
    a.create = withCompanyData(model, a.create, companyId);
    a.update = withUpdateData(model, a.update, companyId);
  }
  return a;
}

/** The Prisma extension. `currentCompany` says which company this query runs for. */
export function companyScope(currentCompany: () => Promise<string>) {
  return Prisma.defineExtension({
    name: "company-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isScopedModel(model)) return query(args);
          const companyId = await currentCompany();
          return query(scopeArgs(model, operation, args as Data, companyId) as typeof args);
        },
      },
    },
  });
}

/** The first company: where people land before signing in, and what scripts and the seed work in. */
export async function mainCompanyId(client: { company: { findFirst: (a: { orderBy: { createdAt: "asc" }; select: { id: true } }) => Promise<{ id: string } | null> } }) {
  const first = await client.company.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!first) throw new Error("No company yet: run `npx prisma migrate deploy` first");
  return first.id;
}
