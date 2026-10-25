import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { canOpenFolder } from "./teamwork-rules";

// Files: company folders in Teamwork. The top-level folder decides who can open everything inside it (all staff, or
// the people picked plus its maker and admins). The bytes live in the database, so the daily backup includes them.

type Viewer = { id: string; role: string };

/** Top-level folders this person can open. */
export const openTopFolders = (user: Viewer): Prisma.FileFolderWhereInput =>
  user.role === "ADMIN" ? { topId: null } : { topId: null, OR: [{ access: "EVERYONE" }, { createdById: user.id }, { members: { some: { userId: user.id } } }] };

const topSelect = { id: true, name: true, access: true, createdById: true, members: { select: { userId: true } } } as const;

/** A folder with its path from the top, only if this person can open it; otherwise null. */
export async function loadFolder(user: Viewer, id: string) {
  const folder = await db.fileFolder.findUnique({
    where: { id },
    include: { top: { select: topSelect }, members: { select: { userId: true } }, createdBy: { select: { name: true } } },
  });
  if (!folder) return null;
  const top = folder.top ?? { id: folder.id, name: folder.name, access: folder.access, createdById: folder.createdById, members: folder.members };
  if (!canOpenFolder({ access: top.access, createdById: top.createdById, memberIds: top.members.map((m) => m.userId) }, user)) return null;
  // The way back up, for the breadcrumb (folders are at most a few levels deep).
  const path: { id: string; name: string }[] = [];
  let parentId = folder.parentId;
  while (parentId && path.length < 10) {
    const p = await db.fileFolder.findUnique({ where: { id: parentId }, select: { id: true, name: true, parentId: true } });
    if (!p) break;
    path.unshift({ id: p.id, name: p.name });
    parentId = p.parentId;
  }
  return { ...folder, top, path, depth: path.length + 1 };
}

/** A shared file (without its bytes) and whether this person can open it. */
export async function loadSharedFile(user: Viewer, id: string) {
  const file = await db.sharedFile.findUnique({ where: { id }, omit: { data: true } });
  if (!file) return null;
  if (!file.folderId) return { file, top: null };
  const folder = await loadFolder(user, file.folderId);
  return folder ? { file, top: folder.top } : null;
}

/** Files whose name contains the words, in folders this person can open. */
export async function searchSharedFiles(user: Viewer, q: string) {
  const needle = q.trim().slice(0, 100);
  if (needle.length < 2) return [];
  const tops = await db.fileFolder.findMany({ where: openTopFolders(user), select: { id: true } });
  const topIds = tops.map((t) => t.id);
  return db.sharedFile.findMany({
    where: {
      fileName: { contains: needle, mode: "insensitive" },
      OR: [{ folderId: null }, { folderId: { in: topIds } }, { folder: { topId: { in: topIds } } }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    omit: { data: true },
    include: { folder: { select: { id: true, name: true } }, uploadedBy: { select: { name: true } } },
  });
}
