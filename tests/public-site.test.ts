import assert from "node:assert/strict";
import test from "node:test";
import { publicOrigin, publicPaths } from "../src/lib/public-site";

test("public metadata accepts only a configured HTTPS origin", () => {
  assert.equal(publicOrigin("https://jobs.example.com"), "https://jobs.example.com");
  for (const value of ["", "broken", "http://example.com", "https://user:secret@example.com", "https://example.com/private", "https://example.com/?key=secret", "https://localhost", "https://127.0.0.1"]) {
    assert.equal(publicOrigin(value), null, value);
  }
});

test("sitemap publishes only careers and legal pages", () => {
  assert.deepEqual([...publicPaths], ["/careers", "/privacy", "/terms", "/cookies"]);
});
