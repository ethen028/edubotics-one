"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import type { FormState } from "@/components/action-form";
import { flash } from "@/lib/flash";
import { readFiles } from "@/lib/project-files";
import { loadFolder, loadSharedFile } from "@/lib/shared-files";
import { requireTeamwork, storageProblem, teammatesAmong } from "@/lib/teamwork";
import { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME, canDeleteFile, canManageFolder } from "@/lib/teamwork-rules";

const folderPath = (id?: string | null) => (id ? `/files/${id}` : "/files");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the folder a name.")
  .max(MAX_FOLDER_NAME, `Keep the name under ${MAX_FOLDER_NAME} characters.`)
  .refine((v) => !/[\\/]/.test(v), "Folder names can't contain / or \\.");

async function openFolder(user: { id: string; role: string }, id: string) {
  const folder = await loadFolder(user, id);
  if (!folder) throw new Error("Folder not found");
  return folder;
}

/** A new folder. At the top, its maker picks who can open it; inside another folder it follows that folder. */
export async function createFolder(parentId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const name = nameSchema.safeParse(formData.get("name") ?? "");
  if (!name.success) return { error: name.error.issues[0].message };
  const parent = parentId ? await openFolder(user, parentId) : null;
  if (parent && parent.depth >= MAX_FOLDER_DEPTH) return { error: `Folders go ${MAX_FOLDER_DEPTH} levels deep at most. Put this one higher up.` };
  const clash = await db.fileFolder.findFirst({ where: { parentId, name: { equals: name.data, mode: "insensitive" } }, select: { id: true } });
  if (clash) return { error: "There is already a folder with that name here." };
  const restricted = !parent && formData.get("access") === "PEOPLE";
  const people = restricted ? await teammatesAmong(formData.getAll("members").map(String), user.id) : [];
  const folder = await db.fileFolder.create({
    data: {
      name: name.data,
      parentId,
      topId: parent ? parent.top.id : null,
      access: restricted ? "PEOPLE" : "EVERYONE",
      createdById: user.id,
      members: { create: people.map((p) => ({ userId: p.id })) },
    },
  });
  revalidatePath(folderPath(parentId));
  await flash("Folder created.");
  redirect(folderPath(folder.id));
}

/** Upload up to 5 files (10 MB each) into a folder, or to the top of Files where all staff can see them. */
export async function uploadFiles(folderId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  if (folderId) await openFolder(user, folderId);
  const read = await readFiles(formData);
  if ("error" in read) return { error: read.error };
  if (read.files.length === 0) return { error: "Pick a file to upload." };
  const full = await storageProblem(read.files.reduce((sum, f) => sum + f.size, 0));
  if (full) return { error: full };
  await db.sharedFile.createMany({ data: read.files.map((f) => ({ ...f, folderId, uploadedById: user.id })) });
  revalidatePath(folderPath(folderId));
  return { ok: read.files.length === 1 ? "File uploaded." : `${read.files.length} files uploaded.` };
}

export async function deleteSharedFile(fileId: string) {
  const user = await requireTeamwork();
  const found = await loadSharedFile(user, fileId);
  if (!found) throw new Error("File not found");
  if (!canDeleteFile(found.file, found.top, user)) throw new Error("Only the person who uploaded it, the folder's owner or an admin can delete this file");
  await db.sharedFile.delete({ where: { id: fileId } });
  revalidatePath(folderPath(found.file.folderId));
  await flash("File deleted.");
}

export async function renameFolder(folderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const folder = await openFolder(user, folderId);
  if (!canManageFolder(folder, user)) return { error: "Only the person who made this folder or an admin can rename it." };
  const name = nameSchema.safeParse(formData.get("name") ?? "");
  if (!name.success) return { error: name.error.issues[0].message };
  const clash = await db.fileFolder.findFirst({
    where: { parentId: folder.parentId, id: { not: folderId }, name: { equals: name.data, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) return { error: "There is already a folder with that name here." };
  await db.fileFolder.update({ where: { id: folderId }, data: { name: name.data } });
  revalidatePath(folderPath(folderId));
  return { ok: "Folder renamed." };
}

/** Who can open a top-level folder (and everything in it): all staff, or the people picked. */
export async function setFolderAccess(folderId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const folder = await openFolder(user, folderId);
  if (folder.topId) return { error: "Who can open a folder is set on the top-level folder it sits in." };
  if (!canManageFolder(folder, user)) return { error: "Only the person who made this folder or an admin can change who opens it." };
  const restricted = formData.get("access") === "PEOPLE";
  const people = restricted ? await teammatesAmong(formData.getAll("members").map(String), folder.createdById) : [];
  await db.$transaction([
    db.fileFolderMember.deleteMany({ where: { folderId } }),
    db.fileFolder.update({
      where: { id: folderId },
      data: { access: restricted ? "PEOPLE" : "EVERYONE", members: { create: people.map((p) => ({ userId: p.id })) } },
    }),
  ]);
  revalidatePath(folderPath(folderId));
  return { ok: restricted ? `Only ${people.length ? `${people.length + 1} people` : "you"} and admins can open it now.` : "All staff can open it now." };
}

/** Deletes a folder with everything in it. */
export async function deleteFolder(folderId: string) {
  const user = await requireTeamwork();
  const folder = await openFolder(user, folderId);
  if (!canManageFolder(folder, user)) throw new Error("Only the person who made this folder or an admin can delete it");
  await db.fileFolder.delete({ where: { id: folderId } });
  revalidatePath(folderPath(folder.parentId));
  await flash("Folder deleted.");
  redirect(folderPath(folder.parentId));
}
