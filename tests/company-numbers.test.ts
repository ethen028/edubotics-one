import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { withNextNumber } from "../src/lib/company-numbers";

const clash = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

test("the first record of a company is number 1, the next one after its highest", async () => {
  assert.equal(await withNextNumber(async () => null, async (n) => n), 1);
  assert.equal(await withNextNumber(async () => 41, async (n) => n), 42);
});

test("when someone takes the number at the same moment, the next free one is used", async () => {
  let highest = 7;
  const taken = new Set([8]);
  const n = await withNextNumber(async () => highest, async (n) => {
    if (taken.has(n)) { highest = n; throw clash(); }
    return n;
  });
  assert.equal(n, 9);
});

test("other errors are not retried", async () => {
  let calls = 0;
  await assert.rejects(withNextNumber(async () => 1, async () => { calls++; throw new Error("no"); }), /no/);
  assert.equal(calls, 1);
});
