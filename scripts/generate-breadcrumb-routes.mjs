import { readdir, writeFile } from "node:fs/promises";
const app = new URL("../src/app/", import.meta.url);
const files = await readdir(app, { recursive: true });
const routes = files.filter(file => /(^|[\\/])page\.tsx$/.test(file)).map(file => {
  const path = "/" + file.replaceAll("\\", "/").replace(/(^|\/)page\.tsx$/, "");
  return path.replace(/\/\([^/]+\)/g, "").replace(/\/$/, "") || "/";
});
await writeFile(new URL("../src/lib/breadcrumb-routes.json", import.meta.url), JSON.stringify([...new Set(routes)].sort(), null, 2) + "\n");
