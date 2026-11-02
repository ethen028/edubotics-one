import { test } from "node:test";
import assert from "node:assert/strict";
import { spaceLevel } from "../src/lib/backup-rules";

const MB = 1024 ** 2;
const GB = 1024 ** 3;

test("plenty of room for backups raises nothing", () => {
  assert.equal(spaceLevel(50 * GB, 300 * MB), null);
});

test("a drive with room for fewer than five more backups, or under 2 GB, gets an amber warning", () => {
  assert.equal(spaceLevel(1.5 * GB, 100 * MB), "amber");
  assert.equal(spaceLevel(8 * GB, 2 * GB), "amber");
});

test("a drive where the next backup may not fit is red", () => {
  assert.equal(spaceLevel(2.5 * GB, 2 * GB), "red");
  assert.equal(spaceLevel(100 * MB, 10 * MB), "red");
});

test("a drive whose free space can't be read raises nothing", () => {
  assert.equal(spaceLevel(null, 300 * MB), null);
});
