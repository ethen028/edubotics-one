import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code skills and OMC state (third-party scripts, not app code)
    ".claude/**",
    ".omc/**",
    // The phone app has its own tooling (Expo); see mobile-app/README.md.
    "mobile-app/**",
    // Written by `npx convex dev` / `npx convex codegen`.
    "convex/_generated/**",
  ]),
]);

export default eslintConfig;
