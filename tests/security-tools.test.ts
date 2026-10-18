import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { deepmerge } from "deepmerge-ts";
import { loadConfigFromFile } from "@prisma/config";

test("Prisma's patched config merger retains plain record and array semantics", async () => {
  const source = { nested: { paths: ["first"], option: true } };
  assert.deepEqual(deepmerge(source, { nested: { paths: ["second"] } }), {
    nested: { paths: ["first", "second"], option: true },
  });
  assert.deepEqual(source.nested.paths, ["first"]);
  const dir = await mkdtemp(path.join(tmpdir(), "prisma-config-"));
  try {
    await writeFile(path.join(dir, "prisma.config.ts"),
      'export default { schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations" } };');
    const loaded = await loadConfigFromFile({ configRoot: dir });
    assert.equal(loaded.error, undefined);
    assert.equal(loaded.config?.schema, path.join(dir, "prisma/schema.prisma"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("secret scan detects credentials without exposing values and ignores local env", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "source-scan-"));
  try {
    await mkdir(path.join(dir, "scripts"));
    await copyFile(new URL("../scripts/check-secrets.mjs", import.meta.url), path.join(dir, "scripts/check-secrets.mjs"));
    const token = "ghp_" + "a".repeat(36);
    await writeFile(path.join(dir, ".env"), `TOKEN=${token}`);
    const scan = () => spawnSync(process.execPath, [path.join(dir, "scripts/check-secrets.mjs")], { encoding: "utf8" });
    assert.equal(scan().status, 0);
    await writeFile(path.join(dir, "leaked.ts"), `export const token = "${token}";`);
    const result = scan();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /leaked\.ts:1: possible GitHub token/);
    assert.equal(result.stderr.includes(token), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
