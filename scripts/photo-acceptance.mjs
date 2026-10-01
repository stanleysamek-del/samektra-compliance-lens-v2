// Use the already-installed TypeScript runtime; no on-demand package downloads.
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
const envIndex = args.indexOf("--env-file");
if (envIndex >= 0) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(args[envIndex + 1], "utf8")))) {
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}
const require = createRequire(import.meta.url);
const { createServer } = createRequire(require.resolve("vitest/package.json"))("vite");
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { "@": process.cwd() } },
  server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { main } = await server.ssrLoadModule(path.resolve("scripts/photo-acceptance.ts"));
  const wikiIndex = args.indexOf("--wiki");
  const root = wikiIndex < 0 ? "D:/LifeSafetyWiki" : args[wikiIndex + 1];
  const bank = await import(pathToFileURL(path.resolve(root, "lib/fieldCallScenes.js")).href);
  await main(args, bank);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Photo acceptance failed");
  process.exitCode = 1;
} finally { await server.close(); }
