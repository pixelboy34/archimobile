import test from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("survey-underlay-check smoke", () => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts/survey-underlay-check.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `exit ${r.status}`);
  }
  if (!r.stdout.includes("OK survey-underlay-check")) {
    throw new Error(r.stdout || "missing OK");
  }
});
