import type { Opening, Project, Vec2, Wall } from "./types";

export const SNAP = 0.25;

export function snap(n: number, step = SNAP): number {
  return Math.round(n / step) * step;
}

export function snapVec(v: Vec2, step = SNAP): Vec2 {
  return { x: snap(v.x, step), y: snap(v.y, step) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersect = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-12) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function wallLength(w: Wall): number {
  return dist(w.a, w.b);
}

export function wallMid(w: Wall): Vec2 {
  return lerp(w.a, w.b, 0.5);
}

export function wallAngle(w: Wall): number {
  return Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
}

export function wallNormalOffset(w: Wall): Vec2 {
  if (w.alignment !== "interior" && w.alignment !== "exterior") return { x: 0, y: 0 };
  const ang = wallAngle(w);
  const mag = w.alignment === "interior" ? w.thickness / 2 : -w.thickness / 2;
  return { x: Math.sin(ang) * mag, y: -Math.cos(ang) * mag };
}

export function polygonArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  if (poly.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-8) {
    const sx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const sy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    return { x: sx, y: sy };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function rectPolygon(x: number, y: number, w: number, d: number): Vec2[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + d },
    { x, y: y + d },
  ];
}

export function boundsOf(points: Vec2[]): { min: Vec2; max: Vec2 } {
  if (points.length === 0) return { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

export function projectBounds(project: Project, storyId?: string): { min: Vec2; max: Vec2 } {
  const pts: Vec2[] = [];
  for (const w of project.walls) {
    if (storyId && w.storyId !== storyId) continue;
    pts.push(w.a, w.b);
  }
  for (const r of project.rooms) {
    if (storyId && r.storyId !== storyId) continue;
    pts.push(...r.polygon);
  }
  for (const s of project.slabs) {
    if (storyId && s.storyId !== storyId) continue;
    pts.push(...s.polygon);
  }
  return boundsOf(pts);
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): { dist: number; t: number; closest: Vec2 } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-10) return { dist: dist(p, a), t: 0, closest: a };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  const closest = { x: a.x + abx * t, y: a.y + aby * t };
  return { dist: dist(p, closest), t, closest };
}

export function findWallAt(
  project: Project,
  storyId: string,
  p: Vec2,
  maxDist = 0.45,
): { wall: Wall; t: number } | null {
  let best: { wall: Wall; t: number; d: number } | null = null;
  for (const w of project.walls) {
    if (w.storyId !== storyId) continue;
    const hit = distToSegment(p, w.a, w.b);
    if (hit.dist <= maxDist && (!best || hit.dist < best.d)) {
      best = { wall: w, t: hit.t, d: hit.dist };
    }
  }
  return best ? { wall: best.wall, t: best.t } : null;
}

export interface WallSegment {
  a: Vec2;
  b: Vec2;
  length: number;
}

export function wallSolidSegments(wall: Wall, openings: Opening[]): WallSegment[] {
  const len = wallLength(wall);
  if (len < 0.05) return [];
  // Rien n'interdit à deux baies de se chevaucher à la pose. Empiler les bornes
  // puis les apparier deux à deux rouvrait alors un bloc de mur plein sur toute
  // la hauteur d'étage entre deux menuiseries : les trous sont donc fusionnés.
  const holes: { t0: number; t1: number }[] = [];
  for (const o of openings) {
    if (o.wallId !== wall.id) continue;
    const half = o.width / 2 / len;
    holes.push({ t0: Math.max(0, o.t - half), t1: Math.min(1, o.t + half) });
  }
  holes.sort((a, b) => a.t0 - b.t0);
  const merged: { t0: number; t1: number }[] = [];
  for (const h of holes) {
    const last = merged[merged.length - 1];
    if (last && h.t0 <= last.t1) last.t1 = Math.max(last.t1, h.t1);
    else merged.push({ ...h });
  }
  const segs: WallSegment[] = [];
  const push = (t0: number, t1: number) => {
    if (t1 - t0 < 0.01) return;
    const a = lerp(wall.a, wall.b, t0);
    const b = lerp(wall.a, wall.b, t1);
    segs.push({ a, b, length: dist(a, b) });
  };
  let cursor = 0;
  for (const h of merged) {
    push(cursor, h.t0);
    cursor = Math.max(cursor, h.t1);
  }
  push(cursor, 1);
  return segs;
}

export function edgeKey(a: Vec2, b: Vec2): string {
  const ax = snap(a.x, 0.05);
  const ay = snap(a.y, 0.05);
  const bx = snap(b.x, 0.05);
  const by = snap(b.y, 0.05);
  if (ax < bx || (ax === bx && ay <= by)) return `${ax},${ay}|${bx},${by}`;
  return `${bx},${by}|${ax},${ay}`;
}

export function uniqueWallEdges(polygons: Vec2[][]): { a: Vec2; b: Vec2 }[] {
  const map = new Map<string, { a: Vec2; b: Vec2 }>();
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if (dist(a, b) < 0.05) continue;
      const k = edgeKey(a, b);
      if (!map.has(k)) map.set(k, { a: snapVec(a, 0.05), b: snapVec(b, 0.05) });
    }
  }
  return [...map.values()];
}

export function allProjectPoints(project: Project): Vec2[] {
  const pts: Vec2[] = [];
  for (const w of project.walls) pts.push(w.a, w.b);
  for (const r of project.rooms) pts.push(...r.polygon);
  for (const s of project.slabs) pts.push(...s.polygon);
  return pts;
}
