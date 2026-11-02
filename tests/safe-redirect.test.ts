import assert from "node:assert/strict";
import test from "node:test";
import { safeAppPath } from "../src/lib/http-security";

test("paths inside the app are kept", () => {
  assert.equal(safeAppPath("/crm/leads?stage=new#top"), "/crm/leads?stage=new#top");
  assert.equal(safeAppPath("/"), "/");
});

test("anything that could leave the app goes home instead", () => {
  for (const bad of [
    "//evil.example", "/\\evil.example", "/\\/evil.example", "\\\\evil.example", "https://evil.example",
    "javascript:alert(1)", "/\tevil", "/\n/evil.example", "evil", "", null, undefined, 42, "/" + "a".repeat(2001),
  ]) {
    assert.equal(safeAppPath(bad), "/", String(bad));
  }
  assert.equal(safeAppPath("//evil.example", "/inbox"), "/inbox");
});
