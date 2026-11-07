import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRelations, renderRelations } from "../scripts/prisma-relations";

test("the foreign-key list the company filter uses matches prisma/schema.prisma (run npm run db:relations)", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const current = readFileSync(new URL("../src/lib/prisma-relations.ts", import.meta.url), "utf8");
  assert.equal(current, renderRelations(parseRelations(schema)));
});

test("relation lines are read with several key columns, names, comments and optional relations", () => {
  const keys = parseRelations(`model Line {
  id      String @id
  order   Order? @relation("OrderLines", fields: [orderId, companyId], references: [id, companyId], onDelete: Cascade) // note
  // owner User @relation(fields: [ownerId], references: [id])
  items   Item[] @relation("LineItems")
}
`);
  assert.deepEqual(keys, { Line: { order: { from: ["orderId", "companyId"], to: ["id", "companyId"] } } });
});
