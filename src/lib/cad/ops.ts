import { uid } from "../utils";
import { dist, distToSegment } from "../bim/geometry";
import { mergeDetectedRooms } from "../bim/rooms";
import type { Project, Vec2, Wall } from "../bim/types";

const DEG = Math.PI / 180;

export function orthoPoint(from: Vec2, to: Vec2, enable = true): Vec2 {
  if (!enable) return to;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return to;
  const ang = Math.atan2(dy, dx);
  const snapped = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
  if (Math.abs(ang - snapped) < 12 * DEG) {
    return { x: from.x + Math.cos(snapped) * len, y: from.y + Math.sin(snapped) * len };
  }
  return to;
}

export function translateSelection(p: Project, ids: string[], dx: number, dy: number): Project {
  const hit = new Set(ids);
  const shift = (v: Vec2): Vec2 => ({ x: v.x + dx, y: v.y + dy });
  p.walls = p.walls.map((w) => (hit.has(w.id) ? { ...w, a: shift(w.a), b: shift(w.b) } : w));
  p.furniture = p.furniture.map((f) => (hit.has(f.id) ? { ...f, position: shift(f.position) } : f));
  p.columns = p.columns.map((c) => (hit.has(c.id) ? { ...c, position: shift(c.position) } : c));
  p.stairs = p.stairs.map((s) => (hit.has(s.id) ? { ...s, origin: shift(s.origin) } : s));
  p.rooms = p.rooms.map((r) => (hit.has(r.id) ? { ...r, polygon: r.polygon.map(shift) } : r));
  p.slabs = p.slabs.map((s) => (hit.has(s.id) ? { ...s, polygon: s.polygon.map(shift) } : s));
  p.roofs = p.roofs.map((r) => (hit.has(r.id) ? { ...r, polygon: r.polygon.map(shift) } : r));
  p.survey = (p.survey ?? []).map((s) => (hit.has(s.id) ? { ...s, position: shift(s.position) } : s));
  return p;
}

/** Clone selection by offset. Returns new ids (includes openings copied with walls). */
export function cloneSelection(p: Project, ids: string[], dx: number, dy: number): string[] {
  const hit = new Set(ids);
  const shift = (v: Vec2): Vec2 => ({ x: v.x + dx, y: v.y + dy });
  const nextIds: string[] = [];
  const wallMap = new Map<string, string>();
  for (const w of [...p.walls]) {
    if (!hit.has(w.id)) continue;
    const nid = uid("w");
    wallMap.set(w.id, nid);
    p.walls.push({ ...w, id: nid, a: shift(w.a), b: shift(w.b) });
    nextIds.push(nid);
  }
  for (const o of [...p.openings]) {
    const mapped = wallMap.get(o.wallId);
    if (mapped) {
      const nid = uid("op");
      p.openings.push({ ...o, id: nid, wallId: mapped });
      nextIds.push(nid);
    } else if (hit.has(o.id)) {
      const nid = uid("op");
      p.openings.push({ ...o, id: nid, t: Math.min(0.92, o.t + 0.12) });
      nextIds.push(nid);
    }
  }
  for (const f of [...p.furniture]) {
    if (!hit.has(f.id)) continue;
    const nid = uid("fur");
    p.furniture.push({ ...f, id: nid, position: shift(f.position) });
    nextIds.push(nid);
  }
  for (const c of [...p.columns]) {
    if (!hit.has(c.id)) continue;
    const nid = uid("col");
    p.columns.push({ ...c, id: nid, position: shift(c.position) });
    nextIds.push(nid);
  }
  for (const st of [...p.stairs]) {
    if (!hit.has(st.id)) continue;
    const nid = uid("stair");
    p.stairs.push({ ...st, id: nid, origin: shift(st.origin) });
    nextIds.push(nid);
  }
  for (const sl of [...p.slabs]) {
    if (!hit.has(sl.id)) continue;
    const nid = uid("sl");
    p.slabs.push({ ...sl, id: nid, polygon: sl.polygon.map(shift) });
    nextIds.push(nid);
  }
  for (const rf of [...p.roofs]) {
    if (!hit.has(rf.id)) continue;
    const nid = uid("rf");
    p.roofs.push({ ...rf, id: nid, polygon: rf.polygon.map(shift) });
    nextIds.push(nid);
  }
  return nextIds;
}

export function addRectWalls(p: Project, storyId: string, a: Vec2, b: Vec2, proto: Partial<Wall>): Project {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  if (maxX - minX < 0.4 || maxY - minY < 0.4) return p;
  const story = p.stories.find((s) => s.id === storyId);
  const corners: Vec2[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  for (let i = 0; i < 4; i++) {
    p.walls.push({
      id: uid("w"),
      storyId,
      a: corners[i]!,
      b: corners[(i + 1) % 4]!,
      thickness: proto.thickness ?? 0.22,
      height: proto.height ?? story?.height ?? 2.8,
      materialId: proto.materialId ?? "plaster",
      loadBearing: proto.loadBearing ?? true,
      partition: proto.partition ?? false,
      insulationMm: proto.insulationMm ?? 80,
      uValue: proto.uValue ?? 0.36,
      fireRating: proto.fireRating ?? "EI60",
      alignment: proto.alignment ?? "center",
      role: proto.role ?? "exterior",
      acousticRw: proto.acousticRw ?? 50,
    });
  }
  p.rooms = mergeDetectedRooms(p, storyId);
  return p;
}

export interface WallSplitResult {
  project: Project;
  /** false laisse le projet strictement intact. */
  ok: boolean;
  reason: "aucun-mur" | "baie-traversee" | null;
}

/** Tolérance d'un nanomètre : une baie affleurant la coupe ne doit pas la refuser. */
const SPLIT_EPS = 1e-9;

/**
 * Coupe un mur en deux au point donné.
 *
 * `wallId` désigne le mur visé quand l'appelant le connaît — c'est le cas des
 * deux seuls appelants réels, le double-tap du plan et « Couper mur ». Sans lui
 * la cible est redéduite par proximité, et à distance égale c'est l'ordre du
 * tableau qui tranche : deux murs parallèles espacés de 30 cm suffisaient à
 * couper le voisin. Passer l'identifiant supprime l'ambiguïté au lieu de la
 * commenter.
 */
export function splitWallAt(
  p: Project,
  storyId: string,
  point: Vec2,
  wallId?: string,
): WallSplitResult {
  let best: { wall: Wall; t: number; closest: Vec2 } | null = null;
  if (wallId) {
    const cible = p.walls.find((w) => w.id === wallId && w.storyId === storyId);
    if (cible) {
      const hit = distToSegment(point, cible.a, cible.b);
      // La bande utile reste la même : trop près d'une extrémité, la coupe ne
      // produirait qu'un tronçon résiduel.
      if (hit.t > 0.08 && hit.t < 0.92) best = { wall: cible, t: hit.t, closest: hit.closest };
    }
  } else {
    let bestD = 0.45;
    for (const w of p.walls) {
      if (w.storyId !== storyId) continue;
      const hit = distToSegment(point, w.a, w.b);
      if (hit.dist < bestD && hit.t > 0.08 && hit.t < 0.92) {
        bestD = hit.dist;
        best = { wall: w, t: hit.t, closest: hit.closest };
      }
    }
  }
  // Le refus pour cause de baie arrive après le choix du candidat : écarter un
  // mur percé pendant la recherche ferait couper son voisin à sa place.
  if (!best) return { project: p, ok: false, reason: "aucun-mur" };
  const { wall, closest } = best;
  const len = dist(wall.a, wall.b) || 1;
  const lenA = dist(wall.a, closest) || 1;
  const lenB = dist(closest, wall.b) || 1;
  // Chaque baie est routée sur son emprise complète, pas sur son seul centre :
  // router au centre envoyait une baie de 3,60 m dans un tronçon de 4,25 m où
  // 1,75 m de percement tombait hors du mur, et le trou réellement creusé avec.
  const routed = new Map<string, { wallSide: "a" | "b"; t: number }>();
  for (const o of p.openings) {
    if (o.wallId !== wall.id) continue;
    const tAbs = o.t * len;
    const half = o.width / 2;
    if (tAbs + half <= lenA + SPLIT_EPS) routed.set(o.id, { wallSide: "a", t: tAbs / lenA });
    else if (tAbs - half >= lenA - SPLIT_EPS) routed.set(o.id, { wallSide: "b", t: (tAbs - lenA) / lenB });
    // Une baie à cheval sur la coupe ne peut tenir dans aucun des deux tronçons.
    else return { project: p, ok: false, reason: "baie-traversee" };
  }
  const idA = uid("w");
  const idB = uid("w");
  p.walls = p.walls.filter((w) => w.id !== wall.id);
  p.walls.push({ ...wall, id: idA, b: closest }, { ...wall, id: idB, a: closest });
  p.openings = p.openings.map((o) => {
    const hit = routed.get(o.id);
    if (!hit) return o;
    return { ...o, wallId: hit.wallSide === "a" ? idA : idB, t: hit.t };
  });
  return { project: p, ok: true, reason: null };
}

export function restackStories(p: Project): Project {
  if (!p.stories.length) return p;
  let elev = p.stories[0]!.elevation;
  p.stories = p.stories.map((st, i) => {
    if (i === 0) {
      elev = st.elevation;
    }
    const next = { ...st, elevation: elev };
    elev += st.height;
    return next;
  });
  return p;
}

export function syncStoryGeometry(p: Project, id: string): Project {
  const st = p.stories.find((s) => s.id === id);
  if (!st) return p;
  p.walls = p.walls.map((w) => (w.storyId === id ? { ...w, height: st.height } : w));
  p.columns = p.columns.map((c) => (c.storyId === id ? { ...c, height: st.height } : c));
  p.stairs = p.stairs.map((s) => (s.storyId === id ? { ...s, rise: st.height } : s));
  return restackStories(p);
}

export function copyStory(p: Project, fromId: string, opts?: { furniture?: boolean; roof?: boolean }): Project {
  const src = p.stories.find((s) => s.id === fromId);
  if (!src) return p;
  const id = uid("st");
  const index = p.stories.findIndex((s) => s.id === fromId);
  const n = p.stories.length;
  const existingGroup = p.stories.find((s) => s.typicalGroup)?.typicalGroup ?? "typ_1";
  const role = "typical" as const;
  const typicalGroup =
    src.role === "typical" && src.typicalGroup ? src.typicalGroup : existingGroup;
  p.stories.push({
    id,
    name: index <= 0 ? `R+${n}` : `R+${n}`,
    elevation: src.elevation + src.height,
    height: src.height,
    finishFloor: src.finishFloor,
    role,
    typicalGroup,
    detached: false,
  });
  const wallMap = new Map<string, string>();
  for (const w of p.walls.filter((x) => x.storyId === fromId)) {
    const nid = uid("w");
    wallMap.set(w.id, nid);
    p.walls.push({ ...w, id: nid, storyId: id, height: src.height });
  }
  for (const o of p.openings) {
    const wid = wallMap.get(o.wallId);
    if (wid) p.openings.push({ ...o, id: uid("op"), wallId: wid });
  }
  for (const r of p.rooms.filter((x) => x.storyId === fromId)) {
    p.rooms.push({ ...r, id: uid("rm"), storyId: id });
  }
  if (opts?.furniture !== false) {
    for (const f of p.furniture.filter((x) => x.storyId === fromId)) {
      p.furniture.push({ ...f, id: uid("fur"), storyId: id });
    }
  }
  for (const c of p.columns.filter((x) => x.storyId === fromId)) {
    p.columns.push({ ...c, id: uid("col"), storyId: id, height: src.height });
  }
  for (const s of p.slabs.filter((x) => x.storyId === fromId)) {
    p.slabs.push({ ...s, id: uid("sl"), storyId: id });
  }
  for (const st of p.stairs.filter((x) => x.storyId === fromId)) {
    p.stairs.push({ ...st, id: uid("stai"), storyId: id, rise: src.height });
  }
  if (opts?.roof) {
    for (const rf of p.roofs.filter((x) => x.storyId === fromId)) {
      p.roofs.push({ ...rf, id: uid("rf"), storyId: id });
    }
  }
  return restackStories(p);
}

export function repeatStories(p: Project, fromId: string, count: number): Project {
  const n = Math.min(80, Math.max(1, Math.round(count)));
  let next = p;
  let src = fromId;
  for (let i = 0; i < n; i++) {
    next = copyStory(next, src, { furniture: false, roof: false });
    src = next.stories[next.stories.length - 1]!.id;
  }
  return next;
}

export function healWallEnds(p: Project, storyId: string, radius = 0.08): Project {
  const walls = p.walls.filter((w) => w.storyId === storyId);
  const pts: Vec2[] = [];
  const push = (v: Vec2) => {
    if (!pts.some((q) => dist(q, v) < radius)) pts.push({ ...v });
  };
  for (const w of walls) {
    push(w.a);
    push(w.b);
  }
  const snap = (v: Vec2) => pts.find((q) => dist(q, v) < radius) ?? v;
  p.walls = p.walls.map((w) =>
    w.storyId === storyId ? { ...w, a: snap(w.a), b: snap(w.b) } : w,
  );
  return p;
}
