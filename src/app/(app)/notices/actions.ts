"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_DOCUMENT_BYTES, sniffMime } from "@/lib/hr-constants";
import { canEditNotice } from "@/lib/notices";
import type { FormState } from "@/components/action-form";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null));

const noticeSchema = z.object({
  kind: z.enum(["ANNOUNCEMENT", "POLICY"]),
  title: z.string().trim().min(3, "Enter a title").max(160),
  body: z.string().trim().min(1, "Write the notice"),
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  pinned: z.literal("on").optional().transform(Boolean),
  requiresAck: z.literal("on").optional().transform(Boolean),
  ackDueDate: optionalDate,
  showUntil: optionalDate,
});

function refresh(id?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/notices");
  if (id) revalidatePath(`/notices/${id}`);
}

/** Reads the optional attachment. Returns an error message, nothing (no file chosen) or the file. */
async function readAttachment(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_DOCUMENT_BYTES) return "Files can be up to 5 MB.";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (!mimeType) return "Attach a PDF, JPG, PNG or WebP file.";
  return { fileName: file.name.slice(0, 200) || "document", mimeType, size: file.size, data: bytes };
}

export async function createNotice(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const parsed = noticeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const file = await readAttachment(formData);
  if (typeof file === "string") return { error: file };
  const { kind, showUntil, category, ...rest } = parsed.data;

  const notice = await db.notice.create({
    data: {
      ...rest,
      kind,
      category: kind === "POLICY" ? category : null,
      showUntil: kind === "ANNOUNCEMENT" ? showUntil : null,
      ackDueDate: rest.requiresAck ? rest.ackDueDate : null,
      authorId: user.id,
      ...(file && { attachment: { create: file } }),
      // The person posting it has obviously read it.
      ...(rest.requiresAck && { acks: { create: { userId: user.id, version: 1 } } }),
    },
  });
  refresh();
  redirect(`/notices/${notice.id}`);
}

export async function updateNotice(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const notice = await db.notice.findUniqueOrThrow({ where: { id } });
  if (!canEditNotice(user, notice)) return { error: "Only the person who posted this or an admin can change it." };
  const parsed = noticeSchema.safeParse({ ...Object.fromEntries(formData), kind: notice.kind });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const file = await readAttachment(formData);
  if (typeof file === "string") return { error: file };
  const { kind, showUntil, category, ...rest } = parsed.data;
  // Turning acknowledgement on, or asking again after a change, starts a new round.
  const newRound = rest.requiresAck && (!notice.requiresAck || formData.get("askAgain") === "on");
  const version = newRound ? notice.version + 1 : notice.version;

  await db.$transaction([
    db.notice.update({
      where: { id },
      data: {
        ...rest,
        category: kind === "POLICY" ? category : null,
        showUntil: kind === "ANNOUNCEMENT" ? showUntil : null,
        ackDueDate: rest.requiresAck ? rest.ackDueDate : null,
        version,
        ...(file && { attachment: { upsert: { create: file, update: file } } }),
      },
    }),
    ...(formData.get("removeFile") === "on" && !file ? [db.noticeFile.deleteMany({ where: { noticeId: id } })] : []),
    ...(newRound
      ? [
          db.noticeAck.upsert({
            where: { noticeId_userId: { noticeId: id, userId: user.id } },
            create: { noticeId: id, userId: user.id, version },
            update: { version, ackedAt: new Date() },
          }),
        ]
      : []),
  ]);
  refresh(id);
  redirect(`/notices/${id}`);
}

export async function acknowledgeNotice(id: string) {
  const user = await requireUser();
  const notice = await db.notice.findUniqueOrThrow({ where: { id }, select: { version: true, requiresAck: true, archivedAt: true } });
  if (!notice.requiresAck || notice.archivedAt) return;
  await db.noticeAck.upsert({
    where: { noticeId_userId: { noticeId: id, userId: user.id } },
    create: { noticeId: id, userId: user.id, version: notice.version },
    update: { version: notice.version, ackedAt: new Date() },
  });
  refresh(id);
}

export async function togglePinned(id: string) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const notice = await db.notice.findUniqueOrThrow({ where: { id } });
  if (!canEditNotice(user, notice)) throw new Error("Not allowed");
  await db.notice.update({ where: { id }, data: { pinned: !notice.pinned } });
  refresh(id);
}

/** Archived notices leave Home and the board, and stop asking for acknowledgement. History is kept. */
export async function toggleArchived(id: string) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const notice = await db.notice.findUniqueOrThrow({ where: { id } });
  if (!canEditNotice(user, notice)) throw new Error("Not allowed");
  await db.notice.update({ where: { id }, data: { archivedAt: notice.archivedAt ? null : new Date() } });
  refresh(id);
}
