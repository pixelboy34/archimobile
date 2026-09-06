import { dist, distToSegment, polygonArea, wallLength, wallMid } from "./geometry";
import type { Column, Project, Slab, Wall } from "./types";

export type IssueLevel = "info" | "warn" | "crit";

export interface StructureIssue {
  level: IssueLevel;
  id?: string;
  text: string;
}

export interface BearingWallStat {
  id: string;
  story: string;
  length: number;
  thickness: number;
  unbraced: number;
  slenderness: number;
  openingRatio: number;
  lineLoad: number;
  material: string;
}

export interface StructureReport {
  system: "murs" | "poteaux" | "mixte";
  bearingMl: number;
  partitionMl: number;
  columns: number;
  slabM2: number;
  maxSpan: number;
  maxUnbraced: number;
  maxLineLoad: number;
  walls: BearingWallStat[];
  issues: StructureIssue[];
  score: number;
}

const EPS = 0.38;

export function isBearingWall(w: Wall): boolean {
  if (w.partition) return false;
  if (w.materialId === "glass") return false;
  if (w.loadBearing === true) return true;
  if (w.loadBearing === false) return false;
  return w.thickness >= 0.2;
}

export function isStructuralColumn(c: Column): boolean {
  return c.structural !== false;
}

export function isStructuralSlab(s: Slab): boolean {
  return !s.outdoor && s.structural !== false;
}

function nearPoint(p: { x: number; y: number }, q: { x: number; y: number }, eps = EPS): boolean {
  return dist(p, q) <= eps;
}

function wallIntersects(a: Wall, b: Wall): boolean {
  if (a.id === b.id) return false;
  return (
    distToSegment(a.a, b.a, b.b).dist < EPS ||
    distToSegment(a.b, b.a, b.b).dist < EPS ||
    distToSegment(b.a, a.a, a.b).dist < EPS ||
    distToSegment(b.b, a.a, a.b).dist < EPS
  );
}

function supportsOnWall(wall: Wall, peers: Wall[], columns: Column[]): number[] {
  const L = wallLength(wall);
  if (L < 0.05) return [0, 1];
  const ts = [0, 1];
  for (const p of peers) {
    if (p.id === wall.id) continue;
    const da = distToSegment(p.a, wall.a, wall.b);
    const db = distToSegment(p.b, wall.a, wall.b);
    if (da.dist < EPS) ts.push(da.t);
    if (db.dist < EPS) ts.push(db.t);
    const ma = distToSegment(wall.a, p.a, p.b);
    const mb = distToSegment(wall.b, p.a, p.b);
    if (ma.dist < EPS) ts.push(0);
    if (mb.dist < EPS) ts.push(1);
  }
  for (const c of columns) {
    const hit = distToSegment(c.position, wall.a, wall.b);
    if (hit.dist < EPS + c.width) ts.push(hit.t);
  }
  return [...new Set(ts.map((t) => Math.min(1, Math.max(0, t))))].sort((a, b) => a - b);
}

function maxGap(ts: number[], length: number): number {
  let max = 0;
  for (let i = 1; i < ts.length; i++) max = Math.max(max, (ts[i]! - ts[i - 1]!) * length);
  return max || length;
}

function slabSupports(slab: Slab, walls: Wall[]): number {
  if (slab.polygon.length < 2) return 0;
  let supported = 0;
  const n = slab.polygon.length;
  for (let i = 0; i < n; i++) {
    const a = slab.polygon[i]!;
    const b = slab.polygon[(i + 1) % n]!;
    const edge = dist(a, b);
    if (edge < 0.6) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const hit = walls.some((w) => distToSegment(mid, w.a, w.b).dist < 0.45);
    if (hit) supported += edge;
  }
  return supported;
}

function bboxSpan(poly: { x: number; y: number }[]): { w: number; d: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { w: maxX - minX, d: maxY - minY };
}

export function analyzeStructure(project: Project): StructureReport {
  const issues: StructureIssue[] = [];
  const walls: BearingWallStat[] = [];
  let bearingMl = 0;
  let partitionMl = 0;
  let maxUnbraced = 0;
  let maxSpan = 0;
  let maxLineLoad = 0;

  const structCols = project.columns.filter(isStructuralColumn);

  for (const story of project.stories) {
    const storyWalls = project.walls.filter((w) => w.storyId === story.id);
    const bearing = storyWalls.filter(isBearingWall);
    const cols = structCols.filter((c) => c.storyId === story.id);
    const slabs = project.slabs.filter((s) => s.storyId === story.id && isStructuralSlab(s));
    const slabArea = slabs.reduce((s, sl) => s + polygonArea(sl.polygon), 0);
    const live = slabs.reduce((s, sl) => s + polygonArea(sl.polygon) * ((sl.liveLoad ?? 150) / 100), 0);
    const dead = slabs.reduce((s, sl) => s + polygonArea(sl.polygon) * (sl.thickness * 25 + 1.2), 0);
    const service = dead + live;
    const ml = bearing.reduce((s, w) => s + wallLength(w), 0);

    for (const w of storyWalls) {
      const L = wallLength(w);
      if (isBearingWall(w)) bearingMl += L;
      else partitionMl += L;
    }

    for (const w of bearing) {
      const L = wallLength(w);
      const ts = supportsOnWall(w, bearing, cols);
      const unbraced = maxGap(ts, L);
      const slenderness = w.thickness > 0.04 ? unbraced / w.thickness : 99;
      const openings = project.openings.filter((o) => o.wallId === w.id);
      const openW = openings.reduce((s, o) => s + o.width, 0);
      const openingRatio = L > 0.1 ? openW / L : 0;
      const tributary = ml > 0.5 ? slabArea / ml : 0;
      const lineLoad = tributary * (slabArea > 0 ? service / slabArea : 0);
      maxUnbraced = Math.max(maxUnbraced, unbraced);
      maxLineLoad = Math.max(maxLineLoad, lineLoad);
      walls.push({
        id: w.id,
        story: story.name,
        length: L,
        thickness: w.thickness,
        unbraced,
        slenderness,
        openingRatio,
        lineLoad,
        material: w.materialId,
      });

      if (w.materialId === "glass") {
        issues.push({
          level: "crit",
          id: w.id,
          text: `${story.name} — mur vitrée ${L.toFixed(1)} m déclaré porteur`,
        });
      }
      if (slenderness > 27) {
        issues.push({
          level: "crit",
          id: w.id,
          text: `${story.name} — élancement ${slenderness.toFixed(0)} (L/e) > 27, mur ${L.toFixed(1)} m trop mince`,
        });
      } else if (unbraced > 6.5) {
        issues.push({
          level: "warn",
          id: w.id,
          text: `${story.name} — longueur libre ${unbraced.toFixed(1)} m sans contreventement`,
        });
      }
      if (openingRatio > 0.55) {
        issues.push({
          level: "warn",
          id: w.id,
          text: `${story.name} — baies ${Math.round(openingRatio * 100)} % du porteur, linteau / chaînage à prévoir`,
        });
      }
      const endsFree = ts.length <= 2 && L > 3.2 && !wallIntersects(w, bearing[0] ?? w);
      const aSupported = bearing.some((p) => p.id !== w.id && (nearPoint(w.a, p.a) || nearPoint(w.a, p.b) || distToSegment(w.a, p.a, p.b).dist < EPS));
      const bSupported = bearing.some((p) => p.id !== w.id && (nearPoint(w.b, p.a) || nearPoint(w.b, p.b) || distToSegment(w.b, p.a, p.b).dist < EPS));
      const colA = cols.some((c) => nearPoint(c.position, w.a, 0.5));
      const colB = cols.some((c) => nearPoint(c.position, w.b, 0.5));
      if ((!aSupported && !colA) || (!bSupported && !colB)) {
        if (L > 2 && endsFree) {
          issues.push({
            level: "warn",
            id: w.id,
            text: `${story.name} — extrémité de mur porteur non reprise`,
          });
        }
      }
    }

    for (const sl of slabs) {
      const span = bboxSpan(sl.polygon);
      const short = Math.min(span.w, span.d);
      maxSpan = Math.max(maxSpan, short);
      const support = slabSupports(sl, bearing);
      const peri = span.w * 2 + span.d * 2;
      if (short > 6.5 && bearing.length + cols.length < 3) {
        issues.push({
          level: "warn",
          id: sl.id,
          text: `${story.name} — portée de plancher ${short.toFixed(1)} m, reprise intermédiaire conseillée`,
        });
      }
      if (peri > 1 && support / peri < 0.35 && !sl.outdoor) {
        issues.push({
          level: "warn",
          id: sl.id,
          text: `${story.name} — dalle peu appuyée (${Math.round((support / peri) * 100)} % du périmètre)`,
        });
      }
    }
  }

  for (let i = 1; i < project.stories.length; i++) {
    const upper = project.stories[i]!;
    const lower = project.stories[i - 1]!;
    const upW = project.walls.filter((w) => w.storyId === upper.id && isBearingWall(w));
    const lowW = project.walls.filter((w) => w.storyId === lower.id && isBearingWall(w));
    const lowC = structCols.filter((c) => c.storyId === lower.id);
    for (const w of upW) {
      const mid = wallMid(w);
      const onWall = lowW.some((lw) => distToSegment(mid, lw.a, lw.b).dist < 0.5);
      const onCol = lowC.some((c) => dist(mid, c.position) < 0.7);
      if (!onWall && !onCol) {
        issues.push({
          level: "crit",
          id: w.id,
          text: `${upper.name} — porteur non repris au ${lower.name}`,
        });
      }
    }
  }

  if (bearingMl < 4 && structCols.length === 0 && project.walls.length > 0) {
    issues.push({ level: "crit", text: "Aucun ouvrage porteur identifié — marquez les murs porteurs" });
  }

  const colN = structCols.length;
  const system: StructureReport["system"] =
    colN >= 3 && bearingMl < 20 ? "poteaux" : colN >= 2 && bearingMl >= 12 ? "mixte" : "murs";

  const slabM2 = project.slabs.filter(isStructuralSlab).reduce((s, sl) => s + polygonArea(sl.polygon), 0);
  const crit = issues.filter((i) => i.level === "crit").length;
  const warn = issues.filter((i) => i.level === "warn").length;
  const score = Math.max(12, Math.min(100, 92 - crit * 18 - warn * 7));

  walls.sort((a, b) => b.lineLoad - a.lineLoad);

  return {
    system,
    bearingMl,
    partitionMl,
    columns: colN,
    slabM2,
    maxSpan,
    maxUnbraced,
    maxLineLoad,
    walls,
    issues,
    score,
  };
}

export function markLoadBearing(project: Project): Project {
  return {
    ...project,
    walls: project.walls.map((w) => {
      const glass = w.materialId === "glass";
      const bearing = !glass && (w.thickness >= 0.2 || w.role === "exterior" || w.role === "party");
      return {
        ...w,
        loadBearing: bearing,
        partition: !bearing && w.thickness < 0.12,
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}
