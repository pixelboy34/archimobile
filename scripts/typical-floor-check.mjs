/**
 * Smoke check: étage type vivant — generate R+4, sync window, keep RDC, detach, attic.
 */
import { createServer } from "vite";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// fileURLToPath, et non .pathname : sous Windows .pathname vaut "/C:/..." et Vite le
// prend pour un chemin relatif, d'ou un mkdir "C:\C:\Users\..." qui echoue.
const root = fileURLToPath(new URL("..", import.meta.url));

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const { emptyProject } = await server.ssrLoadModule("/src/lib/bim/builder.ts");
  const { generateMassing } = await server.ssrLoadModule("/src/lib/cad/massing.ts");
  const {
    inferStoryRoles,
    syncTypicalFrom,
    isLiveTypical,
    typicalGroupSize,
    setStoryDetached,
    markStoryRole,
  } = await server.ssrLoadModule("/src/lib/cad/typical.ts");

  let p = emptyProject("Tour");
  p = generateMassing(p, { width: 18, depth: 14, floors: 5, floorHeight: 2.8, groundHeight: 3.2 });
  p = inferStoryRoles(p);

  assert.equal(p.stories[0].role, "ground");
  assert.ok(p.stories.slice(1).every((s) => s.role === "typical"));
  const typ = p.stories[2];
  assert.equal(isLiveTypical(typ), true);
  assert.ok(typicalGroupSize(p, typ.id) >= 3, "expected ≥3 linked typicals");

  const typWalls = p.walls.filter((w) => w.storyId === typ.id);
  const win = p.openings.find((o) => typWalls.some((w) => w.id === o.wallId) && o.kind === "window");
  assert.ok(win, "typical floor needs a window");
  p.openings = p.openings.map((o) => (o.id === win.id ? { ...o, t: 0.22 } : o));
  p = syncTypicalFrom(p, typ.id);

  const rdcId = p.stories[0].id;
  const rdcWalls = new Set(p.walls.filter((w) => w.storyId === rdcId).map((w) => w.id));
  const rdcMoved = p.openings.some(
    (o) => rdcWalls.has(o.wallId) && o.kind === "window" && Math.abs(o.t - 0.22) < 0.001,
  );
  assert.equal(rdcMoved, false, "RDC must stay unchanged");

  for (const st of p.stories.filter((s) => s.role === "typical" && !s.detached)) {
    if (st.id === typ.id) continue;
    const walls = p.walls.filter((w) => w.storyId === st.id);
    const synced = p.openings.some(
      (o) => walls.some((w) => w.id === o.wallId) && o.kind === "window" && Math.abs(o.t - 0.22) < 0.001,
    );
    assert.ok(synced, `typical ${st.name} should receive synced window`);
  }

  p = setStoryDetached(p, typ.id, true);
  assert.equal(isLiveTypical(p.stories.find((s) => s.id === typ.id)), false);
  const last = p.stories[p.stories.length - 1];
  p = markStoryRole(p, last.id, "attic");
  assert.equal(p.stories[p.stories.length - 1].role, "attic");

  console.log("typical-floor-check: OK —", p.stories.map((s) => `${s.name}:${s.role}${s.detached ? ":det" : ""}`).join(" · "));
} finally {
  await server.close();
}
