import { sniffMime } from "./hr-constants";

/** Recheck stored bytes as well: historical MIME metadata must not enable active content. */
export function privateFileHeaders(file: { data: Uint8Array; fileName: string }): Record<string, string> {
  const mimeType = sniffMime(file.data);
  return {
    "Content-Type": mimeType ?? "application/octet-stream",
    "Content-Disposition": `${mimeType ? "inline" : "attachment"}; filename="${encodeURIComponent(file.fileName)}"`,
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
