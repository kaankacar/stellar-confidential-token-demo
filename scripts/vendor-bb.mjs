/**
 * Vendor @aztec/bb.js's browser build into the app's public/ directory.
 *
 * Why: bb.js spawns its wasm Web Worker with
 *   new Worker(new URL(/* webpackIgnore *​/ './main.worker.js', import.meta.url), { type: 'module' })
 * The `webpackIgnore` means a bundler neither rewrites that URL nor emits the
 * worker file, so once webpack bundles bb.js into a hashed chunk the worker
 * resolves to a non-existent `/_next/static/chunks/main.worker.js` and proving
 * hangs forever. Serving the intact `dest/browser/` directory at a stable
 * public path lets `import.meta.url`-relative resolution find the sibling
 * worker + wasm files. The app loads it as native ESM (see lib/bb-loader.ts),
 * bypassing webpack entirely.
 */
import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// Locate bb.js's dest/browser. Prefer the workspace store (pnpm doesn't hoist
// bb.js to the root node_modules), then fall back to any nested install.
function findBrowserDir() {
  const candidates = [];
  const pnpmDir = join(repoRoot, "node_modules", ".pnpm");
  if (existsSync(pnpmDir)) {
    for (const name of readdirSync(pnpmDir)) {
      if (name.startsWith("@aztec+bb.js@")) {
        candidates.push(join(pnpmDir, name, "node_modules", "@aztec", "bb.js", "dest", "browser"));
      }
    }
  }
  candidates.push(join(repoRoot, "node_modules", "@aztec", "bb.js", "dest", "browser"));
  return candidates.find((d) => existsSync(join(d, "index.js")));
}

const srcDir = findBrowserDir();
if (!srcDir) {
  throw new Error("could not locate @aztec/bb.js dest/browser under node_modules/.pnpm");
}

const destDir = resolve(here, "..", "packages", "app", "public", "vendor", "bb");
await mkdir(destDir, { recursive: true });
await cp(srcDir, destDir, { recursive: true });

const files = await readdir(destDir);
console.log(`vendored @aztec/bb.js browser build`);
console.log(`  from ${srcDir}`);
console.log(`  to   ${destDir}`);
console.log(`  files: ${files.join(", ")}`);
