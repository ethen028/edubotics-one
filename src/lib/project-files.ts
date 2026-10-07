import "server-only";
import { sniffMime } from "./hr-constants";

export const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PROJECT_FILES = 5;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export type IncomingFile = { fileName: string; mimeType: string; size: number; data: Uint8Array<ArrayBuffer> };

/**
 * Reads the "files" inputs of a form. Any file type is accepted (photos, PDFs, code, spreadsheets);
 * PDFs and images are recognised from their bytes so they can open in the browser, everything else downloads.
 */
export async function readFiles(formData: FormData): Promise<{ files: IncomingFile[] } | { error: string }> {
  const picked = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (picked.length > MAX_PROJECT_FILES) return { error: `Attach up to ${MAX_PROJECT_FILES} files at a time.` };
  if (picked.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES) return { error: "Attach up to 25 MB at a time." };
  const files: IncomingFile[] = [];
  for (const f of picked) {
    if (f.size > MAX_PROJECT_FILE_BYTES) return { error: `${f.name} is larger than 10 MB.` };
    const data = new Uint8Array(await f.arrayBuffer());
    files.push({
      fileName: f.name.slice(0, 200) || "file",
      mimeType: sniffMime(data) ?? "application/octet-stream",
      size: f.size,
      data,
    });
  }
  return { files };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
