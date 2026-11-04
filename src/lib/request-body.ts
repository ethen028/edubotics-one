/** Read before multipart parsing so a false or absent Content-Length cannot bypass the cap. */
export async function limitedFormData(request: Request, maxBytes: number) {
  if (!request.body) throw new Error("Missing form");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("Form too large"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const copy = new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" }, body: Buffer.concat(chunks) });
  return copy.formData();
}

/** A JSON body up to `maxBytes` (the phone app's requests), or null when it is missing, too big or not JSON. */
export async function limitedJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}
