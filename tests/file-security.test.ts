import assert from "node:assert/strict";
import test from "node:test";
import { sniffMime } from "../src/lib/hr-constants";
import { privateFileHeaders } from "../src/lib/file-response";

test("file recognition rejects spoofed short signatures and active content", () => {
  for (const input of ["%PDF<script>alert(1)</script>", "<svg onload=alert(1)>", "<html>hello</html>"]) {
    assert.equal(sniffMime(new TextEncoder().encode(input)), null);
  }
  assert.equal(sniffMime(Uint8Array.from([0xff, 0xd8, 0xff])), null);
  assert.equal(sniffMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), null);
});

test("private downloads force unrecognized historical content to download safely", () => {
  const headers = privateFileHeaders({ data: new TextEncoder().encode("<svg onload=alert(1)>"), fileName: 'photo.svg"\r\nX-Evil: yes' });
  assert.equal(headers["Content-Type"], "application/octet-stream");
  assert.match(headers["Content-Disposition"], /^attachment;/);
  assert.doesNotMatch(headers["Content-Disposition"], /[\r\n]/);
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Cross-Origin-Resource-Policy"], "same-origin");
});

test("file recognition accepts complete PDF and PNG envelopes", () => {
  assert.equal(sniffMime(new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n")), "application/pdf");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1sAAAAASUVORK5CYII=", "base64");
  assert.equal(sniffMime(png), "image/png");
  assert.equal(sniffMime(png.subarray(0, 20)), null);
});

test("JPEG and WebP checks require closing markers and consistent container sizes", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xdb, 0xff, 0xd9]);
  assert.equal(sniffMime(jpeg), "image/jpeg");
  assert.equal(sniffMime(jpeg.subarray(0, 10)), null);
  const webp = Buffer.alloc(24);
  webp.write("RIFF", 0);
  webp.writeUInt32LE(16, 4);
  webp.write("WEBPVP8 ", 8);
  assert.equal(sniffMime(webp), "image/webp");
  webp.writeUInt32LE(1000, 4);
  assert.equal(sniffMime(webp), null);
});
