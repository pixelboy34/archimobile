import { dist, distToSegment, snapVec } from "./geometry";
import type { Project, Vec2 } from "./types";

export type SnapKind = "end" | "mid" | "col" | "grid" | "none";

export type SnapHit = { point: Vec2; kind: SnapKind };

export function snapDetail(
  p: Vec2,
  project: Project,
  storyId: string,
  useGrid: boolean,
  radius = 0.35,
): SnapHit {
  let best: SnapHit = { point: p, kind: "none" };
  let bestD = radius;
  for (const w of project.walls) {
    if (w.storyId !== storyId) continue;
    for (const pt of [w.a, w.b]) {
      const d = dist(p, pt);
      if (d < bestD) {
        bestD = d;
        best = { point: pt, kind: "end" };
      }
    }
  }
  if (best.kind === "end") return best;
  let midD = 0.16;
  let mid: SnapHit | null = null;
  for (const w of project.walls) {
    if (w.storyId !== storyId) continue;
    const hit = distToSegment(p, w.a, w.b);
    if (hit.dist < midD) {
      midD = hit.dist;
      const t = hit.t;
      const kind: SnapKind = t > 0.45 && t < 0.55 ? "mid" : "end";
      mid = { point: hit.closest, kind: t > 0.08 && t < 0.92 ? kind : "end" };
    }
  }
  if (mid) return mid;
  for (const c of project.columns) {
    if (c.storyId !== storyId) continue;
    const d = dist(p, c.position);
    if (d < bestD) {
      bestD = d;
      best = { point: c.position, kind: "col" };
    }
  }
  if (best.kind !== "none") return best;
  if (useGrid) return { point: snapVec(p), kind: "grid" };
  return { point: p, kind: "none" };
}

export function snapToSketch(
  p: Vec2,
  project: Project,
  storyId: string,
  useGrid: boolean,
  radius = 0.35,
): Vec2 {
  return snapDetail(p, project, storyId, useGrid, radius).point;
}
