import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";

/*
 * Automatic backups for the office computer (Admin → Backups, docs/backups.md).
 *
 * Every uploaded file (documents, receipts, resumes, photos, signatures) is stored inside the
 * database, so one pg_dump file holds everything. Docker keeps the backups in a folder on the
 * computer itself (BACKUP_DIR, "backups" next to docker-compose.yml) and, when someone sets
 * BACKUP_COPY_FOLDER in .env, a second copy on another drive or a synced cloud folder.
 *
 * The backup folder, not the database, is the record of what exists: restoring an older backup
 * rewinds the database, but the folder and its status file stay as they were.
 *
 * No "server-only" import: the scheduler is started from src/instrumentation.ts.
 */

const IST_OFFSET = 5.5 * 3600 * 1000;
const NAME = /^edubotics-one-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(?:-(manual|before-restore))?(?:-\d{1,2})?\.dump$/;
const STATUS_FILE = ".status.json";

export type BackupKind = "scheduled" | "manual" | "before-restore";
export type BackupFile = { name: string; at: Date; kind: BackupKind; size: number; copied: boolean };
export type BackupRun = {
  at: string; // when it started (ISO)
  kind: BackupKind;
  ok: boolean;
  name?: string;
  size?: number;
  error?: string;
  copyError?: string; // the backup worked but could not be copied to the second folder
};

/** Where backups go inside the container, or null when the app runs without the Docker setup. */
export function backupDir() {
  return process.env.BACKUP_DIR?.trim() || null;
}
/** The second folder (another drive or a synced cloud folder), only when one was set in .env. */
export function copyDir() {
  return process.env.BACKUP_COPY_DIR?.trim() || null;
}
/** How the folders are named on the computer itself, for the Admin page. */
export function folderLabels() {
  return {
    main: process.env.BACKUP_FOLDER_SHOWN?.trim() || "the backups folder inside the Edubotics One folder",
    copy: process.env.BACKUP_COPY_FOLDER_SHOWN?.trim() || null,
  };
}

/** "2026-10-07-1700" in India time. */
function stamp(d: Date) {
  return new Date(d.getTime() + IST_OFFSET).toISOString().slice(0, 16).replace("T", "-").replace(":", "");
}

export function backupName(at: Date, kind: BackupKind) {
  return `edubotics-one-${stamp(at)}${kind === "scheduled" ? "" : `-${kind}`}.dump`;
}

function parseName(name: string) {
  const m = NAME.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, kind] = m;
  const at = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi) - IST_OFFSET);
  return { at, kind: (kind ?? "scheduled") as BackupKind };
}

/** True when a name is one of our backup files (and so safe to hand out or tidy away). */
export function isBackupName(name: string) {
  return parseName(name) !== null;
}

async function listDir(dir: string) {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/** The backups in the main folder, newest first, with whether the second folder holds a copy. */
export async function listBackups(): Promise<BackupFile[]> {
  const dir = backupDir();
  if (!dir) return [];
  const copy = copyDir();
  const copied = new Set(copy ? await listDir(copy) : []);
  const files: BackupFile[] = [];
  for (const name of await listDir(dir)) {
    const parsed = parseName(name);
    if (!parsed) continue;
    const stat = await fs.stat(path.join(/*turbopackIgnore: true*/ dir, name)).catch(() => null);
    if (!stat?.isFile()) continue;
    files.push({ name, ...parsed, size: stat.size, copied: copied.has(name) });
  }
  return files.sort((a, b) => b.at.getTime() - a.at.getTime() || b.name.localeCompare(a.name));
}

export async function lastRun(): Promise<BackupRun | null> {
  const dir = backupDir();
  if (!dir) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(/*turbopackIgnore: true*/ dir, STATUS_FILE), "utf8")) as BackupRun;
  } catch {
    return null;
  }
}

const QUEUE = ".queue";
const WAIT_FOR_HELPER = 10 * 60 * 1000;
const HELPER_SILENT_AFTER = 60 * 1000;

/** Whether the backup helper has checked in during the last minute. */
export async function helperRunning() {
  const dir = backupDir();
  if (!dir) return false;
  const stat = await fs.stat(path.join(/*turbopackIgnore: true*/ dir, QUEUE, ".alive")).catch(() => null);
  return !!stat && Date.now() - stat.mtimeMs < HELPER_SILENT_AFTER;
}

const HELPER_DOWN = "The backup helper isn't running. Open a command window in the Edubotics One folder and run: docker compose up -d";

/**
 * Asks the backup helper (docker/backup-worker.sh, the "backup" service in docker-compose.yml) to
 * dump the database to `name`, and waits for its answer. It runs the same PostgreSQL version as
 * the database, so the app itself needs no database tools.
 */
async function dumpVia(dir: string, name: string) {
  if (!(await helperRunning())) throw new Error(HELPER_DOWN);
  const queue = path.join(/*turbopackIgnore: true*/ dir, QUEUE);
  const result = path.join(/*turbopackIgnore: true*/ queue, `${name}.result`);
  await fs.mkdir(queue, { recursive: true });
  await fs.rm(result, { force: true });
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ queue, name), "");
  const until = Date.now() + WAIT_FOR_HELPER;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000));
    const answer = await fs.readFile(result, "utf8").catch(() => null);
    if (answer === null) continue;
    await fs.rm(result, { force: true });
    if (answer.trim() === "ok") return;
    throw new Error(answer.trim() || "The backup helper could not save the file.");
  }
  await fs.rm(path.join(/*turbopackIgnore: true*/ queue, name), { force: true });
  throw new Error(`The backup helper didn't finish in 10 minutes. ${(await helperRunning()) ? "Try again later." : HELPER_DOWN}`);
}

let running: Promise<BackupRun> | null = null;

/**
 * Makes one backup: the helper dumps the database and checks the file opens; then it is copied to
 * the second folder and old backups are tidied away. Only one runs at a time; a second call waits for the first.
 */
export function runBackup(kind: BackupKind): Promise<BackupRun> {
  if (!running) running = doBackup(kind).finally(() => (running = null));
  return running;
}

async function doBackup(kind: BackupKind): Promise<BackupRun> {
  const dir = backupDir();
  const started = new Date();
  if (!dir) return { at: started.toISOString(), kind, ok: false, error: "Backups only run in the office Docker setup." };
  let name = backupName(started, kind);
  // Two backups in the same minute (a manual one right after the daily one): keep both.
  if (await fs.stat(path.join(/*turbopackIgnore: true*/ dir, name)).catch(() => null)) name = name.replace(/\.dump$/, `-${started.getSeconds()}.dump`);
  const result: BackupRun = { at: started.toISOString(), kind, ok: false, name };
  try {
    await dumpVia(dir, name);
    result.size = (await fs.stat(path.join(/*turbopackIgnore: true*/ dir, name))).size;
    result.ok = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    delete result.name;
  }
  if (result.ok && result.name) {
    const copy = copyDir();
    if (copy) {
      try {
        await fs.copyFile(path.join(/*turbopackIgnore: true*/ dir, result.name), path.join(/*turbopackIgnore: true*/ copy, `.${result.name}.part`));
        await fs.rename(path.join(/*turbopackIgnore: true*/ copy, `.${result.name}.part`), path.join(/*turbopackIgnore: true*/ copy, result.name));
      } catch (e) {
        await fs.rm(path.join(/*turbopackIgnore: true*/ copy, `.${result.name}.part`), { force: true }).catch(() => {});
        result.copyError = e instanceof Error ? e.message : String(e);
      }
    }
    await prune().catch((e) => console.error("Could not tidy old backups", e));
  }
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ dir, STATUS_FILE), JSON.stringify(result, null, 2)).catch(() => {});
  if (!result.ok) console.error(`Backup failed: ${result.error}`);
  return result;
}

/**
 * Which backups to keep: everything from the last `keepDays` days, then the first backup of each
 * month for `keepMonths` months. The newest backup is always kept, however old.
 */
export function backupsToDelete(names: string[], now: Date, keepDays: number, keepMonths: number) {
  const files = names
    .map((name) => ({ name, parsed: parseName(name) }))
    .filter((f): f is { name: string; parsed: { at: Date; kind: BackupKind } } => f.parsed !== null)
    .sort((a, b) => a.parsed.at.getTime() - b.parsed.at.getTime() || a.name.localeCompare(b.name));
  if (files.length === 0) return [];
  const newest = files[files.length - 1].name;
  const dayCutoff = now.getTime() - keepDays * 24 * 3600 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET);
  const monthCutoff = ist.getUTCFullYear() * 12 + ist.getUTCMonth() - keepMonths;
  const firstOfMonth = new Set<string>();
  const seenMonths = new Set<number>();
  for (const f of files) {
    const d = new Date(f.parsed.at.getTime() + IST_OFFSET);
    const month = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (!seenMonths.has(month)) {
      seenMonths.add(month);
      if (month > monthCutoff) firstOfMonth.add(f.name);
    }
  }
  return files
    .filter((f) => f.name !== newest && f.parsed.at.getTime() < dayCutoff && !firstOfMonth.has(f.name))
    .map((f) => f.name);
}

async function prune() {
  const s = await db.companySettings.findUnique({ where: { id: 1 }, select: { backupKeepDays: true, backupKeepMonths: true } });
  const keepDays = s?.backupKeepDays ?? 30;
  const keepMonths = s?.backupKeepMonths ?? 12;
  for (const dir of [backupDir(), copyDir()]) {
    if (!dir) continue;
    for (const name of backupsToDelete(await listDir(dir), new Date(), keepDays, keepMonths)) {
      await fs.rm(path.join(/*turbopackIgnore: true*/ dir, name), { force: true });
    }
  }
}

/** The last daily backup time that has passed (India time), e.g. yesterday 5 PM when it's now 10 AM. */
export function lastScheduledTime(now: Date, hour: number) {
  const ist = new Date(now.getTime() + IST_OFFSET);
  let t = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hour) - IST_OFFSET;
  if (t > now.getTime()) t -= 24 * 3600 * 1000;
  return new Date(t);
}

export function nextScheduledTime(now: Date, hour: number) {
  return new Date(lastScheduledTime(now, hour).getTime() + 24 * 3600 * 1000);
}

/** Whether the daily backup is due: none has been made since the last scheduled time. */
export function backupDue(now: Date, hour: number, newest: Date | null) {
  return !newest || newest.getTime() < lastScheduledTime(now, hour).getTime();
}

const RETRY_AFTER_FAILURE = 60 * 60 * 1000;
let lastFailure = 0;

async function tick() {
  if (!backupDir()) return;
  const s = await db.companySettings.findUnique({ where: { id: 1 }, select: { backupsEnabled: true, backupHour: true } });
  if (s && !s.backupsEnabled) return;
  // Count manual backups too, not the safety copy taken just before a restore.
  const newest = (await listBackups()).find((b) => b.kind !== "before-restore");
  if (!backupDue(new Date(), s?.backupHour ?? 17, newest?.at ?? null)) return;
  if (Date.now() - lastFailure < RETRY_AFTER_FAILURE) return;
  const result = await runBackup("scheduled");
  lastFailure = result.ok ? 0 : Date.now();
  if (!result.ok) {
    await db.activityLog
      .create({ data: { area: "BACKUPS", action: "backup.failed", summary: `Daily backup failed: ${result.error ?? ""}`.slice(0, 500) } })
      .catch(() => {});
  }
}

/** Checks every five minutes whether the daily backup is due. Started once, from src/instrumentation.ts. */
export function startBackupScheduler() {
  if (!backupDir()) return;
  const g = globalThis as unknown as { backupScheduler?: NodeJS.Timeout };
  if (g.backupScheduler) return;
  const safeTick = () => tick().catch((e) => console.error("Backup check failed", e));
  // Give the app a minute to settle after starting, then check every five minutes.
  setTimeout(safeTick, 60 * 1000).unref();
  g.backupScheduler = setInterval(safeTick, 5 * 60 * 1000);
  g.backupScheduler.unref();
}

const STALE_AFTER = 2 * 24 * 3600 * 1000;

/** What an admin should know about backups right now, or null when all is well (or there's no Docker setup). */
export async function backupProblem(): Promise<{ level: "red" | "amber"; text: string } | null> {
  if (!backupDir()) return null;
  const s = await db.companySettings.findUnique({ where: { id: 1 }, select: { backupsEnabled: true } });
  const [run, files] = await Promise.all([lastRun(), listBackups()]);
  const newest = files[0];
  if (!(await helperRunning())) return { level: "red", text: "The backup helper isn't running, so no backups are being made." };
  if (run && !run.ok) return { level: "red", text: "The last backup failed." };
  if (s && !s.backupsEnabled) return { level: "amber", text: "Daily backups are switched off." };
  if (!newest) return { level: "amber", text: "There is no backup yet." };
  if (Date.now() - newest.at.getTime() > STALE_AFTER) return { level: "amber", text: "The newest backup is more than 2 days old." };
  if (run?.copyError) return { level: "amber", text: "The last backup could not be copied to the second folder." };
  return null;
}
