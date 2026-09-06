/**
 * Relevé / traits → murs BIM.
 * Polygone de points survey → murs extérieurs (+ dalle / pièce optionnelles).
 * Traits (strokes) → segments de mur, puis heal des extrémités.
 */
import { uid } from "@/lib/utils";
import { cloneProject } from "./builder";
import { dist } from "./geometry";
import { mergeDetectedRooms } from "./rooms";
import type { Project, Vec2, Wall } from "./types";
import { healWallEnds } from "@/lib/cad/ops";

export type SurveyToWallsOpts = {
  thickness?: number;
  /** Effacer les points survey de l’étage (défaut true). */
  clearSurvey?: boolean;
  /** Ajouter une dalle sur le polygone (défaut true). */
  addSlab?: boolean;
  /** Ajouter une pièce « Relevé » (défaut true). */
  addRoom?: boolean;
};

export type StrokesToWallsOpts = {
  thickness?: number;
  /** Effacer les traits de l’étage (défaut true). */
  clearStrokes?: boolean;
  /** Distance de snap des extrémités avant heal (défaut 0.12). */
  snapEnds?: number;
};

export type WallsFromSketchResult = {
  project: Project;
  wallCount: number;
  perimeter: number;
};

function dedupeConsecutive(pts: Vec2[], eps = 0.04): Vec2[] {
  if (!pts.length) return [];
  const out: Vec2[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    if (dist(out[out.length - 1]!, p) >= eps) out.push(p);
  }
  return out;
}

/** Périmètre fermé (≥3 points) — dernier→premier inclus. */
export function closedSurveyPerimeter(points: Vec2[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += dist(points[i - 1]!, points[i]!);
  if (points.length >= 3) sum += dist(points[points.length - 1]!, points[0]!);
  return sum;
}

function makeExteriorWall(
  storyId: string,
  a: Vec2,
  b: Vec2,
  height: number,
  thickness: number,
): Wall {
  return {
    id: uid("w"),
    storyId,
    a: { ...a },
    b: { ...b },
    thickness,
    height,
    materialId: "concrete",
    loadBearing: true,
    partition: false,
    insulationMm: 80,
    uValue: 0.36,
    fireRating: "EI60",
    alignment: "center",
    role: "exterior",
    acousticRw: 50,
  };
}

/**
 * Si ≥3 points survey sur l’étage : ferme le polygone, crée des murs extérieurs (~0.2 m),
 * optionnellement dalle + pièce, puis heal.
 */
export function surveyPolygonToWalls(
  project: Project,
  storyId: string,
  opts: SurveyToWallsOpts = {},
): WallsFromSketchResult {
  const thickness = opts.thickness ?? 0.2;
  const clearSurvey = opts.clearSurvey !== false;
  const addSlab = opts.addSlab !== false;
  const addRoom = opts.addRoom !== false;

  let p = cloneProject(project);
  const raw = (p.survey ?? [])
    .filter((s) => s.storyId === storyId)
    .map((s) => s.position);
  const pts = dedupeConsecutive(raw);
  if (pts.length < 3) {
    return { project: p, wallCount: 0, perimeter: 0 };
  }

  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const ring = dist(first, last) < 0.08 ? pts : [...pts, first];
  const poly = dedupeConsecutive(ring);
  if (poly.length < 4) {
    // besoin de ≥3 sommets + fermeture
    return { project: p, wallCount: 0, perimeter: 0 };
  }

  const story = p.stories.find((s) => s.id === storyId);
  const height = story?.height ?? 2.8;
  let wallCount = 0;
  let perimeter = 0;

  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const len = dist(a, b);
    if (len < 0.12) continue;
    p.walls.push(makeExteriorWall(storyId, a, b, height, thickness));
    wallCount++;
    perimeter += len;
  }

  const interior = poly.slice(0, -1);
  if (interior.length >= 3) {
    if (addSlab) {
      const hasSlab = p.slabs.some(
        (s) => s.storyId === storyId && s.polygon.length === interior.length,
      );
      if (!hasSlab) {
        p.slabs.push({
          id: uid("sl"),
          storyId,
          polygon: interior.map((v) => ({ ...v })),
          thickness: 0.2,
          materialId: "concrete",
        });
      }
    }
    if (addRoom) {
      p.rooms.push({
        id: uid("rm"),
        storyId,
        name: "Relevé",
        function: "other",
        polygon: interior.map((v) => ({ ...v })),
        heated: true,
      });
    }
  }

  p.rooms = mergeDetectedRooms(p, storyId);
  if (clearSurvey) {
    p.survey = (p.survey ?? []).filter((s) => s.storyId !== storyId);
  }
  p = healWallEnds(p, storyId, 0.1);
  return { project: p, wallCount, perimeter };
}

/**
 * Chaque trait (≥2 points) → segments de mur. Snap des extrémités proches via heal.
 */
export function strokesToWalls(
  project: Project,
  storyId: string,
  opts: StrokesToWallsOpts = {},
): WallsFromSketchResult {
  const thickness = opts.thickness ?? 0.2;
  const clearStrokes = opts.clearStrokes !== false;
  const snapR = opts.snapEnds ?? 0.12;

  let p = cloneProject(project);
  const strokes = (p.strokes ?? []).filter(
    (s) => s.storyId === storyId && (s.points?.length ?? 0) >= 2,
  );
  if (!strokes.length) {
    return { project: p, wallCount: 0, perimeter: 0 };
  }

  const story = p.stories.find((s) => s.id === storyId);
  const height = story?.height ?? 2.8;
  let wallCount = 0;
  let perimeter = 0;

  for (const stroke of strokes) {
    const pts = dedupeConsecutive(stroke.points, 0.06);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const len = dist(a, b);
      if (len < 0.15) continue;
      p.walls.push(makeExteriorWall(storyId, a, b, height, thickness));
      wallCount++;
      perimeter += len;
    }
  }

  p.rooms = mergeDetectedRooms(p, storyId);
  if (clearStrokes) {
    p.strokes = (p.strokes ?? []).filter((s) => s.storyId !== storyId);
  }
  p = healWallEnds(p, storyId, snapR);
  return { project: p, wallCount, perimeter };
}
