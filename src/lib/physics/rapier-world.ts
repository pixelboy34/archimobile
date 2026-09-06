import type RAPIER from "@dimforge/rapier3d-compat";
import { lerp, wallAngle, wallLength } from "../bim/geometry";
import type { Opening, Project, Wall } from "../bim/types";

export type Rapier = typeof RAPIER;

let boot: Promise<Rapier> | null = null;

export function loadRapier(): Promise<Rapier> {
  if (!boot) {
    boot = import("@dimforge/rapier3d-compat").then(async (mod) => {
      const R = (mod.default ?? mod) as Rapier;
      await R.init();
      return R;
    });
  }
  return boot;
}

const SKIP_FURN = new Set([
  "rug",
  "parking",
  "pool",
  "people",
  "solar",
  "skylight",
  "jacuzzi",
]);

function yaw(ang: number) {
  const h = -ang / 2;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

function doorHoles(wall: Wall, openings: Opening[]) {
  const len = wallLength(wall);
  const holes = openings
    .filter((o) => o.wallId === wall.id && o.kind === "door")
    .map((o) => ({
      a: Math.max(0, o.t * len - o.width / 2),
      b: Math.min(len, o.t * len + o.width / 2),
      height: o.height,
    }))
    .sort((p, q) => p.a - q.a);
  const merged: { a: number; b: number; height: number }[] = [];
  for (const h of holes) {
    const last = merged[merged.length - 1];
    if (!last || h.a > last.b + 0.04) merged.push({ ...h });
    else {
      last.b = Math.max(last.b, h.b);
      last.height = Math.max(last.height, h.height);
    }
  }
  const solids: [number, number][] = [];
  let x = 0;
  for (const h of merged) {
    if (h.a - x > 0.08) solids.push([x, h.a]);
    x = h.b;
  }
  if (len - x > 0.08) solids.push([x, len]);
  return { solids, holes: merged, len };
}

export function createBuildingWorld(R: Rapier, project: Project, storyId: string | null) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 45;
  const stories = storyId ? project.stories.filter((s) => s.id === storyId) : project.stories;
  const storyIds = new Set(stories.map((s) => s.id));
  const elev0 = stories[0]?.elevation ?? 0;

  const ground = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, elev0 - 0.2, 0));
  world.createCollider(R.ColliderDesc.cuboid(80, 0.2, 80), ground);

  for (const slab of project.slabs) {
    if (!storyIds.has(slab.storyId)) continue;
    const st = project.stories.find((s) => s.id === slab.storyId);
    const elev = st?.elevation ?? 0;
    const xs = slab.polygon.map((p) => p.x);
    const zs = slab.polygon.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const hx = (maxX - minX) / 2;
    const hz = (maxZ - minZ) / 2;
    if (hx < 0.2 || hz < 0.2) continue;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation((minX + maxX) / 2, elev - slab.thickness / 2, (minZ + maxZ) / 2),
    );
    world.createCollider(R.ColliderDesc.cuboid(hx, Math.max(0.06, slab.thickness / 2), hz), body);
  }

  for (const wall of project.walls) {
    if (!storyIds.has(wall.storyId)) continue;
    const st = project.stories.find((s) => s.id === wall.storyId);
    const elev = st?.elevation ?? 0;
    const ang = wallAngle(wall);
    const q = yaw(ang);
    const { solids, holes, len } = doorHoles(wall, project.openings);
    const th = Math.max(0.06, wall.thickness / 2);
    for (const [s0, s1] of solids) {
      const t = (s0 + s1) / 2 / len;
      const p = lerp(wall.a, wall.b, t);
      const body = world.createRigidBody(
        R.RigidBodyDesc.fixed().setTranslation(p.x, elev + wall.height / 2, p.y).setRotation(q),
      );
      world.createCollider(R.ColliderDesc.cuboid((s1 - s0) / 2, wall.height / 2, th), body);
    }
    for (const h of holes) {
      const lintel = wall.height - h.height;
      if (lintel < 0.08) continue;
      const t = (h.a + h.b) / 2 / len;
      const p = lerp(wall.a, wall.b, t);
      const body = world.createRigidBody(
        R.RigidBodyDesc.fixed()
          .setTranslation(p.x, elev + h.height + lintel / 2, p.y)
          .setRotation(q),
      );
      world.createCollider(R.ColliderDesc.cuboid((h.b - h.a) / 2, lintel / 2, th), body);
    }
  }

  for (const col of project.columns) {
    if (!storyIds.has(col.storyId)) continue;
    const st = project.stories.find((s) => s.id === col.storyId);
    const elev = st?.elevation ?? 0;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(col.position.x, elev + col.height / 2, col.position.y),
    );
    world.createCollider(R.ColliderDesc.cuboid(col.width / 2, col.height / 2, col.depth / 2), body);
  }

  for (const stair of project.stairs) {
    if (!storyIds.has(stair.storyId)) continue;
    const st = project.stories.find((s) => s.id === stair.storyId);
    const elev = st?.elevation ?? 0;
    const mid = {
      x: stair.origin.x + Math.cos(-stair.direction) * (stair.run / 2),
      z: stair.origin.y + Math.sin(-stair.direction) * (stair.run / 2),
    };
    const q = yaw(stair.direction);
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(mid.x, elev + stair.rise / 2, mid.z)
        .setRotation({ x: 0, y: q.y, z: 0, w: q.w }),
    );
    world.createCollider(R.ColliderDesc.cuboid(stair.run / 2, 0.08, stair.width / 2), body);
  }

  for (const f of project.furniture) {
    if (!storyIds.has(f.storyId) || SKIP_FURN.has(f.kind)) continue;
    const st = project.stories.find((s) => s.id === f.storyId);
    const elev = st?.elevation ?? 0;
    const h = Math.max(0.08, f.h);
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(f.position.x, elev + h / 2, f.position.y)
        .setRotation(yaw(f.rotation)),
    );
    const hx = Math.max(0.08, f.w / 2);
    const hz = Math.max(0.08, f.d / 2);
    world.createCollider(R.ColliderDesc.cuboid(hx, h / 2, hz), body);
  }

  return world;
}

export const PLAYER_RADIUS = 0.28;
export const PLAYER_HALF = 0.52;
export const EYE_OFFSET = 0.78;
