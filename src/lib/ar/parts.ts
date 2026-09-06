import { wallAngle, wallLength, wallMid, wallNormalOffset, wallSolidSegments } from "@/lib/bim/geometry";
import type { Project } from "@/lib/bim/types";

export type GhostPart = {
  id: string;
  pos: [number, number, number];
  rot: [number, number, number];
  scale: [number, number, number];
  color: string;
};

function storyElev(project: Project, id: string): number {
  return project.stories.find((s) => s.id === id)?.elevation ?? 0;
}

export function ghostParts(project: Project, storyId?: string | null): GhostPart[] {
  const out: GhostPart[] = [];
  for (const w of project.walls) {
    if (storyId && w.storyId !== storyId) continue;
    const elev = storyElev(project, w.storyId);
    const ang = wallAngle(w);
    const off = wallNormalOffset(w);
    const segs = wallSolidSegments(
      w,
      project.openings.filter((o) => o.wallId === w.id),
    );
    segs.forEach((seg, i) => {
      const mid = { x: (seg.a.x + seg.b.x) / 2 + off.x, y: (seg.a.y + seg.b.y) / 2 + off.y };
      const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
      out.push({
        id: `${w.id}_${i}`,
        pos: [mid.x, elev + w.height / 2, mid.y],
        rot: [0, -ang, 0],
        scale: [Math.max(0.08, len), w.height, w.thickness],
        color: "#d8d2c6",
      });
    });
  }
  for (const s of project.slabs) {
    if (storyId && s.storyId !== storyId) continue;
    const xs = s.polygon.map((p) => p.x);
    const ys = s.polygon.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const elev = storyElev(project, s.storyId);
    out.push({
      id: s.id,
      pos: [(minX + maxX) / 2, elev + s.thickness / 2, (minY + maxY) / 2],
      rot: [0, 0, 0],
      scale: [Math.max(0.4, maxX - minX), s.thickness, Math.max(0.4, maxY - minY)],
      color: "#b7b1a6",
    });
  }
  for (const c of project.columns) {
    if (storyId && c.storyId !== storyId) continue;
    const elev = storyElev(project, c.storyId);
    out.push({
      id: c.id,
      pos: [c.position.x, elev + c.height / 2, c.position.y],
      rot: [0, 0, 0],
      scale: [c.width, c.height, c.depth],
      color: "#9a958c",
    });
  }
  for (const r of project.roofs) {
    if (storyId && r.storyId !== storyId) continue;
    const story = project.stories.find((s) => s.id === r.storyId);
    const elev = (story?.elevation ?? 0) + (story?.height ?? 2.8);
    const xs = r.polygon.map((p) => p.x);
    const ys = r.polygon.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    out.push({
      id: r.id,
      pos: [(minX + maxX) / 2, elev + 0.2, (minY + maxY) / 2],
      rot: [0, 0, 0],
      scale: [Math.max(0.4, maxX - minX), 0.18, Math.max(0.4, maxY - minY)],
      color: "#8d6750",
    });
  }
  return out;
}

export { wallAngle, wallLength, wallMid };
