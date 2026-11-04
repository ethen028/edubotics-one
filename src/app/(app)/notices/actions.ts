"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { requireUser } from "@/lib/auth";
import { convexMessage, convexMutation, uploadToConvex } from "@/lib/convex";
import { MAX_DOCUMENT_BYTES, sniffMime } from "@/lib/hr-constants";
import { NOTICE_POSTERS } from "@/lib/notice-rules";
import type { FormState } from "@/components/action-form";
import { flash } from "@/lib/flash";

// The notice board is stored in Convex (convex/notices.ts), which checks the role and company again.

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`).getTime() : undefined));

const noticeSchema = z.object({
  kind: z.enum(["ANNOUNCEMENT", "POLICY"]),
  title: z.string().trim().min(3, "Enter a title").max(160),
  body: z.string().trim().min(1, "Write the notice"),
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  pinned: z.literal("on").optional().transform(Boolean),
  requiresAck: z.literal("on").optional().transform(Boolean),
  ackDueDate: optionalDate,
  showUntil: optionalDate,
});

const posters = [...NOTICE_POSTERS];

function refresh(id?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/notices");
  if (id) revalidatePath(`/notices/${id}`);
}

/** Reads the optional attachment and puts it in Convex storage. Returns an error message, nothing, or the file. */
async function readAttachment(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_DOCUMENT_BYTES) return "Files can be up to 5 MB.";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (!mimeType) return "Attach a PDF, JPG, PNG or WebP file.";
  const storageId = await uploadToConvex(api.notices.uploadUrl, { data: bytes, mimeType });
  return { storageId: storageId as Id<"_storage">, fileName: file.name.slice(0, 200) || "document", mimeType, size: file.size };
}

export async function createNotice(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(posters);
  const parsed = noticeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let id: string;
  try {
    const attachment = await readAttachment(formData);
    if (typeof attachment === "string") return { error: attachment };
    id = await convexMutation(api.notices.create, { ...parsed.data, attachment });
  } catch (error) {
    const message = convexMessage(error);
    if (!message) throw error;
    return { error: message };
  }
  refresh();
  await flash("Notice posted.");
  redirect(`/notices/${id}`);
}

export async function updateNotice(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(posters);
  const parsed = noticeSchema.omit({ kind: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const attachment = await readAttachment(formData);
    if (typeof attachment === "string") return { error: attachment };
    await convexMutation(api.notices.update, {
      id: id as Id<"notices">,
      ...parsed.data,
      askAgain: formData.get("askAgain") === "on",
      removeFile: formData.get("removeFile") === "on",
      attachment,
    });
  } catch (error) {
    const message = convexMessage(error);
    if (!message) throw error;
    return { error: message };
  }
  refresh(id);
  await flash("Notice updated.");
  redirect(`/notices/${id}`);
}

export async function acknowledgeNotice(id: string) {
  await requireUser();
  await convexMutation(api.notices.acknowledge, { id: id as Id<"notices"> });
  refresh(id);
}

export async function togglePinned(id: string) {
  await requireUser(posters);
  await convexMutation(api.notices.togglePinned, { id: id as Id<"notices"> });
  refresh(id);
}

/** Archived notices leave Home and the board, and stop asking for acknowledgement. History is kept. */
export async function toggleArchived(id: string) {
  await requireUser(posters);
  await convexMutation(api.notices.toggleArchived, { id: id as Id<"notices"> });
  refresh(id);
}
