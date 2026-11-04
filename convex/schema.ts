import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Orbit's Convex tables. During the move from PostgreSQL, people, users and companies stay in PostgreSQL, so
 * `companyId`, `authorId` and `userId` here hold PostgreSQL ids (strings). `legacyId` is the row's old
 * PostgreSQL id for moved rows, so a move can run twice without copying anything twice.
 *
 * Every table has `companyId`, and every index starts with it or with a field that belongs to one company.
 * Dates are milliseconds since 1970 (UTC). Date-only fields are UTC midnight of that day, as in PostgreSQL.
 */
export const fileRef = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  size: v.number(),
});

export default defineSchema({
  notices: defineTable({
    companyId: v.string(),
    legacyId: v.optional(v.string()),
    kind: v.union(v.literal("ANNOUNCEMENT"), v.literal("POLICY")),
    title: v.string(),
    body: v.string(),
    category: v.optional(v.string()),
    pinned: v.boolean(),
    requiresAck: v.boolean(),
    ackDueDate: v.optional(v.number()),
    showUntil: v.optional(v.number()),
    /** Bumped when a policy changes and everyone must acknowledge again; older acknowledgements stop counting. */
    version: v.number(),
    authorId: v.string(),
    attachment: v.optional(fileRef),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company_kind", ["companyId", "kind", "archivedAt"])
    .index("by_company_ack", ["companyId", "requiresAck", "archivedAt"])
    .index("by_company_legacy", ["companyId", "legacyId"]),

  /** One per person per notice (enforced in convex/notices.ts); `version` is the notice version they read. */
  noticeAcks: defineTable({
    companyId: v.string(),
    noticeId: v.id("notices"),
    userId: v.string(),
    version: v.number(),
    ackedAt: v.number(),
  })
    .index("by_notice_user", ["noticeId", "userId"])
    .index("by_company_user", ["companyId", "userId"]),
});
