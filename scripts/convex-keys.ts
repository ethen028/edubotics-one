/**
 * Makes the key pair that lets Convex trust Orbit's sign-in (src/lib/convex-token.ts).
 *
 *   npm run convex:keys            prints both values to copy
 *   npm run convex:keys -- <dir>   keeps them in <dir> (docker/start.sh uses this) and only makes them once
 *
 * CONVEX_AUTH_PRIVATE_KEY goes in Orbit's .env (keep it secret). ORBIT_JWKS is the public half and goes into
 * Convex: `npx convex env set ORBIT_JWKS <value>`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newConvexKeys } from "../src/lib/convex-token";

async function main(dir: string | undefined) {
  if (!dir) {
    const keys = await newConvexKeys();
    console.log(`CONVEX_AUTH_PRIVATE_KEY="${keys.privateKeyPem}"`);
    console.log(`ORBIT_JWKS=${keys.jwksDataUri}`);
  } else {
    const privatePath = join(dir, "convex-auth-private-key");
    const publicPath = join(dir, "convex-auth-jwks");
    if (!existsSync(privatePath) || !existsSync(publicPath)) {
      mkdirSync(dir, { recursive: true });
      const keys = await newConvexKeys();
      writeFileSync(privatePath, keys.privateKeyPem, { mode: 0o600 });
      writeFileSync(publicPath, keys.jwksDataUri, { mode: 0o644 });
      console.log("Made a new Convex sign-in key pair.");
    }
  }
}

main(process.argv[2]).catch((error) => {
  console.error(error);
  process.exit(1);
});
