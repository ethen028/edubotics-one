import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BRAND } from "../src/lib/brand";

// The page reads its colours from globals.css; PDFs, emails and the link preview read src/lib/brand.ts.
// These checks keep the two lists the same and make sure text on the brand colours stays readable (WCAG AA).

const css = readFileSync("src/app/globals.css", "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(m, `${name} is set in globals.css`);
  return m[1].toLowerCase();
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("globals.css uses the same brand colours as src/lib/brand.ts", () => {
  assert.equal(token("--color-brand-700"), BRAND.blue);
  assert.equal(token("--color-brand-500"), BRAND.blueLight);
  assert.equal(token("--color-navy"), BRAND.navy);
  assert.equal(token("--color-spark"), BRAND.orange);
  assert.equal(token("--page-bg"), BRAND.page);
  assert.equal(token("--line"), BRAND.line);
  assert.equal(token("--color-slate-900"), BRAND.ink);
  assert.equal(token("--color-slate-500"), BRAND.muted);
  assert.equal(token("--color-mint"), BRAND.tint);
});

const AA = 4.5;
const pairs: [string, string, string][] = [
  ["white text on blue buttons", "#ffffff", BRAND.blue],
  ["white text on the navy menu and banners", "#ffffff", BRAND.navy],
  ["muted text on the navy", BRAND.onNavyMuted, BRAND.navy],
  ["blue links on the page", BRAND.blue, BRAND.page],
  ["blue links on white cards", BRAND.blue, "#ffffff"],
  ["main text on the page", BRAND.ink, BRAND.page],
  ["secondary text on the page", BRAND.muted, BRAND.page],
  ["helper text on the page", token("--color-slate-400"), BRAND.page],
  ["text on pale blue selections", token("--color-ink"), BRAND.tint],
  ["blue links on pale blue selections", BRAND.blue, BRAND.tint],
];
for (const [what, fg, bg] of pairs) {
  test(`${what} passes WCAG AA`, () => {
    assert.ok(contrast(fg, bg) >= AA, `${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}:1`);
  });
}

test("the orange stays a mark, not text: it fails AA on white", () => {
  // If this ever passes, the orange changed; re-check where it is used.
  assert.ok(contrast(BRAND.orange, "#ffffff") < AA);
});
