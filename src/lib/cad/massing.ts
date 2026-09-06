import {
  addFlatRoof,
  addFurnitureAt,
  addRectRooms,
  addStair,
  cloneProject,
} from "../bim/builder";
import { rectPolygon } from "../bim/geometry";
import type { Project } from "../bim/types";
import { uid } from "../utils";
import { copyStory, repeatStories, restackStories } from "./ops";

export type MassingOpts = {
  width: number;
  depth: number;
  floors: number;
  floorHeight: number;
};

export function nameStories(p: Project): Project {
  const basement = p.stories.some((s) => s.elevation < -0.15 || /^ss/i.test(s.name));
  p.stories = p.stories.map((st, i) => {
    if (basement && i === 0) return { ...st, name: "SS" };
    const n = basement ? i - 1 : i;
    return { ...st, name: n <= 0 ? "RDC" : `R+${n}` };
  });
  return p;
}

export function insertBasement(p: Project): Project {
  const src = p.stories[0];
  if (!src) return p;
  if (src.elevation < -0.1 || /^ss/i.test(src.name)) return p;
  const id = uid("st");
  const h = 2.6;
  p.stories.unshift({
    id,
    name: "SS",
    elevation: src.elevation - h,
    height: h,
    finishFloor: src.finishFloor,
  });
  const wallMap = new Map<string, string>();
  for (const w of p.walls.filter((x) => x.storyId === src.id)) {
    const nid = uid("w");
    wallMap.set(w.id, nid);
    p.walls.push({ ...w, id: nid, storyId: id, height: h, materialId: "concrete" });
  }
  for (const s of p.slabs.filter((x) => x.storyId === src.id)) {
    p.slabs.push({ ...s, id: uid("sl"), storyId: id });
  }
  for (const c of p.columns.filter((x) => x.storyId === src.id)) {
    p.columns.push({ ...c, id: uid("col"), storyId: id, height: h });
  }
  return nameStories(restackStories(p));
}

export function generateMassing(project: Project, opts: MassingOpts): Project {
  const width = Math.min(80, Math.max(8, opts.width));
  const depth = Math.min(60, Math.max(8, opts.depth));
  const floors = Math.min(80, Math.max(1, Math.round(opts.floors)));
  const h = Math.min(8, Math.max(2.4, opts.floorHeight));
  let p = cloneProject(project);
  const base = p.stories[0];
  if (!base) return p;

  p.walls = p.walls.filter((w) => w.storyId !== base.id);
  p.rooms = p.rooms.filter((r) => r.storyId !== base.id);
  p.slabs = p.slabs.filter((s) => s.storyId !== base.id);
  p.openings = p.openings.filter((o) => p.walls.some((w) => w.id === o.wallId));
  p.furniture = p.furniture.filter((f) => f.storyId !== base.id);
  p.columns = p.columns.filter((c) => c.storyId !== base.id);
  p.stairs = p.stairs.filter((s) => s.storyId !== base.id);
  p.roofs = [];
  p.stories = p.stories.slice(0, 1);
  p.stories[0] = {
    ...base,
    name: "RDC",
    elevation: 0,
    height: floors > 1 ? Math.max(h, 3.2) : h,
  };

  const coreW = Math.min(4.2, width * 0.22);
  const left = (width - coreW) / 2;
  const right = width - left - coreW;
  p = addRectRooms(
    p,
    [
      { x: 0, y: 0, w: left, d: depth, name: "A", fn: "living", storyId: base.id },
      { x: left, y: 0, w: coreW, d: depth * 0.55, name: "Noyau", fn: "corridor", storyId: base.id },
      { x: left + coreW, y: 0, w: right, d: depth, name: "B", fn: "office", storyId: base.id },
    ],
    { wallMat: "concrete", thickness: 0.28, height: p.stories[0]!.height },
  );

  const cx = left + coreW / 2;
  p = addFurnitureAt(p, base.id, "elevator", { x: cx, y: 2.1 }, 0);
  p = addFurnitureAt(p, base.id, "staircore", { x: cx, y: 4.4 }, 0);
  p = addStair(p, base.id, { x: left + 0.3, y: 2.8 }, Math.PI / 2, Math.max(3.6, h + 0.4), 1.1);

  if (floors === 1) {
    p = addFlatRoof(p, base.id, rectPolygon(-0.3, -0.3, width + 0.6, depth + 0.6));
    return nameStories(restackStories(p));
  }

  p = copyStory(p, base.id, { furniture: false, roof: false });
  const type = p.stories[1]!;
  type.height = h;
  p.walls = p.walls.map((w) => (w.storyId === type.id ? { ...w, height: h } : w));
  p.columns = p.columns.map((c) => (c.storyId === type.id ? { ...c, height: h } : c));
  p = addFurnitureAt(p, type.id, "elevator", { x: cx, y: 2.1 }, 0);
  p = addFurnitureAt(p, type.id, "staircore", { x: cx, y: 4.4 }, 0);
  p = addStair(p, type.id, { x: left + 0.3, y: 2.8 }, Math.PI / 2, Math.max(3.6, h + 0.4), 1.1);
  p = addFurnitureAt(p, type.id, "balcony", { x: width / 2, y: -0.55 }, 0);
  p = addFurnitureAt(p, type.id, "curtain", { x: 0.08, y: depth / 2 }, Math.PI / 2);

  if (floors > 2) p = repeatStories(p, type.id, floors - 2);
  p = nameStories(restackStories(p));
  p.walls = p.walls.map((w) => {
    const st = p.stories.find((s) => s.id === w.storyId);
    return st ? { ...w, height: st.height } : w;
  });
  const last = p.stories[p.stories.length - 1]!;
  p = addFlatRoof(p, last.id, rectPolygon(-0.3, -0.3, width + 0.6, depth + 0.6));
  p.meta = {
    ...p.meta,
    typology: floors > 3 ? "collective" : p.meta.typology,
    plotM2: Math.max(p.meta.plotM2 ?? 0, Math.ceil(width * depth * 2.4)),
  };
  return p;
}
