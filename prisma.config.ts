// Prisma 7 settings for the command line (generate, migrate, seed). The app itself connects in
// src/lib/prisma-client.ts. Prisma 7 no longer reads .env by itself, so a local .env is loaded here;
// values already set (Docker, CI, Vercel) win over it.
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // `generate` needs no address, so a missing one only fails the commands that touch the database.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
