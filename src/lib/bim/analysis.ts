import { polygonArea } from "./geometry";
import type { Project, RoomFunction } from "./types";

export interface RoomStat {
  id: string;
  name: string;
  function: RoomFunction;
  story: string;
  area: number;
}

export interface ProjectAnalysis {
  netArea: number;
  outdoorArea: number;
  footprint: number;
  floorArea: number;
  cesActual: number;
  cosActual: number;
  rooms: RoomStat[];
  byFunction: { function: RoomFunction; area: number; count: number }[];
  wallLength: number;
  openingCount: number;
  windowArea: number;
  compactness: number;
  daylightScore: number;
  energyScore: number;
  notes: string[];
}

const OUTDOOR: RoomFunction[] = ["terrace", "patio"];

export function analyzeProject(project: Project): ProjectAnalysis {
  const rooms: RoomStat[] = project.rooms.map((r) => {
    const story = project.stories.find((s) => s.id === r.storyId);
    return {
      id: r.id,
      name: r.name,
      function: r.function,
      story: story?.name ?? "—",
      area: polygonArea(r.polygon),
    };
  });

  const netArea = rooms.filter((r) => !OUTDOOR.includes(r.function)).reduce((s, r) => s + r.area, 0);
  const outdoorArea = rooms.filter((r) => OUTDOOR.includes(r.function)).reduce((s, r) => s + r.area, 0);
  const groundId =
    project.stories.find((s) => s.elevation >= -0.05 && s.elevation < 0.6)?.id ??
    project.stories[0]?.id;
  const footprint = project.rooms
    .filter((r) => r.storyId === groundId && !OUTDOOR.includes(r.function))
    .reduce((s, r) => s + polygonArea(r.polygon), 0);
  const floorArea = netArea;
  const plot = Math.max(0, project.meta.plotM2 ?? 0);
  const cesActual = plot > 1 ? footprint / plot : 0;
  const cosActual = plot > 1 ? floorArea / plot : 0;

  const fnMap = new Map<RoomFunction, { area: number; count: number }>();
  for (const r of rooms) {
    const cur = fnMap.get(r.function) ?? { area: 0, count: 0 };
    cur.area += r.area;
    cur.count += 1;
    fnMap.set(r.function, cur);
  }
  const byFunction = [...fnMap.entries()].map(([fn, v]) => ({
    function: fn,
    area: v.area,
    count: v.count,
  }));

  const wallLength = project.walls.reduce(
    (s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y),
    0,
  );

  let windowArea = 0;
  for (const o of project.openings) {
    if (o.kind === "window") windowArea += o.width * o.height;
  }

  const compactness = netArea > 1 ? Math.min(1, (4 * Math.PI * netArea) / (wallLength * wallLength + 1)) : 0;
  const glazingRatio = netArea > 1 ? windowArea / netArea : 0;
  const daylightScore = Math.round(Math.min(100, Math.max(20, glazingRatio * 180 + 35)));
  const avgU =
    project.walls.length > 0
      ? project.walls.reduce((s, w) => s + (w.uValue ?? 1.4), 0) / project.walls.length
      : 1.4;
  const energyScore = Math.round(
    Math.min(
      100,
      Math.max(18, 55 + (1.2 - avgU) * 28 + compactness * 18 - Math.abs(glazingRatio - 0.18) * 90),
    ),
  );

  const notes: string[] = [];
  const living = rooms.filter((r) => r.function === "living").reduce((s, r) => s + r.area, 0);
  const kitchen = rooms.filter((r) => r.function === "kitchen").reduce((s, r) => s + r.area, 0);
  const baths = rooms.filter((r) => r.function === "bath" || r.function === "wc");
  const bedrooms = rooms.filter((r) => r.function === "bedroom");

  if (living > 0 && living < 18) notes.push("Le séjour est sous-dimensionné (< 18 m²).");
  if (kitchen > 0 && kitchen < 8) notes.push("Cuisine étroite : viser 10–14 m² pour un îlot.");
  if (bedrooms.some((b) => b.area < 9)) notes.push("Une chambre passe sous 9 m² (minimum confort).");
  if (baths.length === 0) notes.push("Aucune salle d'eau détectée.");
  if (glazingRatio < 0.12) notes.push("Surface vitrée faible : lumière naturelle limitée.");
  if (glazingRatio > 0.35) notes.push("Survitrage : risque de surchauffe d'été, prévoir stores.");
  if (project.stories.length > 1 && project.stairs.length === 0)
    notes.push("Plusieurs niveaux sans escalier BIM.");
  const cesCap = project.meta.ces ?? 0;
  const cosCap = project.meta.cos ?? 0;
  if (cesCap > 0 && cesActual > cesCap + 0.01)
    notes.push(`CES projet ${(cesActual * 100).toFixed(0)} % > plafond ${(cesCap * 100).toFixed(0)} %.`);
  if (cosCap > 0 && cosActual > cosCap + 0.01)
    notes.push(`COS projet ${cosActual.toFixed(2)} > plafond ${cosCap.toFixed(2)}.`);
  if (notes.length === 0) notes.push("Programme cohérent. Vérifier orientations et apports solaires.");

  return {
    netArea,
    outdoorArea,
    footprint,
    floorArea,
    cesActual,
    cosActual,
    rooms,
    byFunction,
    wallLength,
    openingCount: project.openings.length,
    windowArea,
    compactness,
    daylightScore,
    energyScore,
    notes,
  };
}
