#!/usr/bin/env node
/**
 * FORMA Goal G smoke: branding + SW file + offline library surface.
 * Run: node scripts/forma-pwa-check.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderWebManifest, readOgSite } from "./grok-pwa-shared.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = readOgSite(root);

assert.equal(site.title, "FORMA");
assert.equal(String(site.theme_color).replace(/^#/, ""), "6ed0c3");

const manifest = JSON.parse(renderWebManifest("localhost", site, root));
assert.equal(manifest.name, "FORMA");
assert.equal(manifest.short_name, "FORMA");
assert.equal(manifest.theme_color, "#6ed0c3");
assert.equal(manifest.background_color, "#0c0c0b");
assert.ok(manifest.icons.some((i) => i.src.includes("icon-192")));
assert.ok(manifest.icons.some((i) => i.src.includes("icon-512")));

for (const f of [
  "public/sw.js",
  "public/__grok/icon-180.png",
  "public/__grok/icon-192.png",
  "public/__grok/icon-512.png",
  "src/lib/pwa/offline-maquettes.ts",
  "src/lib/pwa/register-sw.ts",
  "src/components/pwa/OfflineMaquettesPanel.tsx",
]) {
  assert.ok(existsSync(join(root, f)), `missing ${f}`);
}

const sw = readFileSync(join(root, "public/sw.js"), "utf8");
assert.match(sw, /forma-shell-v1/);
assert.match(sw, /\/api\//);
assert.ok(sw.includes("cache.put") && sw.includes("isLiveApi"));
assert.ok(sw.includes("if (isLiveApi(url.pathname)) return"));

const rootTsx = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
assert.match(rootTsx, /PwaBootstrap/);
assert.match(rootTsx, /#6ed0c3/);

const store = readFileSync(join(root, "src/lib/store/project-store.ts"), "utf8");
assert.match(store, /forma-studio-v9/);

console.log("forma-pwa-check: OK");
console.log("  manifest:", manifest.name, manifest.theme_color, manifest.background_color);
console.log("  sw: public/sw.js (custom, not vite-plugin-pwa)");
console.log("  verify iOS: open /?install=1&platform=ios → Share → Home Screen");
console.log("  verify offline: Install → save maquette → airplane mode → reopen app");
