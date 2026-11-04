import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { companyMutation, companyQuery, type Viewer } from "./lib/orbit";
import { fileRef } from "./schema";
import { NOTICE_POSTERS, canEditNotice, isAcked, nextNoticeVersion, sortBoard, sortPending, tidyNotice } from "../src/lib/notice-rules";

/**
 * Notice board: announcements and policies, with optional "I have read this" acknowledgements.
 * The first module moved to Convex. Names of people are joined in by the Next pages, because people
 * still live in PostgreSQL.
 */

const kind = v.union(v.literal("ANNOUNCEMENT"), v.literal("POLICY"));
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const noticeFields = {
  title: v.string(),
  body: v.string(),
  category: v.optional(v.string()),
  pinned: v.boolean(),
  requiresAck: v.boolean(),
  ackDueDate: v.optional(v.number()),
  showUntil: v.optional(v.number()),
};

type MutationDb = Pick<MutationCtx, "db">;

const asUser = (viewer: Viewer) => ({ id: viewer.id, role: viewer.role });

function checkText(title: string, body: string) {
  if (title.trim().length < 3 || title.length > 160) throw new ConvexError("Enter a title of 3 to 160 letters.");
  if (!body.trim()) throw new ConvexError("Write the notice.");
}

async function acksOf(ctx: Pick<QueryCtx, "db">, noticeId: Id<"notices">) {
  return ctx.db
    .query("noticeAcks")
    .withIndex("by_notice_user", (q) => q.eq("noticeId", noticeId))
    .collect();
}

async function myAck(ctx: Pick<QueryCtx, "db">, noticeId: Id<"notices">, userId: string) {
  return ctx.db
    .query("noticeAcks")
    .withIndex("by_notice_user", (q) => q.eq("noticeId", noticeId).eq("userId", userId))
    .unique();
}

/** What a page needs about a notice: everything except the file's storage id. */
function shown(n: Doc<"notices">) {
  const { attachment, ...rest } = n;
  return { ...rest, attachment: attachment ? { fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size } : null };
}

/** The board: one kind, current or archived (archived only for those who post). */
export const list = companyQuery({
  args: { kind, archived: v.boolean() },
  handler: async (ctx, { kind, archived }) => {
    const showArchived = archived && NOTICE_POSTERS.includes(ctx.viewer.role);
    const rows = showArchived
      ? await ctx.db
          .query("notices")
          .withIndex("by_company_kind", (q) => q.eq("companyId", ctx.viewer.companyId).eq("kind", kind).gt("archivedAt", 0))
          .collect()
      : await ctx.db
          .query("notices")
          .withIndex("by_company_kind", (q) => q.eq("companyId", ctx.viewer.companyId).eq("kind", kind).eq("archivedAt", undefined))
          .collect();
    const withAcks = await Promise.all(
      sortBoard(rows).map(async (n) => ({
        ...shown(n),
        acks: n.requiresAck ? (await acksOf(ctx, n._id)).map((a) => ({ userId: a.userId, version: a.version })) : [],
      })),
    );
    return withAcks;
  },
});

/** One notice, with the caller's own acknowledgement. Null when it isn't in the caller's company. */
export const get = companyQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const noticeId = ctx.db.normalizeId("notices", id);
    const notice = noticeId && (await ctx.db.get(noticeId));
    if (!notice) return null;
    const mine = await myAck(ctx, notice._id, ctx.viewer.id);
    return {
      ...shown(notice),
      editable: canEditNotice(asUser(ctx.viewer), notice),
      myAck: mine ? { version: mine.version, ackedAt: mine.ackedAt } : null,
    };
  },
});

/** Every acknowledgement of one notice, for the roster that admins, HR and managers see. */
export const acknowledgements = companyQuery({
  args: { id: v.id("notices") },
  roles: NOTICE_POSTERS,
  handler: async (ctx, { id }) => {
    const notice = await ctx.db.get(id);
    if (!notice) return [];
    return (await acksOf(ctx, id)).map((a) => ({ userId: a.userId, version: a.version, ackedAt: a.ackedAt }));
  },
});

/** Live notices the caller still has to read and acknowledge, oldest due first (Home, menu count, board). */
export const myPending = companyQuery({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db
      .query("notices")
      .withIndex("by_company_ack", (q) => q.eq("companyId", ctx.viewer.companyId).eq("requiresAck", true).eq("archivedAt", undefined))
      .collect();
    const pending = [];
    for (const n of open) {
      if (!isAcked(n, await myAck(ctx, n._id, ctx.viewer.id))) pending.push(n);
    }
    return sortPending(pending).map((n) => ({ _id: n._id, kind: n.kind, title: n.title, version: n.version, ackDueDate: n.ackDueDate ?? null, createdAt: n.createdAt }));
  },
});

/** Up to three current announcements for Home: pinned first, then newest, hiding ones past their end day. */
export const forHome = companyQuery({
  args: { today: v.number() },
  handler: async (ctx, { today }) => {
    const rows = await ctx.db
      .query("notices")
      .withIndex("by_company_kind", (q) => q.eq("companyId", ctx.viewer.companyId).eq("kind", "ANNOUNCEMENT").eq("archivedAt", undefined))
      .collect();
    return sortBoard(rows.filter((n) => n.showUntil === undefined || n.showUntil >= today))
      .slice(0, 3)
      .map((n) => ({ _id: n._id, title: n.title, body: n.body, pinned: n.pinned, authorId: n.authorId, createdAt: n.createdAt }));
  },
});

/** Where the Next file route fetches an attachment from (any signed-in person in the company may open it). */
export const attachment = companyQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const noticeId = ctx.db.normalizeId("notices", id);
    const notice = noticeId && (await ctx.db.get(noticeId));
    if (!notice?.attachment) return null;
    const url = await ctx.storage.getUrl(notice.attachment.storageId);
    return url ? { url, fileName: notice.attachment.fileName } : null;
  },
});

/** A one-time address to upload an attachment to, before create or update. */
export const uploadUrl = companyMutation({
  args: {},
  roles: NOTICE_POSTERS,
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/** Checks an uploaded file really is a small PDF or picture before it is attached. */
async function checkedFile(ctx: MutationDb, file: typeof fileRef.type) {
  const stored = await ctx.db.system.get(file.storageId);
  if (!stored) throw new ConvexError("The file didn't upload. Try again.");
  if (stored.size > MAX_FILE_BYTES) throw new ConvexError("Files can be up to 5 MB.");
  if (!FILE_TYPES.includes(file.mimeType)) throw new ConvexError("Attach a PDF, JPG, PNG or WebP file.");
  return { ...file, size: stored.size, fileName: file.fileName.slice(0, 200) || "document" };
}

export const create = companyMutation({
  args: { kind, ...noticeFields, attachment: v.optional(fileRef) },
  roles: NOTICE_POSTERS,
  handler: async (ctx, args) => {
    checkText(args.title, args.body);
    const now = Date.now();
    const attachment = args.attachment ? await checkedFile(ctx, args.attachment) : undefined;
    const id = await ctx.db.insert("notices", {
      ...tidyNotice(args),
      attachment,
      companyId: ctx.viewer.companyId,
      version: 1,
      authorId: ctx.viewer.id,
      createdAt: now,
      updatedAt: now,
    });
    // The person posting it has obviously read it.
    if (args.requiresAck) {
      await ctx.db.insert("noticeAcks", { companyId: ctx.viewer.companyId, noticeId: id, userId: ctx.viewer.id, version: 1, ackedAt: now });
    }
    return id;
  },
});

/** Sets the caller's acknowledgement to `version`: one row per person per notice. */
async function upsertAck(ctx: MutationDb, noticeId: Id<"notices">, viewer: Viewer, version: number) {
  const existing = await myAck(ctx, noticeId, viewer.id);
  const ackedAt = Date.now();
  if (existing) await ctx.db.patch(existing._id, { version, ackedAt });
  else await ctx.db.insert("noticeAcks", { companyId: viewer.companyId, noticeId, userId: viewer.id, version, ackedAt });
}

async function editable(ctx: MutationDb & { viewer: Viewer }, id: Id<"notices">) {
  const notice = await ctx.db.get(id);
  if (!notice) throw new ConvexError("This notice was removed.");
  if (!canEditNotice(asUser(ctx.viewer), notice)) throw new ConvexError("Only the person who posted this or an admin can change it.");
  return notice;
}

export const update = companyMutation({
  args: {
    id: v.id("notices"),
    ...noticeFields,
    askAgain: v.boolean(),
    removeFile: v.boolean(),
    attachment: v.optional(fileRef),
  },
  roles: NOTICE_POSTERS,
  handler: async (ctx, { id, askAgain, removeFile, attachment, ...fields }) => {
    const notice = await editable(ctx, id);
    checkText(fields.title, fields.body);
    const { newRound, version } = nextNoticeVersion(notice, { requiresAck: fields.requiresAck, askAgain });
    const newFile = attachment ? await checkedFile(ctx, attachment) : undefined;
    const dropOld = notice.attachment && (newFile || removeFile);
    if (dropOld) await ctx.storage.delete(notice.attachment!.storageId);
    const tidy = tidyNotice({ ...fields, kind: notice.kind });
    await ctx.db.patch(id, {
      ...tidy,
      // patch removes a field set to undefined, so clearing a date or category works.
      category: tidy.category,
      showUntil: tidy.showUntil,
      ackDueDate: tidy.ackDueDate,
      version,
      updatedAt: Date.now(),
      ...(newFile ? { attachment: newFile } : dropOld ? { attachment: undefined } : {}),
    });
    if (newRound) await upsertAck(ctx, id, ctx.viewer, version);
  },
});

export const acknowledge = companyMutation({
  args: { id: v.id("notices") },
  handler: async (ctx, { id }) => {
    const notice = await ctx.db.get(id);
    if (!notice || !notice.requiresAck || notice.archivedAt !== undefined) return;
    await upsertAck(ctx, id, ctx.viewer, notice.version);
  },
});

export const togglePinned = companyMutation({
  args: { id: v.id("notices") },
  roles: NOTICE_POSTERS,
  handler: async (ctx, { id }) => {
    const notice = await editable(ctx, id);
    await ctx.db.patch(id, { pinned: !notice.pinned });
  },
});

/** Archived notices leave Home and the board, and stop asking for acknowledgement. History is kept. */
export const toggleArchived = companyMutation({
  args: { id: v.id("notices") },
  roles: NOTICE_POSTERS,
  handler: async (ctx, { id }) => {
    const notice = await editable(ctx, id);
    await ctx.db.patch(id, { archivedAt: notice.archivedAt === undefined ? Date.now() : undefined });
  },
});

/**
 * Copies one notice from PostgreSQL (scripts/move-notices-to-convex.ts). Admins only. Running it again for
 * the same notice changes nothing, so the move can be repeated safely.
 */
export const importFromPostgres = companyMutation({
  args: {
    legacyId: v.string(),
    kind,
    ...noticeFields,
    version: v.number(),
    authorId: v.string(),
    attachment: v.optional(fileRef),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    acks: v.array(v.object({ userId: v.string(), version: v.number(), ackedAt: v.number() })),
  },
  roles: ["ADMIN"],
  handler: async (ctx, { acks, ...notice }) => {
    const companyId = ctx.viewer.companyId;
    const already = await ctx.db
      .query("notices")
      .withIndex("by_company_legacy", (q) => q.eq("companyId", companyId).eq("legacyId", notice.legacyId))
      .first();
    if (already) {
      if (notice.attachment) await ctx.storage.delete(notice.attachment.storageId); // uploaded again for nothing
      return { id: already._id, added: false };
    }
    const id = await ctx.db.insert("notices", { ...notice, companyId });
    const seen = new Set<string>();
    for (const a of acks) {
      if (seen.has(a.userId)) continue;
      seen.add(a.userId);
      await ctx.db.insert("noticeAcks", { companyId, noticeId: id, ...a });
    }
    return { id, added: true };
  },
});
