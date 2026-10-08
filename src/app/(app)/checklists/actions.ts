"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { MAX_DOCUMENT_BYTES, sniffMime } from "@/lib/hr-constants";
import { todayIST } from "@/lib/time";
import { canCreateChecklists, canEditTemplate, checklistEntries } from "@/lib/checklists";
import type { FormState } from "@/components/action-form";

function refresh(templateId?: string, key?: string) {
  revalidatePath("/checklists");
  if (templateId && key) revalidatePath(`/checklists/run/${templateId}/${key}`);
  revalidatePath("/", "layout"); // menu badge and Home cards
}

/**
 * The user's own slot for this checklist and period, if it's meant for them and still open for ticking.
 * `key` is the due date ("2026-10-07") or "session-<id>".
 */
async function openSlot(user: CurrentUser, templateId: string, key: string) {
  let date: Date;
  if (key.startsWith("session-")) {
    const session = await db.programmeSession.findUnique({ where: { id: key.slice(8) }, select: { date: true } });
    if (!session) return { error: "That school session no longer exists." };
    date = session.date;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    date = new Date(`${key}T00:00:00.000Z`);
  } else {
    return { error: "Checklist not found." };
  }
  const [entry] = (await checklistEntries({ userIds: [user.id], from: date, to: date, templateId })).filter(
    (e) => e.slot.periodKey === key,
  );
  if (!entry) return { error: "This checklist isn't on your list for that day." };
  if (entry.status === "MISSED") return { error: "This checklist has closed. Talk to your manager if it was done." };
  if (entry.status === "UPCOMING") return { error: "This checklist isn't open yet." };
  return { entry };
}

async function readPhoto(formData: FormData) {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { photo: null };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: "Photos can be up to 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (!mimeType || mimeType === "application/pdf") return { error: "Attach a photo (JPG, PNG or WebP)." };
  return { photo: { fileName: file.name.slice(0, 200) || "photo", mimeType, size: file.size, data: bytes } };
}

/** Saves the run's finish time once every current item is ticked, and clears it if one is unticked. */
async function syncCompletion(runId: string, templateId: string) {
  const [items, ticked] = await Promise.all([
    db.checklistItem.findMany({ where: { templateId, archivedAt: null }, select: { id: true } }),
    db.checklistTick.findMany({ where: { runId }, select: { itemId: true } }),
  ]);
  const have = new Set(ticked.map((t) => t.itemId));
  const complete = items.length > 0 && items.every((i) => have.has(i.id));
  const run = await db.checklistRun.findUniqueOrThrow({ where: { id: runId }, select: { completedAt: true } });
  if (complete && !run.completedAt) await db.checklistRun.update({ where: { id: runId }, data: { completedAt: new Date() } });
  if (!complete && run.completedAt) await db.checklistRun.update({ where: { id: runId }, data: { completedAt: null } });
}

/** Ticks one item, with an optional note and photo. Ticking again updates the note or photo. */
export async function tickItem(templateId: string, key: string, itemId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const found = await openSlot(user, templateId, key);
  if (found.error || !found.entry) return { error: found.error };
  const item = await db.checklistItem.findFirst({ where: { id: itemId, templateId, archivedAt: null } });
  if (!item) return { error: "That item was removed from the checklist. Reload the page." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  const upload = await readPhoto(formData);
  if (upload.error) return { error: upload.error };

  const { slot } = found.entry;
  const run = await db.checklistRun.upsert({
    where: { templateId_userId_periodKey: { templateId, userId: user.id, periodKey: key } },
    update: {},
    create: { templateId, userId: user.id, periodKey: key, dueDate: slot.dueDate, sessionId: slot.sessionId },
  });
  const existing = await db.checklistTick.findUnique({
    where: { runId_itemId: { runId: run.id, itemId } },
    select: { id: true, photo: { select: { id: true } } },
  });
  if (item.needsPhoto && !upload.photo && !existing?.photo) return { error: `"${item.label}" needs a photo.` };

  if (existing) {
    await db.checklistTick.update({
      where: { id: existing.id },
      data: {
        ...(note ? { note } : {}),
        ...(upload.photo ? { photo: existing.photo ? { update: upload.photo } : { create: upload.photo } } : {}),
      },
    });
  } else {
    await db.checklistTick.create({
      data: {
        runId: run.id,
        itemId,
        note,
        tickedById: user.id,
        ...(upload.photo ? { photo: { create: upload.photo } } : {}),
      },
    });
  }
  await syncCompletion(run.id, templateId);
  refresh(templateId, key);
  return undefined;
}

/** Takes a tick back while the checklist is still open. */
export async function untickItem(templateId: string, key: string, itemId: string) {
  const user = await requireUser();
  const found = await openSlot(user, templateId, key);
  if (!found.entry?.run) return;
  await db.checklistTick.deleteMany({ where: { runId: found.entry.run.id, itemId } });
  await syncCompletion(found.entry.run.id, templateId);
  refresh(templateId, key);
}

// ---------- Checklist templates ----------

const itemsSchema = z
  .array(
    z.object({
      id: z.string().optional(),
      label: z.string().trim().min(1).max(200, "Keep each item under 200 characters"),
      needsPhoto: z.boolean(),
    }),
  )
  .min(1, "Add at least one item")
  .max(40, "A checklist can have up to 40 items");

const templateSchema = z
  .object({
    title: z.string().trim().min(3, "Give the checklist a name").max(120),
    description: z.string().trim().max(1000).optional(),
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "SESSION"]),
    weekday: z.coerce.number().int().min(0).max(6).optional(),
    dayOfMonth: z.coerce.number().int().min(0).max(28).optional(),
    dueTime: z
      .string()
      .regex(/^(\d{2}:\d{2})?$/, "Pick a time")
      .optional(),
    audience: z.enum(["EVERYONE", "ROLE", "PEOPLE"]).default("EVERYONE"),
    role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).optional(),
    people: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === "SESSION") return;
    if (v.audience === "ROLE" && !v.role) ctx.addIssue({ code: "custom", message: "Pick the role it's for" });
    if (v.audience === "PEOPLE" && v.people.length === 0) ctx.addIssue({ code: "custom", message: "Pick at least one person" });
  });

/** Creates or edits a checklist. Removed items that were ever ticked are kept out of sight so history still reads right. */
export async function saveTemplate(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!canCreateChecklists(user)) return { error: "Only admins and managers can set up checklists." };
  const existing = id ? await db.checklistTemplate.findUnique({ where: { id }, include: { items: true } }) : null;
  if (id && (!existing || !canEditTemplate(user, existing))) return { error: "You can only edit checklists you set up." };

  const parsed = templateSchema.safeParse({
    ...Object.fromEntries([...formData].filter(([k]) => k !== "people" && k !== "items")),
    people: formData.getAll("people").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Couldn't read the items. Reload and try again." };
  }
  const items = itemsSchema.safeParse(Array.isArray(rawItems) ? rawItems.filter((i) => i?.label?.trim()) : rawItems);
  if (!items.success) return { error: items.error.issues[0].message };

  const v = parsed.data;
  const session = v.frequency === "SESSION";
  const people = session || v.audience !== "PEOPLE" ? [] : v.people;
  if (people.length) {
    const ok = await db.user.count({ where: { id: { in: people }, active: true } });
    if (ok !== new Set(people).size) return { error: "Pick people from the list." };
  }
  const data = {
    title: v.title,
    description: v.description || null,
    frequency: v.frequency,
    weekday: v.frequency === "WEEKLY" ? (v.weekday ?? 1) : null,
    dayOfMonth: v.frequency === "MONTHLY" ? (v.dayOfMonth ?? 0) : null,
    dueTime: session ? null : v.dueTime || null,
    audience: session ? ("EVERYONE" as const) : v.audience,
    role: !session && v.audience === "ROLE" ? v.role! : null,
  };

  const templateId = await db.$transaction(async (tx) => {
    const t = existing
      ? await tx.checklistTemplate.update({ where: { id: existing.id }, data })
      : await tx.checklistTemplate.create({ data: { ...data, startsOn: todayIST(), createdById: user.id } });

    await tx.checklistAssignee.deleteMany({ where: { templateId: t.id, userId: { notIn: people } } });
    if (people.length) {
      await tx.checklistAssignee.createMany({ data: people.map((userId) => ({ templateId: t.id, userId })), skipDuplicates: true });
    }

    const keep = new Set(items.data.map((i) => i.id).filter(Boolean));
    const removed = (existing?.items ?? []).filter((i) => !i.archivedAt && !keep.has(i.id));
    if (removed.length) {
      const ticked = new Set(
        (await tx.checklistTick.findMany({ where: { itemId: { in: removed.map((i) => i.id) } }, select: { itemId: true }, distinct: ["itemId"] })).map(
          (r) => r.itemId,
        ),
      );
      await tx.checklistItem.deleteMany({ where: { id: { in: removed.filter((i) => !ticked.has(i.id)).map((i) => i.id) } } });
      await tx.checklistItem.updateMany({ where: { id: { in: [...ticked] } }, data: { archivedAt: new Date() } });
    }
    const mine = new Set((existing?.items ?? []).map((i) => i.id));
    for (const [position, item] of items.data.entries()) {
      if (item.id && mine.has(item.id)) {
        await tx.checklistItem.update({ where: { id: item.id }, data: { label: item.label, needsPhoto: item.needsPhoto, position, archivedAt: null } });
      } else {
        await tx.checklistItem.create({ data: { templateId: t.id, label: item.label, needsPhoto: item.needsPhoto, position } });
      }
    }
    return t.id;
  });

  refresh();
  revalidatePath("/checklists/templates");
  redirect(`/checklists/templates/${templateId}?saved=1`);
}

/** Switching a checklist off stops it being due from tomorrow; past history stays. Switching back on starts again today. */
export async function setTemplateActive(id: string, formData: FormData) {
  const user = await requireUser();
  const t = await db.checklistTemplate.findUniqueOrThrow({ where: { id } });
  if (!canEditTemplate(user, t)) throw new Error("Not allowed");
  const on = formData.get("on") === "1";
  const today = todayIST();
  await db.checklistTemplate.update({
    where: { id },
    data: on ? { endsOn: null, startsOn: t.endsOn && t.endsOn < today ? today : t.startsOn } : { endsOn: today },
  });
  refresh();
  revalidatePath("/checklists/templates");
  revalidatePath(`/checklists/templates/${id}`);
}
