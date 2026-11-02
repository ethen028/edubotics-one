import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTeamwork, teammateWhere } from "@/lib/teamwork";
import { loadFolder } from "@/lib/shared-files";
import { MAX_FOLDER_DEPTH, canManageFolder } from "@/lib/teamwork-rules";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { Badge, PageHeader } from "@/components/ui";
import { deleteFolder, renameFolder, setFolderAccess } from "../actions";
import { AccessFields, FolderContents } from "../view";

export const metadata = { title: "Files" };

/** One folder: what is in it, and for its maker or an admin, who can open it, rename and delete. */
export default async function FolderPage({ params }: PageProps<"/files/[id]">) {
  const user = await requireTeamwork();
  const { id } = await params;
  const folder = await loadFolder(user, id);
  if (!folder) notFound();
  const manage = canManageFolder(folder, user);
  const [folders, files, people] = await Promise.all([
    db.fileFolder.findMany({
      where: { parentId: id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, access: true, _count: { select: { files: true, children: true } } },
    }),
    db.sharedFile.findMany({ where: { folderId: id }, orderBy: { createdAt: "desc" }, omit: { data: true }, include: { uploadedBy: { select: { name: true } } } }),
    manage && !folder.topId
      ? db.user.findMany({ where: { ...(await teammateWhere()), id: { not: folder.createdById } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [],
  ]);
  const restricted = folder.top.access === "PEOPLE";

  return (
    <>
      <nav aria-label="Folders" className="mb-1 flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link href="/files" className="hover:text-slate-900 hover:underline">
          Files
        </Link>
        {folder.path.map((p) => (
          <span key={p.id} className="flex items-center gap-1">
            <span aria-hidden="true">/</span>
            <Link href={`/files/${p.id}`} className="hover:text-slate-900 hover:underline">
              {p.name}
            </Link>
          </span>
        ))}
      </nav>
      <PageHeader
        title={folder.name}
        subtitle={
          restricted
            ? `Only ${folder.top.members.length + 1} people and admins can open this${folder.topId ? `, as set on "${folder.top.name}"` : ""}.`
            : "All staff can open this folder."
        }
        actions={restricted ? <Badge color="purple">Chosen people</Badge> : undefined}
      />
      <FolderContents
        user={user}
        folderId={id}
        top={{ createdById: folder.top.createdById }}
        folders={folders}
        files={files}
        canAddFolder={folder.depth < MAX_FOLDER_DEPTH}
      />
      {manage && (
        <details className="card mt-4">
          <summary className="cursor-pointer font-semibold">Folder settings</summary>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <ActionForm action={renameFolder.bind(null, id)}>
                <label className="label" htmlFor="folder-name">
                  Name
                </label>
                <div className="flex gap-2">
                  <input id="folder-name" name="name" defaultValue={folder.name} maxLength={80} className="input" />
                  <SubmitButton className="btn-secondary">Rename</SubmitButton>
                </div>
              </ActionForm>
              <form action={deleteFolder.bind(null, id)}>
                <ConfirmButton className="btn-danger btn-sm" message={`Delete "${folder.name}" and everything in it? This can't be undone.`}>
                  Delete folder
                </ConfirmButton>
              </form>
            </div>
            {!folder.topId && (
              <ActionForm action={setFolderAccess.bind(null, id)} className="space-y-3">
                <AccessFields people={people} access={folder.access} memberIds={folder.members.map((m) => m.userId)} />
                <SubmitButton className="btn-secondary">Save who can open it</SubmitButton>
              </ActionForm>
            )}
          </div>
        </details>
      )}
    </>
  );
}
