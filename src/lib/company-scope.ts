import { Prisma } from "@prisma/client";

/**
 * Keeps every query inside one company of the group. Every business table has a `companyId`; this Prisma
 * extension adds `companyId = <current company>` to each read, update and delete, and fills it in on every
 * create, nested creates included. Pages and actions therefore never name the company themselves.
 *
 * Not filtered: the sign-in tables below (looked up before anyone is signed in) and raw SQL, which has to
 * filter on "companyId" by hand. Includes follow relations from an already filtered row, so they stay in it,
 * because every write is also checked: a row can't be linked to another company's row (`linkedIds`).
 */
export const UNSCOPED_MODELS = new Set(["Company", "Session", "LoginAttempt", "AccountToken", "RateLimitBucket", "AccountMailJob"]);

type Field = { name: string; kind: string; type: string; relationFromFields?: readonly string[]; relationToFields?: readonly string[] };
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

const WRITES = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert"]);

/** "Organization.id" → the ids a write points at in that model's column. */
export type Links = Map<string, Set<string>>;

function addLink(links: Links, model: string, field: string, value: unknown) {
  const v = isObject(value) && "set" in value ? value.set : value; // update data may say { set: id }
  if (typeof v !== "string" || !isScopedModel(model)) return;
  const key = `${model}.${field}`;
  if (!links.has(key)) links.set(key, new Set());
  links.get(key)!.add(v);
}

/** Links by id inside connect / set / connectOrCreate: { id } or [{ id }, …]. Other unique keys aren't checked. */
function addWhereLinks(links: Links, model: string, where: unknown) {
  each(where, (w) => isObject(w) && addLink(links, model, "id", w.id));
}

function collectLinks(links: Links, model: string, data: unknown) {
  const info = MODELS.get(model);
  if (!info || !isObject(data)) return;
  for (const f of info.fields.values()) {
    if (f.kind !== "object") continue;
    // A plain foreign key on this row: organizationId: "…" points at Organization.id.
    if (f.relationFromFields?.length === 1 && f.relationToFields?.length === 1 && f.relationFromFields[0] in data) {
      addLink(links, f.type, f.relationToFields[0], data[f.relationFromFields[0]]);
    }
    const nested = data[f.name];
    if (!isObject(nested)) continue;
    addWhereLinks(links, f.type, nested.connect);
    addWhereLinks(links, f.type, nested.set);
    each(nested.connectOrCreate, (c) => isObject(c) && (addWhereLinks(links, f.type, c.where), collectLinks(links, f.type, c.create)));
    each(nested.create, (c) => collectLinks(links, f.type, c));
    if (isObject(nested.createMany)) each(nested.createMany.data, (c) => collectLinks(links, f.type, c));
    each(nested.update, (u) => collectLinks(links, f.type, isObject(u) && "where" in u && isObject(u.data) ? u.data : u));
    each(nested.upsert, (u) => isObject(u) && (collectLinks(links, f.type, u.create), collectLinks(links, f.type, u.update)));
  }
}

/** Every row a write links to by id, so it can be checked to be in the same company. Pure, so it is unit tested. */
export function linkedIds(model: string, operation: string, args: Data | undefined): Links {
  const links: Links = new Map();
  if (!WRITES.has(operation) || !args) return links;
  if (operation === "upsert") {
    collectLinks(links, model, args.create);
    collectLinks(links, model, args.update);
  } else {
    each(args.data, (d) => collectLinks(links, model, d));
  }
  return links;
}

/** The message when a form names a record of another company (an id copied from elsewhere, or a tampered form). */
export const OTHER_COMPANY = "That record belongs to another company of the group.";

type Finder = { findFirst: (a: { where: Data; select: Data }) => Promise<unknown> };

/** The Prisma extension. `currentCompany` says which company this query runs for. */
export function companyScope(currentCompany: () => Promise<string>) {
  return Prisma.defineExtension((client) => client.$extends({
    name: "company-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isScopedModel(model)) return query(args);
          const companyId = await currentCompany();
          for (const [key, ids] of linkedIds(model, operation, args as Data)) {
            const [target, field] = key.split(".");
            const finder = (client as unknown as Record<string, Finder>)[target[0].toLowerCase() + target.slice(1)];
            // Outside the filter, so it sees every company. A superadmin's own login works in every company.
            const foreign = await finder.findFirst({
              where: { [field]: { in: [...ids] }, companyId: { not: companyId }, ...(target === "User" ? { isSuperadmin: false } : {}) },
              select: { [field]: true },
            });
            if (foreign) throw new Error(OTHER_COMPANY);
          }
          return query(scopeArgs(model, operation, args as Data, companyId) as typeof args);
        },
      },
    },
  }));
}

/** The first company: where people land before signing in, and what scripts and the seed work in. */
export async function mainCompanyId(client: { company: { findFirst: (a: { orderBy: { createdAt: "asc" }; select: { id: true } }) => Promise<{ id: string } | null> } }) {
  const first = await client.company.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!first) throw new Error("No company yet: run `npx prisma migrate deploy` first");
  return first.id;
}
