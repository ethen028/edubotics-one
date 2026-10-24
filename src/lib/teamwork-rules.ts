/**
 * Teamwork (messages, channels, files, meetings), the rules part: no database, so it can be tested on its own.
 * Like a company Teams workspace, it can be limited to logins on the company's own email domain.
 */

/** "eduboticsglobal.com" from what an admin typed ("@EduboticsGlobal.com ", "eduboticsglobal.com"), or null if blank. */
export function cleanDomain(input: string | null | undefined): string | null {
  const d = (input ?? "").trim().toLowerCase().replace(/^@/, "");
  return d || null;
}

export const isDomain = (d: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);

/** Whether a login may use Teamwork: always when no domain is set, otherwise only an email on exactly that domain. */
export function emailInDomain(email: string, domain: string | null | undefined) {
  const d = cleanDomain(domain);
  if (!d) return true;
  const at = email.trim().toLowerCase().lastIndexOf("@");
  // Exactly the domain: a subdomain (mail.<domain>) or a look-alike (<domain>.evil.in) does not count.
  return at > 0 && email.trim().toLowerCase().slice(at + 1) === d;
}

// ─── Files ─────────────────────────────────────────────────────────────────

export const MAX_FOLDER_NAME = 80;
/** Folders inside folders, at most this deep (top-level folder = 1). */
export const MAX_FOLDER_DEPTH = 4;
/** All Teamwork files together (Files plus chat attachments), unless TEAMWORK_STORAGE_MB says otherwise. */
export const DEFAULT_STORAGE_MB = 2048;

export function storageLimitBytes(env: string | undefined = process.env.TEAMWORK_STORAGE_MB) {
  const mb = Number(env);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_STORAGE_MB) * 1024 * 1024;
}

type FolderTop = { access: "EVERYONE" | "PEOPLE"; createdById: string; memberIds: string[] };

/**
 * Who can open a folder, decided by its top-level folder: everyone when it is for all staff, otherwise the person who
 * made it, the people they picked, and admins (so a leaver's folder never gets stuck).
 */
export function canOpenFolder(top: FolderTop, user: { id: string; role: string }) {
  return top.access === "EVERYONE" || user.role === "ADMIN" || top.createdById === user.id || top.memberIds.includes(user.id);
}

/** Changing who can open a folder, renaming or deleting it: the person who made it, or an admin. */
export const canManageFolder = (folder: { createdById: string }, user: { id: string; role: string }) =>
  user.role === "ADMIN" || folder.createdById === user.id;

/** Deleting a file: whoever uploaded it, whoever manages its top folder, or an admin. */
export const canDeleteFile = (file: { uploadedById: string }, top: { createdById: string } | null, user: { id: string; role: string }) =>
  user.role === "ADMIN" || file.uploadedById === user.id || (!!top && top.createdById === user.id);

// ─── Meetings ──────────────────────────────────────────────────────────────

export const MEETING_LENGTHS = [15, 30, 45, 60, 90, 120, 180] as const;

/**
 * A call link people can tap: https only, and not an Orbit page or a script. Returns the tidied link, or an error
 * in plain words.
 */
export function checkJoinUrl(input: string | null | undefined): { url: string | null } | { error: string } {
  const raw = (input ?? "").trim();
  if (!raw) return { url: null };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { error: "That call link doesn't look right. Paste the full link from Google Meet, Zoom or Teams." };
  }
  if (u.protocol !== "https:") return { error: "Call links have to start with https://." };
  if (u.username || u.password) return { error: "Paste the call link without a username or password in it." };
  if (raw.length > 500) return { error: "That call link is too long." };
  return { url: u.toString() };
}

/** Which service a call link is for, to label the Join button ("Join on Zoom"). */
export function callService(url: string) {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "the call";
  }
  const is = (d: string) => host === d || host.endsWith(`.${d}`);
  if (is("meet.google.com")) return "Google Meet";
  if (is("zoom.us") || is("zoom.com")) return "Zoom";
  if (is("teams.microsoft.com") || is("teams.live.com")) return "Teams";
  if (is("meet.jit.si") || host.includes("jitsi")) return "Jitsi";
  if (is("webex.com")) return "Webex";
  return "the call";
}

/** Where a meeting stands at a moment: the Join button shows from 15 minutes before until it ends. */
export function meetingStatus(m: { startsAt: Date; minutes: number; cancelledAt: Date | null }, now = new Date()) {
  if (m.cancelledAt) return "cancelled" as const;
  const start = m.startsAt.getTime();
  const end = start + m.minutes * 60_000;
  if (now.getTime() >= end) return "ended" as const;
  if (now.getTime() >= start) return "live" as const;
  if (now.getTime() >= start - 15 * 60_000) return "soon" as const;
  return "upcoming" as const;
}
