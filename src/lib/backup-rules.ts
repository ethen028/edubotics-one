// Backup rules with no file or database access, so they are unit tested (tests/backup-rules.test.ts).

const GB = 1024 ** 3;

/**
 * Whether a drive is running out of room for backups. Every backup is a full copy, so the next one needs about as
 * much room as the newest: red when it may not fit, amber when fewer than five more (or under 2 GB) would.
 */
export function spaceLevel(freeBytes: number | null, newestBytes: number): "red" | "amber" | null {
  if (freeBytes === null) return null;
  if (freeBytes < newestBytes * 1.5 + 0.2 * GB) return "red";
  if (freeBytes < Math.max(newestBytes * 5, 2 * GB)) return "amber";
  return null;
}
