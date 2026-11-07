/**
 * Writes src/lib/prisma-relations.ts: for every relation field that holds the foreign key, which columns hold it
 * (fields) and which columns of the other table they point at (references). The company filter
 * (src/lib/company-scope.ts) needs this to check links, and Prisma 7 no longer ships it at run time.
 * Run by `npm run db:migrate`, or by hand with `npm run db:relations`; tests/prisma-relations.test.ts fails if the
 * file is out of date with prisma/schema.prisma.
 */
import { readFileSync, writeFileSync } from "node:fs";

export type RelationKeys = Record<string, Record<string, { from: string[]; to: string[] }>>;

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function parseRelations(schema: string): RelationKeys {
  const out: RelationKeys = {};
  for (const block of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model, body] = block;
    for (const raw of body.split("\n")) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      const field = line.match(/^(\w+)\s+\w+[?[\]]*\s+.*@relation\((.*)\)/);
      if (!field) continue;
      const from = field[2].match(/fields:\s*\[([^\]]*)\]/);
      const to = field[2].match(/references:\s*\[([^\]]*)\]/);
      if (!from || !to) continue;
      (out[model] ??= {})[field[1]] = { from: list(from[1]), to: list(to[1]) };
    }
  }
  return out;
}

export function renderRelations(keys: RelationKeys): string {
  const models = Object.entries(keys).map(([model, fields]) => `  ${JSON.stringify(model)}: ${JSON.stringify(fields)},`);
  return `// Made by scripts/prisma-relations.ts from prisma/schema.prisma. Don't edit; run \`npm run db:relations\`.\n` +
    `export const RELATION_KEYS: Record<string, Record<string, { from: string[]; to: string[] }>> = {\n${models.join("\n")}\n};\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = parseRelations(readFileSync("prisma/schema.prisma", "utf8"));
  writeFileSync("src/lib/prisma-relations.ts", renderRelations(keys));
  console.log(`Wrote src/lib/prisma-relations.ts (${Object.values(keys).reduce((n, m) => n + Object.keys(m).length, 0)} relations).`);
}
