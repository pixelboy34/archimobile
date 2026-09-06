import { dist, pointInPolygon, polygonArea, polygonCentroid } from "./geometry";
import type { Project, Room, Vec2 } from "./types";
import { uid } from "@/lib/utils";

const NODE = 0.18;

function nid(p: Vec2, nodes: Vec2[]): number {
  for (let i = 0; i < nodes.length; i++) {
    if (dist(nodes[i]!, p) < NODE) return i;
  }
  nodes.push({ x: p.x, y: p.y });
  return nodes.length - 1;
}

export function detectLoops(walls: { a: Vec2; b: Vec2 }[]): Vec2[][] {
  const nodes: Vec2[] = [];
  const directed: { a: number; b: number }[] = [];
  for (const w of walls) {
    if (dist(w.a, w.b) < 0.25) continue;
    const a = nid(w.a, nodes);
    const b = nid(w.b, nodes);
    if (a === b) continue;
    directed.push({ a, b }, { a: b, b: a });
  }
  const adj = new Map<number, { to: number; ei: number; ang: number }[]>();
  directed.forEach((e, ei) => {
    const na = nodes[e.a]!;
    const nb = nodes[e.b]!;
    const ang = Math.atan2(nb.y - na.y, nb.x - na.x);
    const list = adj.get(e.a) ?? [];
    list.push({ to: e.b, ei, ang });
    adj.set(e.a, list);
  });

  const seen = new Set<number>();
  const faces: Vec2[][] = [];
  for (let start = 0; start < directed.length; start++) {
    if (seen.has(start)) continue;
    const poly: number[] = [];
    let cur = start;
    let guard = 0;
    while (guard++ < 64) {
      if (seen.has(cur) && cur !== start) break;
      seen.add(cur);
      const e = directed[cur]!;
      poly.push(e.a);
      const outs = adj.get(e.b) ?? [];
      const na = nodes[e.a]!;
      const nb = nodes[e.b]!;
      const inAng = Math.atan2(nb.y - na.y, nb.x - na.x);
      let bestEi = -1;
      let bestTurn = 99;
      for (const o of outs) {
        let turn = o.ang - inAng;
        while (turn <= 1e-4) turn += Math.PI * 2;
        if (turn < bestTurn) {
          bestTurn = turn;
          bestEi = o.ei;
        }
      }
      if (bestEi < 0) break;
      if (bestEi === start) {
        if (poly.length >= 3) faces.push(poly.map((i) => nodes[i]!));
        break;
      }
      cur = bestEi;
    }
  }

  const unique: Vec2[][] = [];
  for (const f of faces) {
    const area = polygonArea(f);
    if (area < 3 || area > 600) continue;
    const c = polygonCentroid(f);
    if (unique.some((u) => dist(polygonCentroid(u), c) < 0.6 && Math.abs(polygonArea(u) - area) < 1)) {
      continue;
    }
    unique.push(f);
  }
  unique.sort((a, b) => polygonArea(a) - polygonArea(b));
  if (unique.length > 1) {
    const biggest = unique[unique.length - 1]!;
    const rest = unique.slice(0, -1);
    if (rest.every((f) => pointInPolygon(polygonCentroid(f), biggest)) && polygonArea(biggest) > 80) {
      unique.pop();
    }
  }
  return unique;
}

export function mergeDetectedRooms(project: Project, storyId: string): Room[] {
  const loops = detectLoops(project.walls.filter((w) => w.storyId === storyId));
  const rooms = project.rooms.filter((r) => r.storyId === storyId);
  const extra: Room[] = [];
  let n = rooms.length + 1;
  for (const poly of loops) {
    const c = polygonCentroid(poly);
    const exists = rooms.some((r) => r.polygon.length >= 3 && pointInPolygon(c, r.polygon));
    if (exists) continue;
    extra.push({
      id: uid("rm"),
      storyId,
      name: `Pièce ${n++}`,
      function: "other",
      polygon: poly,
    });
  }
  if (extra.length === 0) return project.rooms;
  return [...project.rooms, ...extra];
}
