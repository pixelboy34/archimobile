import {
  addFlatRoof,
  addFurnitureAt,
  addGableRoof,
  addOpeningOnWall,
  addRectRooms,
  addStair,
  cloneProject,
} from "../bim/builder";
import { rectPolygon, wallLength, wallMid } from "../bim/geometry";
import type { Project, RoofKind, Vec2, Wall } from "../bim/types";
import { uid } from "../utils";
import { copyStory, repeatStories, restackStories } from "./ops";

export type CoreSide = "center" | "left" | "right" | "back";

export type MassingOpts = {
  width: number;
  depth: number;
  floors: number;
  floorHeight: number;
  /** Hauteur RDC — défaut max(floorHeight, 3.2) si multi-étages */
  groundHeight?: number;
  /** Espacement module fenêtres (m) */
  windowSpacing?: number;
  /** Allège fenêtres (m) */
  windowSill?: number;
  /** Largeur × hauteur fenêtre */
  windowWidth?: number;
  windowHeight?: number;
  /** Grille de poteaux */
  columns?: boolean;
  columnSpacing?: number;
  roofKind?: RoofKind;
  roofPitch?: number;
  coreSide?: CoreSide;
  balconyDepth?: number;
  /** Retrait façade rue (Y=0) aux étages courants */
  setback?: number;
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
  for (const o of p.openings) {
    const wid = wallMap.get(o.wallId);
    if (wid) p.openings.push({ ...o, id: uid("op"), wallId: wid });
  }
  for (const s of p.slabs.filter((x) => x.storyId === src.id)) {
    p.slabs.push({ ...s, id: uid("sl"), storyId: id });
  }
  for (const c of p.columns.filter((x) => x.storyId === src.id)) {
    p.columns.push({ ...c, id: uid("col"), storyId: id, height: h });
  }
  return nameStories(restackStories(p));
}

function coreLayout(width: number, depth: number, side: CoreSide) {
  const coreW = Math.min(4.2, width * 0.22);
  const coreD = Math.min(depth * 0.55, depth - 1.2);
  if (side === "left") {
    return {
      coreW,
      coreD,
      left: 0,
      right: width - coreW,
      coreX: 0,
      rooms: [
        { x: 0, y: 0, w: coreW, d: coreD, name: "Noyau", fn: "corridor" as const },
        { x: coreW, y: 0, w: width - coreW, d: depth, name: "A", fn: "living" as const },
      ],
      elevX: coreW / 2,
      elevY: Math.min(2.1, coreD * 0.45),
      stairX: 0.3,
      stairY: Math.min(2.8, coreD * 0.55),
    };
  }
  if (side === "right") {
    return {
      coreW,
      coreD,
      left: width - coreW,
      right: 0,
      coreX: width - coreW,
      rooms: [
        { x: 0, y: 0, w: width - coreW, d: depth, name: "A", fn: "living" as const },
        { x: width - coreW, y: 0, w: coreW, d: coreD, name: "Noyau", fn: "corridor" as const },
      ],
      elevX: width - coreW / 2,
      elevY: Math.min(2.1, coreD * 0.45),
      stairX: width - coreW + 0.3,
      stairY: Math.min(2.8, coreD * 0.55),
    };
  }
  if (side === "back") {
    const backD = Math.min(3.6, depth * 0.28);
    return {
      coreW: width * 0.36,
      coreD: backD,
      left: (width - width * 0.36) / 2,
      right: (width - width * 0.36) / 2,
      coreX: (width - width * 0.36) / 2,
      rooms: [
        { x: 0, y: 0, w: width, d: depth - backD, name: "A", fn: "living" as const },
        {
          x: (width - width * 0.36) / 2,
          y: depth - backD,
          w: width * 0.36,
          d: backD,
          name: "Noyau",
          fn: "corridor" as const,
        },
      ],
      elevX: width / 2,
      elevY: depth - backD / 2,
      stairX: (width - width * 0.36) / 2 + 0.3,
      stairY: depth - backD + 0.4,
    };
  }
  // center
  const left = (width - coreW) / 2;
  const right = width - left - coreW;
  return {
    coreW,
    coreD,
    left,
    right,
    coreX: left,
    rooms: [
      { x: 0, y: 0, w: left, d: depth, name: "A", fn: "living" as const },
      { x: left, y: 0, w: coreW, d: coreD, name: "Noyau", fn: "corridor" as const },
      { x: left + coreW, y: 0, w: right, d: depth, name: "B", fn: "office" as const },
    ],
    elevX: left + coreW / 2,
    elevY: Math.min(2.1, coreD * 0.4),
    stairX: left + 0.3,
    stairY: Math.min(2.8, coreD * 0.55),
  };
}

function isPerimeterWall(w: Wall, width: number, depth: number, ox = 0, oy = 0): boolean {
  const mid = wallMid(w);
  const eps = 0.35;
  const minX = ox;
  const maxX = ox + width;
  const minY = oy;
  const maxY = oy + depth;
  return (
    Math.abs(mid.x - minX) < eps ||
    Math.abs(mid.x - maxX) < eps ||
    Math.abs(mid.y - minY) < eps ||
    Math.abs(mid.y - maxY) < eps
  );
}

function markExteriorWalls(p: Project, storyId: string, width: number, depth: number, ox = 0, oy = 0): Project {
  p.walls = p.walls.map((w) => {
    if (w.storyId !== storyId) return w;
    const exterior = isPerimeterWall(w, width, depth, ox, oy);
    return {
      ...w,
      role: exterior ? "exterior" : "interior",
      partition: !exterior && w.thickness < 0.3,
      loadBearing: exterior || w.thickness >= 0.25,
    };
  });
  return p;
}

function punchFacadeGrid(
  p: Project,
  storyId: string,
  opts: {
    width: number;
    depth: number;
    ox?: number;
    oy?: number;
    spacing: number;
    sill: number;
    winW: number;
    winH: number;
    entrance?: boolean;
  },
): Project {
  const ox = opts.ox ?? 0;
  const oy = opts.oy ?? 0;
  const walls = p.walls.filter((w) => w.storyId === storyId && isPerimeterWall(w, opts.width, opts.depth, ox, oy));
  let next = p;
  for (const wall of walls) {
    const len = wallLength(wall);
    if (len < 1.4) continue;
    const margin = Math.max(0.55, opts.winW * 0.55);
    const usable = len - 2 * margin;
    if (usable < opts.winW * 0.8) continue;
    const count = Math.max(1, Math.floor((usable + opts.spacing * 0.25) / opts.spacing));
    const step = usable / count;
    for (let i = 0; i < count; i++) {
      const along = margin + step * (i + 0.5);
      const t = along / len;
      // skip if too close to an existing opening
      const clash = next.openings.some((o) => {
        if (o.wallId !== wall.id) return false;
        return Math.abs(o.t - t) * len < (o.width + opts.winW) * 0.55;
      });
      if (clash) continue;
      next = addOpeningOnWall(next, wall, "window", t, opts.winW, opts.winH, opts.sill);
    }
  }
  if (opts.entrance) {
    // Porte d'entrée façade rue (Y min)
    const front = walls
      .filter((w) => Math.abs(wallMid(w).y - oy) < 0.4)
      .sort((a, b) => wallLength(b) - wallLength(a))[0];
    if (front) {
      const mid = wallMid(front);
      // Prefer center of building width
      const targetX = ox + opts.width / 2;
      const len = wallLength(front);
      const t =
        Math.abs(front.b.x - front.a.x) > 0.2
          ? Math.min(0.85, Math.max(0.15, (targetX - front.a.x) / (front.b.x - front.a.x)))
          : 0.5;
      // Remove window near door
      next.openings = next.openings.filter((o) => {
        if (o.wallId !== front.id) return true;
        return Math.abs(o.t - t) * len > 1.1;
      });
      next = addOpeningOnWall(next, front, "door", t, 1.1, 2.2, 0);
      void mid;
    }
  }
  return next;
}

function addColumnGrid(
  p: Project,
  storyId: string,
  width: number,
  depth: number,
  height: number,
  spacing: number,
  ox = 0,
  oy = 0,
): Project {
  const next = cloneProject(p);
  const inset = 0.55;
  const colsX: number[] = [];
  const colsY: number[] = [];
  for (let x = ox + inset; x <= ox + width - inset + 0.01; x += spacing) colsX.push(x);
  for (let y = oy + inset; y <= oy + depth - inset + 0.01; y += spacing) colsY.push(y);
  // ensure last ring near edge
  const lastX = ox + width - inset;
  const lastY = oy + depth - inset;
  if (colsX.length && Math.abs(colsX[colsX.length - 1]! - lastX) > 0.4) colsX.push(lastX);
  if (colsY.length && Math.abs(colsY[colsY.length - 1]! - lastY) > 0.4) colsY.push(lastY);
  for (const x of colsX) {
    for (const y of colsY) {
      next.columns.push({
        id: uid("col"),
        storyId,
        position: { x, y },
        width: 0.35,
        depth: 0.35,
        height,
        materialId: "concrete",
        shape: "rect",
        structural: true,
      });
    }
  }
  return next;
}

function addRoofFor(
  p: Project,
  storyId: string,
  poly: Vec2[],
  kind: RoofKind,
  pitch: number,
): Project {
  if (kind === "gable") return addGableRoof(p, storyId, poly, pitch);
  if (kind === "shed" || kind === "hip") {
    const next = cloneProject(p);
    next.roofs.push({
      id: uid("rf"),
      storyId,
      polygon: poly,
      kind: kind === "hip" ? "hip" : "shed",
      pitch: kind === "shed" ? Math.min(pitch, 18) : pitch,
      overhang: kind === "shed" ? 0.3 : 0.45,
      thickness: 0.18,
      materialId: kind === "shed" ? "zinc" : "terracotta",
    });
    return next;
  }
  return addFlatRoof(p, storyId, poly);
}

function buildFloorPlate(
  p: Project,
  storyId: string,
  width: number,
  depth: number,
  height: number,
  layout: ReturnType<typeof coreLayout>,
  ox: number,
  oy: number,
): Project {
  let next = addRectRooms(
    p,
    layout.rooms.map((r) => ({
      x: r.x + ox,
      y: r.y + oy,
      w: r.w,
      d: r.d,
      name: r.name,
      fn: r.fn,
      storyId,
    })),
    { wallMat: "concrete", thickness: 0.28, height },
  );
  next = markExteriorWalls(next, storyId, width, depth, ox, oy);
  return next;
}

export function generateMassing(project: Project, opts: MassingOpts): Project {
  const width = Math.min(80, Math.max(8, opts.width));
  const depth = Math.min(60, Math.max(8, opts.depth));
  const floors = Math.min(80, Math.max(1, Math.round(opts.floors)));
  const h = Math.min(8, Math.max(2.4, opts.floorHeight));
  const groundH = Math.min(8, Math.max(2.4, opts.groundHeight ?? (floors > 1 ? Math.max(h, 3.2) : h)));
  const spacing = Math.min(6, Math.max(1.6, opts.windowSpacing ?? 3.0));
  const sill = Math.min(1.4, Math.max(0.2, opts.windowSill ?? 0.9));
  const winW = Math.min(2.8, Math.max(0.8, opts.windowWidth ?? 1.4));
  const winH = Math.min(2.6, Math.max(0.8, opts.windowHeight ?? 1.4));
  const wantCols = opts.columns !== false;
  const colSpan = Math.min(8, Math.max(3.5, opts.columnSpacing ?? 5.5));
  const roofKind: RoofKind = opts.roofKind ?? "flat";
  const roofPitch = opts.roofPitch ?? (roofKind === "gable" ? 28 : roofKind === "shed" ? 12 : 2);
  const coreSide: CoreSide = opts.coreSide ?? "center";
  const balconyDepth = Math.min(2.4, Math.max(0, opts.balconyDepth ?? 1.1));
  const setback = Math.min(depth * 0.35, Math.max(0, opts.setback ?? 0));

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
    height: groundH,
  };

  const layout = coreLayout(width, depth, coreSide);
  p = buildFloorPlate(p, base.id, width, depth, groundH, layout, 0, 0);
  p = punchFacadeGrid(p, base.id, {
    width,
    depth,
    spacing,
    sill,
    winW,
    winH,
    entrance: true,
  });
  if (wantCols) p = addColumnGrid(p, base.id, width, depth, groundH, colSpan);

  p = addFurnitureAt(p, base.id, "elevator", { x: layout.elevX, y: layout.elevY }, 0);
  p = addFurnitureAt(p, base.id, "staircore", { x: layout.elevX, y: layout.elevY + 2.2 }, 0);
  p = addStair(
    p,
    base.id,
    { x: layout.stairX, y: layout.stairY },
    Math.PI / 2,
    Math.max(3.6, groundH + 0.4),
    1.1,
  );

  if (floors === 1) {
    p = addRoofFor(p, base.id, rectPolygon(-0.3, -0.3, width + 0.6, depth + 0.6), roofKind, roofPitch);
    return nameStories(restackStories(p));
  }

  // Typical floor — optional setback on street façade
  const typW = width;
  const typD = Math.max(6, depth - setback);
  const typOx = 0;
  const typOy = setback;
  const typLayout = coreLayout(typW, typD, coreSide);

  p = copyStory(p, base.id, { furniture: false, roof: false });
  const type = p.stories[1]!;
  type.height = h;

  // Replace geometry if setback changes footprint
  if (setback > 0.05) {
    p.walls = p.walls.filter((w) => w.storyId !== type.id);
    p.rooms = p.rooms.filter((r) => r.storyId !== type.id);
    p.slabs = p.slabs.filter((s) => s.storyId !== type.id);
    p.columns = p.columns.filter((c) => c.storyId !== type.id);
    p.openings = p.openings.filter((o) => p.walls.some((w) => w.id === o.wallId));
    p.stairs = p.stairs.filter((s) => s.storyId !== type.id);
    p = buildFloorPlate(p, type.id, typW, typD, h, typLayout, typOx, typOy);
    p = punchFacadeGrid(p, type.id, {
      width: typW,
      depth: typD,
      ox: typOx,
      oy: typOy,
      spacing,
      sill,
      winW,
      winH,
      entrance: false,
    });
    if (wantCols) p = addColumnGrid(p, type.id, typW, typD, h, colSpan, typOx, typOy);
    p = addStair(
      p,
      type.id,
      { x: typLayout.stairX + typOx, y: typLayout.stairY + typOy },
      Math.PI / 2,
      Math.max(3.6, h + 0.4),
      1.1,
    );
  } else {
    // Openings already copied with walls; refresh heights + punch if RDC had different pattern only
    p.walls = p.walls.map((w) => (w.storyId === type.id ? { ...w, height: h } : w));
    p.columns = p.columns.map((c) => (c.storyId === type.id ? { ...c, height: h } : c));
    // Ensure façade openings exist on type (copyStory already clones openings)
    const hasWin = p.openings.some((o) => {
      const wall = p.walls.find((w) => w.id === o.wallId);
      return wall?.storyId === type.id && o.kind === "window";
    });
    if (!hasWin) {
      p = punchFacadeGrid(p, type.id, {
        width,
        depth,
        spacing,
        sill,
        winW,
        winH,
        entrance: false,
      });
    }
    // Strip RDC entrance door clones on upper floors
    p.openings = p.openings.filter((o) => {
      const wall = p.walls.find((w) => w.id === o.wallId);
      if (!wall || wall.storyId !== type.id) return true;
      return o.kind !== "door" || o.sill > 0.05;
    });
    // stairs already cloned by copyStory — sync rise
    p.stairs = p.stairs.map((s) => (s.storyId === type.id ? { ...s, rise: h } : s));
  }

  p = addFurnitureAt(
    p,
    type.id,
    "elevator",
    { x: typLayout.elevX + typOx, y: typLayout.elevY + typOy },
    0,
  );
  p = addFurnitureAt(
    p,
    type.id,
    "staircore",
    { x: typLayout.elevX + typOx, y: typLayout.elevY + typOy + 2.2 },
    0,
  );
  if (balconyDepth > 0.2) {
    p = addFurnitureAt(
      p,
      type.id,
      "balcony",
      { x: width / 2, y: typOy - balconyDepth * 0.45 },
      0,
    );
  }
  p = addFurnitureAt(
    p,
    type.id,
    "curtain",
    { x: typOx + 0.08, y: typOy + typD / 2 },
    Math.PI / 2,
  );

  if (floors > 2) p = repeatStories(p, type.id, floors - 2);
  p = nameStories(restackStories(p));
  p.walls = p.walls.map((w) => {
    const st = p.stories.find((s) => s.id === w.storyId);
    return st ? { ...w, height: st.height } : w;
  });
  p.columns = p.columns.map((c) => {
    const st = p.stories.find((s) => s.id === c.storyId);
    return st ? { ...c, height: st.height } : c;
  });
  const last = p.stories[p.stories.length - 1]!;
  const roofPoly =
    setback > 0.05
      ? rectPolygon(typOx - 0.3, typOy - 0.3, typW + 0.6, typD + 0.6)
      : rectPolygon(-0.3, -0.3, width + 0.6, depth + 0.6);
  p = addRoofFor(p, last.id, roofPoly, roofKind, roofPitch);
  p.meta = {
    ...p.meta,
    typology: floors > 3 ? "collective" : p.meta.typology,
    plotM2: Math.max(p.meta.plotM2 ?? 0, Math.ceil(width * depth * 2.4)),
  };
  return p;
}

/** Copie murs / baies / pièces / poteaux / mobilier de l’étage source vers tous les étages au-dessus (hors toiture). */
export function propagateTypicalFloor(project: Project, fromId: string): Project {
  let p = cloneProject(project);
  const src = p.stories.find((s) => s.id === fromId);
  if (!src) return p;
  const idx = p.stories.findIndex((s) => s.id === fromId);
  if (idx < 0 || idx >= p.stories.length - 1) return p;

  const srcWalls = p.walls.filter((w) => w.storyId === fromId);
  const srcOpenings = p.openings.filter((o) => srcWalls.some((w) => w.id === o.wallId));
  const srcRooms = p.rooms.filter((r) => r.storyId === fromId);
  const srcCols = p.columns.filter((c) => c.storyId === fromId);
  const srcFurn = p.furniture.filter((f) => f.storyId === fromId);
  const srcStairs = p.stairs.filter((s) => s.storyId === fromId);
  const srcSlabs = p.slabs.filter((s) => s.storyId === fromId);

  for (let i = idx + 1; i < p.stories.length; i++) {
    const st = p.stories[i]!;
    const keepRoof = p.roofs.filter((r) => r.storyId === st.id);
    p.walls = p.walls.filter((w) => w.storyId !== st.id);
    p.rooms = p.rooms.filter((r) => r.storyId !== st.id);
    p.columns = p.columns.filter((c) => c.storyId !== st.id);
    p.furniture = p.furniture.filter((f) => f.storyId !== st.id);
    p.stairs = p.stairs.filter((s) => s.storyId !== st.id);
    p.slabs = p.slabs.filter((s) => s.storyId !== st.id);
    p.openings = p.openings.filter((o) => p.walls.some((w) => w.id === o.wallId));
    p.roofs = p.roofs.filter((r) => r.storyId !== st.id).concat(keepRoof);

    const wallMap = new Map<string, string>();
    for (const w of srcWalls) {
      const nid = uid("w");
      wallMap.set(w.id, nid);
      p.walls.push({ ...w, id: nid, storyId: st.id, height: st.height });
    }
    for (const o of srcOpenings) {
      const wid = wallMap.get(o.wallId);
      if (wid) p.openings.push({ ...o, id: uid("op"), wallId: wid });
    }
    for (const r of srcRooms) p.rooms.push({ ...r, id: uid("rm"), storyId: st.id });
    for (const c of srcCols) p.columns.push({ ...c, id: uid("col"), storyId: st.id, height: st.height });
    for (const f of srcFurn) p.furniture.push({ ...f, id: uid("fur"), storyId: st.id });
    for (const s of srcStairs) p.stairs.push({ ...s, id: uid("stai"), storyId: st.id, rise: st.height });
    for (const s of srcSlabs) p.slabs.push({ ...s, id: uid("sl"), storyId: st.id });
  }
  return restackStories(p);
}

export function massingFootprintHint(opts: Pick<MassingOpts, "width" | "depth" | "floors">): string {
  const n = Math.max(0, Math.round(opts.floors) - 1);
  return n <= 0 ? "RDC" : `R+${n}`;
}

// silence unused in edge cases
