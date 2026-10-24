import Link from "next/link";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { Badge, Empty } from "@/components/ui";
import { formatSize } from "@/lib/project-files";
import { shortWhen } from "@/lib/messages";
import { canDeleteFile } from "@/lib/teamwork-rules";
import { createFolder, deleteSharedFile, uploadFiles } from "./actions";

type Viewer = { id: string; role: string };
type FolderRow = { id: string; name: string; access: "EVERYONE" | "PEOPLE"; _count: { files: number; children: number } };
type FileRow = { id: string; fileName: string; size: number; createdAt: Date; uploadedById: string; uploadedBy: { name: string } };

/** The folders and files in one place in Files, with upload and new folder. Used for the top and for every folder. */
export function FolderContents({
  user,
  folderId,
  top,
  folders,
  files,
  canAddFolder,
  people,
}: {
  user: Viewer;
  folderId: string | null;
  top: { createdById: string } | null;
  folders: FolderRow[];
  files: FileRow[];
  canAddFolder: boolean;
  /** For a new top-level folder, the people it can be shared with. */
  people?: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section className="card p-0">
        {folders.length === 0 && files.length === 0 ? (
          <div className="p-4">
            <Empty>Nothing here yet. Upload a file or make a folder.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {folders.map((f) => (
              <li key={f.id}>
                <Link href={`/files/${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <Icon name="folder" className="h-5 w-5 shrink-0 text-brand-700" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{f.name}</span>
                  {f.access === "PEOPLE" && <Badge color="purple">Chosen people</Badge>}
                  <span className="shrink-0 text-xs text-slate-500">
                    {f._count.children + f._count.files === 0 ? "Empty" : `${f._count.children + f._count.files} item${f._count.children + f._count.files === 1 ? "" : "s"}`}
                  </span>
                </Link>
              </li>
            ))}
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <Icon name="file" className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <a href={`/api/shared-files/${f.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-900 hover:underline">
                    {f.fileName}
                  </a>
                  <span className="block text-xs text-slate-500">
                    {formatSize(f.size)} · {f.uploadedBy.name} · {shortWhen(f.createdAt)}
                  </span>
                </span>
                {canDeleteFile(f, top, user) && (
                  <form action={deleteSharedFile.bind(null, f.id)}>
                    <ConfirmButton className="text-xs text-slate-400 hover:text-red-600" message={`Delete "${f.fileName}" for everyone?`}>
                      Delete
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-4 self-start">
        <section className="card">
          <h2 className="font-semibold">Upload files</h2>
          <ActionForm action={uploadFiles.bind(null, folderId)} className="mt-3 space-y-3">
            <input type="file" name="files" multiple required className="block w-full text-sm" />
            <p className="text-xs text-slate-500">Up to 5 files at a time, 10 MB each.</p>
            <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
          </ActionForm>
        </section>
        {canAddFolder && (
          <section className="card">
            <h2 className="font-semibold">New folder</h2>
            <ActionForm action={createFolder.bind(null, folderId)} className="mt-3 space-y-3">
              <label className="block">
                <span className="label">Name</span>
                <input name="name" required maxLength={80} placeholder="e.g. Class plans" className="input" />
              </label>
              {people && <AccessFields people={people} access="EVERYONE" memberIds={[]} />}
              <SubmitButton pendingLabel="Creating…">Create folder</SubmitButton>
            </ActionForm>
          </section>
        )}
      </div>
    </div>
  );
}

/** "All staff" or "Only people I pick", with the people. */
export function AccessFields({ people, access, memberIds }: { people: { id: string; name: string }[]; access: "EVERYONE" | "PEOPLE"; memberIds: string[] }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="label">Who can open it</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="access" value="EVERYONE" defaultChecked={access === "EVERYONE"} /> All staff
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="access" value="PEOPLE" defaultChecked={access === "PEOPLE"} /> Only me and the people I pick
      </label>
      {people.length > 0 && (
        <div className="ml-6 max-h-44 space-y-1 overflow-y-auto border-l border-slate-200 pl-3">
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="members" value={p.id} defaultChecked={memberIds.includes(p.id)} /> {p.name}
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">Admins can open every folder, so nothing is lost when someone leaves.</p>
    </fieldset>
  );
}
