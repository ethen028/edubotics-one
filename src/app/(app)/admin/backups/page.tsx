import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { formatSize } from "@/lib/project-files";
import { backupDir, backupProblem, copyDir, folderLabels, lastRun, listBackups, nextScheduledTime, type BackupKind } from "@/lib/backups";
import { backUpNow, updateBackupSettings } from "./actions";

export const metadata = { title: "Backups" };

const kindLabel: Record<BackupKind, string> = { scheduled: "Daily", manual: "Back up now", "before-restore": "Before a restore" };

function hourLabel(h: number) {
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
}

export default async function BackupsPage() {
  await requireUser(["ADMIN"]);
  const s = await getSettings();
  const dir = backupDir();
  const copy = copyDir();
  const folders = folderLabels();
  const [files, run, problem] = await Promise.all([listBackups(), lastRun(), backupProblem()]);
  const newest = files[0];
  const total = files.reduce((n, f) => n + f.size, 0);
  const restoreName = files.find((f) => f.kind !== "before-restore")?.name ?? "edubotics-one-2026-10-07-1700.dump";

  return (
    <>
      <PageHeader
        title="Backups"
        subtitle="A full copy of Edubotics One every day: all records and every uploaded file (documents, receipts, resumes, photos). Only admins see this."
      />

      {!dir ? (
        <div className="card max-w-2xl text-sm text-slate-600">
          Backups run on the office computer, in the Docker setup. This copy of the app isn&apos;t running there, so nothing is backed up from here.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <section className="card space-y-4">
              {run && !run.ok ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <div className="font-medium">The last backup failed ({formatDateTime(new Date(run.at))}).</div>
                  <div className="mt-1 font-mono text-xs break-words">{run.error}</div>
                  {!run.error?.includes("helper") && (
                    <div className="mt-1">Try Back up now. If it fails again, check the computer has free disk space and Docker Desktop is running.</div>
                  )}
                </div>
              ) : problem ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    problem.level === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  {problem.text}
                  {problem.level === "red" && " Open a command window in the Edubotics One folder and run: docker compose up -d"}
                </div>
              ) : null}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="label">Newest backup</div>
                  {newest ? (
                    <div className="mt-1">
                      <div className="text-lg font-semibold text-slate-900">{formatDateTime(newest.at)}</div>
                      <div className="text-sm text-slate-500">
                        {formatSize(newest.size)} · checked, opens correctly
                        {copy && (newest.copied ? " · copied to the second folder" : " · not in the second folder")}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-slate-500">None yet.</div>
                  )}
                </div>
                <ActionForm action={backUpNow}>
                  <SubmitButton pendingLabel="Backing up…">Back up now</SubmitButton>
                </ActionForm>
              </div>
              <dl className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="label">Next daily backup</dt>
                  <dd>{s.backupsEnabled ? formatDateTime(nextScheduledTime(new Date(), s.backupHour)) : "Switched off"}</dd>
                </div>
                <div>
                  <dt className="label">Backups kept</dt>
                  <dd>
                    {files.length} · {formatSize(total)}
                  </dd>
                </div>
                <div>
                  <dt className="label">Saved on this computer in</dt>
                  <dd className="break-words">{folders.main}</dd>
                </div>
                <div>
                  <dt className="label">Second copy</dt>
                  <dd className="break-words">
                    {copy ? (
                      <>
                        {folders.copy ?? "the second folder set in .env"}
                        {run?.copyError && <div className="mt-1 text-xs text-red-700">Last copy failed: {run.copyError}</div>}
                      </>
                    ) : (
                      <span className="text-slate-500">Not set up. See &ldquo;Keep a copy off this computer&rdquo;.</span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="card">
              <h2 className="mb-3 font-semibold">Backups on this computer</h2>
              {files.length === 0 ? (
                <Empty>No backups yet. The first one is made within a few minutes of starting, or press Back up now.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                        <th className="py-2 pr-3 font-medium">Made</th>
                        <th className="py-2 pr-3 font-medium">How</th>
                        <th className="py-2 pr-3 font-medium">Size</th>
                        {copy && <th className="py-2 pr-3 font-medium">Second copy</th>}
                        <th className="py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((f) => (
                        <tr key={f.name} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(f.at)}</td>
                          <td className="py-2 pr-3">
                            <Badge color={f.kind === "scheduled" ? "gray" : f.kind === "manual" ? "blue" : "amber"}>{kindLabel[f.kind]}</Badge>
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">{formatSize(f.size)}</td>
                          {copy && <td className="py-2 pr-3">{f.copied ? <Badge color="green">Copied</Badge> : <span className="text-slate-400">—</span>}</td>}
                          <td className="py-2 text-right">
                            <a href={`/admin/backups/download/${f.name}`} className="link whitespace-nowrap">
                              Download
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Kept: every backup from the last {s.backupKeepDays} days, then the first backup of each month for {s.backupKeepMonths} months. Older ones are removed
                after each new backup. Downloads are recorded in the activity log.
              </p>
            </section>

            <section className="card space-y-3 text-sm">
              <h2 className="font-semibold">Bring back a backup</h2>
              <p className="text-slate-600">
                This puts every record back the way it was when the backup was made; anything entered after that is lost. Just before it restores, it saves one
                more backup of how things are now, so the restore itself can be undone. Run these on the office computer, in a command window in the Edubotics
                One folder:
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Stop the app: <code className="rounded bg-slate-100 px-1.5 py-0.5">docker compose stop app</code>
                </li>
                <li>
                  Restore (change the name to the backup you want):
                  <pre className="mt-1 overflow-x-auto rounded bg-slate-900 px-3 py-2 text-xs text-slate-100">
                    docker compose run --rm backup restore {restoreName}
                  </pre>
                  It asks you to type <b>yes</b> before it changes anything.
                </li>
                <li>
                  Start the app again: <code className="rounded bg-slate-100 px-1.5 py-0.5">docker compose start app</code>
                </li>
              </ol>
              <p className="text-slate-600">Everyone signs in again afterwards. The full guide is docs/backups.md in the Edubotics One folder.</p>
            </section>
          </div>

          <div className="min-w-0 space-y-6">
            <section className="card">
              <h2 className="mb-3 font-semibold">Daily backup</h2>
              <ActionForm action={updateBackupSettings} className="space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="backupsEnabled" defaultChecked={s.backupsEnabled} />
                  Back up every day
                </label>
                <Field label="At (India time)">
                  <select name="backupHour" defaultValue={s.backupHour} className="input w-auto">
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Pick a time the computer is on. If it was off, the backup runs as soon as it is back on.</p>
                </Field>
                <Field label="Keep every backup for (days)">
                  <input name="backupKeepDays" type="number" min={3} max={365} defaultValue={s.backupKeepDays} className="input w-24" />
                </Field>
                <Field label="Then keep one a month for (months)">
                  <input name="backupKeepMonths" type="number" min={0} max={120} defaultValue={s.backupKeepMonths} className="input w-24" />
                </Field>
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            </section>

            <section className="card space-y-2 text-sm text-slate-600">
              <h2 className="font-semibold text-slate-900">Keep a copy off this computer</h2>
              <p>A backup on the same computer won&apos;t help if that computer is lost or its disk fails. Two ways to keep another copy:</p>
              <p>
                <b>Automatically:</b> name a second folder in the <code>.env</code> file (for example a Google Drive or OneDrive folder that syncs, or a drive
                that stays plugged in). Every backup is copied there too. Steps in docs/backups.md.
              </p>
              <p>
                <b>By hand:</b> press Download on a backup and save it to a USB drive or another laptop, say once a week.
              </p>
              <p className="text-xs text-slate-500">
                Backups hold everyone&apos;s salaries, documents and phone numbers. Keep the copies somewhere only you can open. Nothing is sent to any
                online service unless you set that up.
              </p>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
