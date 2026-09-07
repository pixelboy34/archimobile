import { uid } from "@/lib/utils";
import { OBJECT_SIZES, objectDef } from "./catalog";
import { findWallAt, lerp, polygonArea, rectPolygon, uniqueWallEdges, wallAngle } from "./geometry";
import { defaultLayers } from "./sketch";
import type {
  FurnitureKind,
  MaterialId,
  Opening,
  Project,
  RoomFunction,
  Vec2,
  Wall,
} from "./types";

export function emptyProject(name = "Nouveau projet"): Project {
  const now = new Date().toISOString();
  const storyId = uid("st");
  return {
    id: uid("prj"),
    name,
    createdAt: now,
    updatedAt: now,
    meta: {
      client: "",
      location: "France",
      latitude: 43.3,
      longitude: 5.4,
      north: 0,
      brief: "",
      climate: "H2",
      energyClass: "B",
      year: 2026,
      plotM2: 800,
      ces: 0.4,
      cos: 0.6,
      seismic: "2",
      wind: "2",
      altitude: 12,
      typology: "house",
    },
    stories: [{ id: storyId, name: "RDC", elevation: 0, height: 2.8, role: "ground" }],
    walls: [],
    openings: [],
    slabs: [],
    roofs: [],
    columns: [],
    stairs: [],
    furniture: [],
    rooms: [],
    materials: {},
    layers: defaultLayers(),
    strokes: [],
    survey: [],
    revisions: [{ id: uid("rev"), at: now, note: "Création" }],
  };
}

export function cloneProject(p: Project): Project {
  return structuredClone(p);
}

export function duplicateProject(p: Project): Project {
  const ids = new Map<string, string>();
  const next = (old: string, prefix: string) => {
    const n = uid(prefix);
    ids.set(old, n);
    return n;
  };
  const q = cloneProject(p);
  q.id = uid("prj");
  q.name = `${p.name.replace(/\s*\(copie\)\s*$/i, "")} (copie)`;
  q.createdAt = new Date().toISOString();
  q.stories = q.stories.map((s) => ({ ...s, id: next(s.id, "st") }));
  const sid = (id: string) => ids.get(id) ?? id;
  q.walls = q.walls.map((w) => ({ ...w, id: next(w.id, "w"), storyId: sid(w.storyId) }));
  q.openings = q.openings.map((o) => ({
    ...o,
    id: uid("op"),
    wallId: ids.get(o.wallId) ?? o.wallId,
  }));
  q.rooms = q.rooms.map((r) => ({ ...r, id: uid("rm"), storyId: sid(r.storyId) }));
  q.furniture = q.furniture.map((f) => ({ ...f, id: uid("fur"), storyId: sid(f.storyId) }));
  q.columns = q.columns.map((c) => ({ ...c, id: uid("col"), storyId: sid(c.storyId) }));
  q.stairs = q.stairs.map((s) => ({ ...s, id: uid("stair"), storyId: sid(s.storyId) }));
  q.slabs = q.slabs.map((s) => ({ ...s, id: uid("sl"), storyId: sid(s.storyId) }));
  q.roofs = q.roofs.map((r) => ({ ...r, id: uid("rf"), storyId: sid(r.storyId) }));
  q.layers = (q.layers ?? defaultLayers()).map((l) => ({ ...l, id: next(l.id, "ly") }));
  const lid = (id: string) => ids.get(id) ?? id;
  q.strokes = (q.strokes ?? []).map((s) => ({
    ...s,
    id: uid("sk"),
    layerId: lid(s.layerId),
    storyId: sid(s.storyId),
  }));
  q.survey = (q.survey ?? []).map((s) => ({ ...s, id: uid("sv"), storyId: sid(s.storyId) }));
  if (q.surveyUnderlay) {
    q.surveyUnderlay = {
      ...q.surveyUnderlay,
      storyId: sid(q.surveyUnderlay.storyId),
      offset: { ...q.surveyUnderlay.offset },
    };
  }
  q.revisions = [{ id: uid("rev"), at: q.createdAt, note: "Copie" }];
  return touch(q);
}

export function touch(p: Project): Project {
  return { ...p, updatedAt: new Date().toISOString() };
}

interface RoomSpec {
  x: number;
  y: number;
  w: number;
  d: number;
  name: string;
  fn: RoomFunction;
  storyId: string;
}

export function addRectRooms(
  project: Project,
  rooms: RoomSpec[],
  opts?: { wallMat?: MaterialId; thickness?: number; height?: number },
): Project {
  const next = cloneProject(project);
  const mat = opts?.wallMat ?? "plaster";
  const thickness = opts?.thickness ?? 0.22;
  const polygons = rooms.map((r) => rectPolygon(r.x, r.y, r.w, r.d));
  const edges = uniqueWallEdges(polygons);
  const storyHeights = new Map(next.stories.map((s) => [s.id, s.height]));

  for (const e of edges) {
    const storyId = rooms[0]?.storyId ?? next.stories[0]!.id;
    const height = opts?.height ?? storyHeights.get(storyId) ?? 2.8;
    next.walls.push({
      id: uid("w"),
      storyId,
      a: e.a,
      b: e.b,
      thickness,
    height,
    materialId: mat,
    loadBearing: thickness >= 0.2,
    partition: thickness < 0.12,
    insulationMm: thickness >= 0.3 ? 80 : 0,
    uValue: thickness >= 0.3 ? 0.36 : thickness < 0.12 ? 2.4 : 1.8,
    fireRating: thickness >= 0.2 ? "EI30" : "none",
    alignment: "center",
    role: thickness >= 0.25 ? "exterior" : "interior",
    acousticRw: thickness >= 0.3 ? 52 : thickness < 0.12 ? 32 : 42,
    });
  }

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]!;
    next.rooms.push({
      id: uid("rm"),
      storyId: r.storyId,
      name: r.name,
      function: r.fn,
      polygon: polygons[i]!,
      occupancy: r.fn === "bedroom" ? 2 : r.fn === "living" ? 4 : 1,
      heated: !["terrace", "patio", "garage"].includes(r.fn),
      floorFinish: r.fn === "bath" || r.fn === "wc" || r.fn === "kitchen" ? "stone" : "parquet",
    });
  }

  const byStory = new Map<string, Vec2[][]>();
  for (const r of rooms) {
    const list = byStory.get(r.storyId) ?? [];
    list.push(rectPolygon(r.x, r.y, r.w, r.d));
    byStory.set(r.storyId, list);
  }
  for (const [storyId, polys] of byStory) {
    const xs = polys.flatMap((p) => p.map((v) => v.x));
    const ys = polys.flatMap((p) => p.map((v) => v.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    next.slabs.push({
      id: uid("sl"),
      storyId,
      polygon: rectPolygon(minX, minY, maxX - minX, maxY - minY),
      thickness: 0.22,
      materialId: "concrete",
    });
  }
  return next;
}

export function addOpeningOnWall(
  project: Project,
  wall: Wall,
  kind: "door" | "window",
  t: number,
  width?: number,
  height?: number,
  sill?: number,
): Project {
  const next = cloneProject(project);
  const opening: Opening = {
    id: uid(kind === "door" ? "dr" : "wn"),
    kind,
    wallId: wall.id,
    t,
    width: width ?? (kind === "door" ? 0.9 : 1.5),
    height: height ?? (kind === "door" ? 2.1 : 1.4),
    sill: sill ?? (kind === "door" ? 0 : 0.9),
    materialId: kind === "door" ? "darkwood" : "glass",
    variant: kind === "door" ? "single" : "casement",
    glazing: kind === "window" ? "double" : undefined,
    uValue: kind === "window" ? 1.4 : 1.8,
    frame: 0.06,
    fireRating: kind === "door" ? "EI30" : "none",
    swing: "left",
  };
  next.openings.push(opening);
  return next;
}

export function addFurnitureAt(
  project: Project,
  storyId: string,
  kind: FurnitureKind,
  position: Vec2,
  rotation = 0,
): Project {
  const s = OBJECT_SIZES[kind] ?? OBJECT_SIZES.sofa;
  const hug =
    objectDef(kind).style === "panel" ||
    objectDef(kind).style === "screen" ||
    ["millwork", "radiator", "wallcab", "console", "tv", "artwork", "curtain", "ac", "panelboard", "towelrail"].includes(
      kind,
    );
  const hit = hug ? findWallAt(project, storyId, position, 2.4) : null;
  let pos = position;
  let rot = rotation;
  if (hit) {
    const along = lerp(hit.wall.a, hit.wall.b, hit.t);
    const ang = wallAngle(hit.wall);
    const nx = Math.sin(ang);
    const ny = -Math.cos(ang);
    const off = hit.wall.thickness / 2 + s.d / 2;
    pos = { x: along.x + nx * off, y: along.y + ny * off };
    rot = ang;
  }
  const next = cloneProject(project);
  next.furniture.push({
    id: uid("fn"),
    storyId,
    kind,
    position: pos,
    rotation: rot,
    ...s,
  });
  return next;
}

export function addGableRoof(project: Project, storyId: string, polygon: Vec2[], pitch = 28): Project {
  const next = cloneProject(project);
  next.roofs.push({
    id: uid("rf"),
    storyId,
    polygon,
    kind: "gable",
    pitch,
    overhang: 0.45,
    thickness: 0.18,
    materialId: "terracotta",
  });
  return next;
}


export function addMultiRoof(
  project: Project,
  storyId: string,
  polygon: Vec2[],
  pitches: number[] = [28, 32],
): Project {
  const next = cloneProject(project);
  next.roofs.push({
    id: uid("rf"),
    storyId,
    polygon,
    kind: "multi",
    pitch: pitches[0] ?? 28,
    pitches,
    overhang: 0.4,
    thickness: 0.18,
    materialId: "terracotta",
  });
  return next;
}

export function addFlatRoof(project: Project, storyId: string, polygon: Vec2[]): Project {
  const next = cloneProject(project);
  next.roofs.push({
    id: uid("rf"),
    storyId,
    polygon,
    kind: "flat",
    pitch: 2,
    overhang: 0.15,
    thickness: 0.2,
    materialId: "concrete",
  });
  return next;
}

export function addStair(
  project: Project,
  storyId: string,
  origin: Vec2,
  direction: number,
  run = 3.2,
  width = 0.95,
): Project {
  const next = cloneProject(project);
  const story = next.stories.find((s) => s.id === storyId);
  const rise = story?.height ?? 2.8;
  next.stairs.push({
    id: uid("stair"),
    storyId,
    origin,
    direction,
    width,
    run,
    rise,
    steps: Math.max(12, Math.round(rise / 0.18)),
  });
  return next;
}

export function projectArea(project: Project): number {
  return project.rooms.reduce((s, r) => {
    if (r.function === "terrace" || r.function === "patio") return s;
    return s + polygonArea(r.polygon);
  }, 0);
}

export function placeOpeningNear(
  project: Project,
  storyId: string,
  kind: "door" | "window",
  approx: Vec2,
  width?: number,
  height?: number,
  sill?: number,
): Project {
  const hit = findWallAt(project, storyId, approx, 1.2);
  if (!hit) return project;
  return addOpeningOnWall(project, hit.wall, kind, hit.t, width, height, sill);
}
