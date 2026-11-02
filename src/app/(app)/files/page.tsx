import Link from "next/link";
import { db } from "@/lib/db";
import { requireTeamwork, storageUse, teammateWhere } from "@/lib/teamwork";
import { openTopFolders, searchSharedFiles } from "@/lib/shared-files";
import { formatSize } from "@/lib/project-files";
import { shortWhen } from "@/lib/messages";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { FolderContents } from "./view";

export const metadata = { title: "Files" };

/** The top of Files: the folders this person can open, loose files everyone can see, and file search. */
export default async function FilesPage({ searchParams }: PageProps<"/files">) {
  const user = await requireTeamwork();
  const q = (((await searchParams) as Record<string, string | undefined>).q ?? "").trim().slice(0, 100);
  const [folders, files, found, storage, people] = await Promise.all([
    db.fileFolder.findMany({
      where: openTopFolders(user),
      orderBy: { name: "asc" },
      select: { id: true, name: true, access: true, _count: { select: { files: true, children: true } } },
    }),
    db.sharedFile.findMany({ where: { folderId: null }, orderBy: { createdAt: "desc" }, omit: { data: true }, include: { uploadedBy: { select: { name: true } } } }),
    searchSharedFiles(user, q),
    storageUse(),
    db.user.findMany({ where: { ...(await teammateWhere()), id: { not: user.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pct = Math.min(100, Math.round((storage.used / storage.limit) * 100));

  return (
    <>
      <PageHeader title="Files" subtitle="Shared company folders. Files sent in chats are under each conversation's Files tab." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action="/files" role="search" className="relative min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="file-search" className="sr-only">
            Search files
          </label>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="file-search" name="q" defaultValue={q} placeholder="Search file names" className="input rounded-full pl-9" />
        </form>
        <div className="text-xs text-slate-500" title="Files plus chat attachments">
          <span className="mr-2">
            {formatSize(storage.used)} of {formatSize(storage.limit)} used
          </span>
          <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 align-middle">
            <span className="block h-full bg-brand-600" style={{ width: `${pct}%` }} />
          </span>
        </div>
      </div>
      {q ? (
        <section className="card">
          <h2 className="font-semibold">
            {found.length === 50 ? "Latest 50 files" : `${found.length} file${found.length === 1 ? "" : "s"}`} with &ldquo;{q}&rdquo;
          </h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {found.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <Icon name="file" className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <a href={`/api/shared-files/${f.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-900 hover:underline">
                    {f.fileName}
                  </a>
                  <span className="block text-xs text-slate-500">
                    {formatSize(f.size)} · {f.uploadedBy.name} · {shortWhen(f.createdAt)}
                  </span>
                </span>
                <Link href={f.folder ? `/files/${f.folder.id}` : "/files"} className="shrink-0 text-xs text-brand-700 hover:underline">
                  {f.folder ? f.folder.name : "Files"}
                </Link>
              </li>
            ))}
          </ul>
          {found.length === 0 && <p className="mt-2 text-sm text-slate-500">No file names with &ldquo;{q}&rdquo; in the folders you can open.</p>}
        </section>
      ) : (
        <FolderContents user={user} folderId={null} top={null} folders={folders} files={files} canAddFolder people={people} />
      )}
    </>
  );
}
