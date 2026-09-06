import { uid } from "@/lib/utils";
import type { Project, SketchLayer, Stroke, SurveyPoint, Vec2 } from "./types";
import { dist } from "./geometry";

export function defaultLayers(): SketchLayer[] {
  return [
    { id: "ly_sketch", name: "Esquisse", visible: true, locked: false, opacity: 1 },
    { id: "ly_trace", name: "Calque", visible: true, locked: false, opacity: 0.7 },
    { id: "ly_survey", name: "Relevé", visible: true, locked: false, opacity: 1 },
  ];
}

export function ensureSketch(p: Project): Project {
  if (p.layers?.length && p.strokes && p.survey && p.revisions) return p;
  return {
    ...p,
    layers: p.layers?.length ? p.layers : defaultLayers(),
    strokes: p.strokes ?? [],
    survey: p.survey ?? [],
    revisions: p.revisions ?? [{ id: uid("rev"), at: p.createdAt, note: "Création" }],
  };
}

export function activeLayerId(p: Project, fallback = "ly_sketch"): string {
  return p.layers?.find((l) => l.visible && !l.locked)?.id ?? p.layers?.[0]?.id ?? fallback;
}

export function surveyLengths(points: SurveyPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) out.push(dist(points[i - 1]!.position, points[i]!.position));
  return out;
}

export function surveyPerimeter(points: SurveyPoint[]): number {
  return surveyLengths(points).reduce((s, n) => s + n, 0);
}

export function resampleStroke(points: Vec2[], min = 0.08): Vec2[] {
  if (points.length < 2) return points;
  const out: Vec2[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1]!;
    const p = points[i]!;
    if (dist(prev, p) >= min) out.push(p);
  }
  return out;
}

export function strokeBounds(s: Stroke): { min: Vec2; max: Vec2 } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of s.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}
