import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

// fontkit comes with @react-pdf/renderer and has no types of its own.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require("fontkit") as { openSync(file: string): { hasGlyphForCodePoint(code: number): boolean } };

// The 18 Oct source zip changed a few bytes in both font files, and every PDF (invoices, payslips,
// certificates, letters) then failed with "Unknown version 3072". Reading the rupee sign catches that.
for (const file of ["Inter-Regular.otf", "Inter-SemiBold.otf"]) {
  test(`${file} opens and has the rupee sign`, () => {
    const font = fontkit.openSync(path.join("src/lib/pdf/fonts", file));
    assert.ok(font.hasGlyphForCodePoint(0x20b9));
  });
}
