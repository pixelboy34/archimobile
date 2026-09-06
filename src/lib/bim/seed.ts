import { uid } from "@/lib/utils";
import {
  addFlatRoof,
  addFurnitureAt,
  addGableRoof,
  addOpeningOnWall,
  addRectRooms,
  addStair,
  emptyProject,
} from "./builder";
import { copyStory, repeatStories, restackStories } from "../cad/ops";
import { dist, findWallAt, rectPolygon } from "./geometry";
import type { Project, Wall } from "./types";

function open(
  p: Project,
  storyId: string,
  x: number,
  y: number,
  kind: "door" | "window",
  w?: number,
  h?: number,
  sill?: number,
): Project {
  const hit = findWallAt(p, storyId, { x, y }, 1.4);
  if (!hit) return p;
  return addOpeningOnWall(p, hit.wall, kind, hit.t, w, h, sill);
}

function wallNear(p: Project, storyId: string, x: number, y: number): Wall | undefined {
  return findWallAt(p, storyId, { x, y }, 1.4)?.wall;
}

function glassWalls(p: Project, storyId: string, points: { x: number; y: number }[]): Project {
  const next = { ...p, walls: p.walls.map((w) => ({ ...w })) };
  for (const pt of points) {
    const w = wallNear(next, storyId, pt.x, pt.y);
    if (w) {
      const i = next.walls.findIndex((x) => x.id === w.id);
      if (i >= 0) next.walls[i] = { ...next.walls[i]!, materialId: "glass", thickness: 0.12 };
    }
  }
  return next;
}

export function villaCalanque(): Project {
  let p = emptyProject("Villa Calanque");
  p.meta = {
    client: "Famille Morel",
    location: "Cassis, Provence",
    latitude: 43.21,
    longitude: 5.54,
    north: 12,
    brief: "Villa contemporaine face à la mer, 4 chambres, patio et piscine.",
    typology: "villa",
    climate: "H3",
    energyClass: "A",
    plotM2: 980,
    ces: 0.28,
    cos: 0.42,
    seismic: "2",
    wind: "3",
    altitude: 38,
    year: 2026,
  };
  const rdc = p.stories[0]!;
  rdc.height = 3.0;
  const etageId = uid("st");
  p.stories.push({ id: etageId, name: "Étage", elevation: 3.0, height: 2.7 });

  p = addRectRooms(
    p,
    [
      { x: 0, y: 0, w: 8.5, d: 7.5, name: "Salon", fn: "living", storyId: rdc.id },
      { x: 8.5, y: 0, w: 6.5, d: 4.5, name: "Cuisine", fn: "kitchen", storyId: rdc.id },
      { x: 8.5, y: 4.5, w: 6.5, d: 3.0, name: "Salle à manger", fn: "dining", storyId: rdc.id },
      { x: 0, y: 7.5, w: 3.5, d: 4.5, name: "Entrée", fn: "entry", storyId: rdc.id },
      { x: 3.5, y: 7.5, w: 5.0, d: 4.5, name: "Suite parentale", fn: "bedroom", storyId: rdc.id },
      { x: 8.5, y: 7.5, w: 3.2, d: 4.5, name: "Salle de bain", fn: "bath", storyId: rdc.id },
      { x: 11.7, y: 7.5, w: 3.3, d: 4.5, name: "Cellier", fn: "storage", storyId: rdc.id },
    ],
    { wallMat: "plaster", thickness: 0.25, height: 3.0 },
  );

  p = open(p, rdc.id, 4.2, 0, "window", 3.6, 2.6, 0.05);
  p = open(p, rdc.id, 11.5, 0, "window", 2.4, 2.4, 0.05);
  p = open(p, rdc.id, 0, 3.5, "window", 2.2, 2.2, 0.4);
  p = open(p, rdc.id, 1.6, 7.5, "door", 1.0, 2.2, 0);
  p = open(p, rdc.id, 8.5, 2.2, "door", 0.9, 2.1, 0);
  p = open(p, rdc.id, 8.5, 6.0, "door", 0.9, 2.1, 0);
  p = open(p, rdc.id, 5.8, 7.5, "door", 0.9, 2.1, 0);
  p = open(p, rdc.id, 10.1, 7.5, "door", 0.8, 2.1, 0);
  p = open(p, rdc.id, 13.2, 7.5, "door", 0.8, 2.1, 0);
  p = open(p, rdc.id, 15, 2.0, "window", 1.5, 1.4, 0.9);
  p = open(p, rdc.id, 6.0, 12, "window", 1.8, 1.5, 0.8);

  p = addFurnitureAt(p, rdc.id, "sofa", { x: 2.4, y: 3.2 }, 0);
  p = addFurnitureAt(p, rdc.id, "armchair", { x: 4.6, y: 2.2 }, 0.4);
  p = addFurnitureAt(p, rdc.id, "coffee", { x: 2.6, y: 4.4 }, 0);
  p = addFurnitureAt(p, rdc.id, "tv", { x: 0.5, y: 3.4 }, Math.PI / 2);
  p = addFurnitureAt(p, rdc.id, "table", { x: 11.2, y: 5.8 }, 0);
  p = addFurnitureAt(p, rdc.id, "kitchen", { x: 11.6, y: 0.55 }, 0);
  p = addFurnitureAt(p, rdc.id, "island", { x: 11.4, y: 2.4 }, 0);
  p = addFurnitureAt(p, rdc.id, "fridge", { x: 14.5, y: 0.6 }, 0);
  p = addFurnitureAt(p, rdc.id, "bed", { x: 5.8, y: 9.6 }, 0);
  p = addFurnitureAt(p, rdc.id, "nightstand", { x: 4.7, y: 8.7 }, 0);
  p = addFurnitureAt(p, rdc.id, "bath", { x: 10.0, y: 9.4 }, Math.PI / 2);
  p = addFurnitureAt(p, rdc.id, "plant", { x: 0.6, y: 0.6 }, 0);
  p = addFurnitureAt(p, rdc.id, "tree", { x: 18.5, y: -1.2 }, 0);
  p = addFurnitureAt(p, rdc.id, "hedge", { x: 19.2, y: 2.4 }, 0);
  p = addFurnitureAt(p, rdc.id, "pergola", { x: 3.2, y: -1.6 }, 0);
  p = addFurnitureAt(p, rdc.id, "bench", { x: 16.2, y: -2.2 }, 0);

  p.slabs.push({
    id: uid("sl"),
    storyId: rdc.id,
    polygon: rectPolygon(15.2, -5.5, 8.2, 3.8),
    thickness: 0.12,
    materialId: "water",
    outdoor: true,
  });
  p.furniture.push({
    id: uid("fn"),
    storyId: rdc.id,
    kind: "pool",
    position: { x: 19.3, y: -3.6 },
    rotation: 0,
    w: 8,
    d: 3.5,
    h: 0.12,
  });
  p.slabs.push({
    id: uid("sl"),
    storyId: rdc.id,
    polygon: rectPolygon(-1.5, -3.2, 16.8, 3.2),
    thickness: 0.12,
    materialId: "stone",
    outdoor: true,
  });

  p = addStair(p, rdc.id, { x: 1.1, y: 8.4 }, Math.PI / 2, 3.4, 0.95);

  p = addRectRooms(
    p,
    [
      { x: 0, y: 0, w: 8.5, d: 7.5, name: "Chambre 2", fn: "bedroom", storyId: etageId },
      { x: 0, y: 7.5, w: 5.5, d: 4.5, name: "Chambre 3", fn: "bedroom", storyId: etageId },
      { x: 5.5, y: 7.5, w: 4.5, d: 4.5, name: "Bureau", fn: "office", storyId: etageId },
      { x: 10, y: 7.5, w: 5, d: 4.5, name: "Salle d'eau", fn: "bath", storyId: etageId },
    ],
    { wallMat: "plaster", thickness: 0.22, height: 2.7 },
  );

  p.rooms.push({
    id: uid("rm"),
    storyId: etageId,
    name: "Terrasse",
    function: "terrace",
    polygon: rectPolygon(8.5, 0, 6.5, 7.5),
  });
  p.slabs.push({
    id: uid("sl"),
    storyId: etageId,
    polygon: rectPolygon(8.5, 0, 6.5, 7.5),
    thickness: 0.18,
    materialId: "stone",
    outdoor: true,
  });

  p = open(p, etageId, 4, 0, "window", 2.4, 1.5, 0.9);
  p = open(p, etageId, 8.5, 3.5, "door", 1.2, 2.2, 0);
  p = open(p, etageId, 2.5, 12, "window", 1.6, 1.4, 0.9);
  p = open(p, etageId, 7.6, 12, "window", 1.4, 1.4, 0.9);
  p = open(p, etageId, 12.4, 12, "window", 1.4, 1.2, 1.0);
  p = addFurnitureAt(p, etageId, "bed", { x: 3.2, y: 2.4 }, 0);
  p = addFurnitureAt(p, etageId, "wardrobe", { x: 0.6, y: 3.4 }, Math.PI / 2);
  p = addFurnitureAt(p, etageId, "desk", { x: 7.4, y: 9.4 }, 0);
  p = addFurnitureAt(p, etageId, "lamp", { x: 5.2, y: 1.2 }, 0);
  p = addFurnitureAt(p, etageId, "plant", { x: 12.4, y: 2.2 }, 0);
  p = addFurnitureAt(p, rdc.id, "car", { x: 18.8, y: 6.5 }, 0);
  p = addFurnitureAt(p, rdc.id, "lamppost", { x: 16.8, y: -4.6 }, 0);
  p = addFurnitureAt(p, rdc.id, "fence", { x: 22.4, y: 1.2 }, Math.PI / 2);
  p = addFurnitureAt(p, rdc.id, "people", { x: 15.4, y: -2.8 }, 0.3);
  p = addFurnitureAt(p, etageId, "solar", { x: 12.2, y: 10.2 }, 0);

  p = addFlatRoof(p, etageId, rectPolygon(-0.35, 7.2, 15.7, 5.4));
  p = addFlatRoof(p, etageId, rectPolygon(-0.35, -0.35, 9.1, 7.7));
  p = glassWalls(p, rdc.id, [{ x: 4.2, y: 0 }, { x: 11.5, y: 0 }]);

  for (const pos of [
    { x: -2.2, y: -1.5 },
    { x: 16.4, y: 1.2 },
    { x: -1.8, y: 11.5 },
  ] as const) {
    p = addFurnitureAt(p, rdc.id, "plant", pos, 0);
  }
  return p;
}

export function atelierVoltaire(): Project {
  let p = emptyProject("Atelier Voltaire");
  p.meta = {
    client: "Studio Lumen",
    location: "11e arr., Paris",
    latitude: 48.86,
    longitude: 2.38,
    north: 0,
    brief: "Loft en double hauteur, verrière nord, atelier + logement.",
  };
  const rdc = p.stories[0]!;
  rdc.height = 4.4;
  p.stories[0]!.name = "Plateau";

  p = addRectRooms(
    p,
    [
      { x: 0, y: 0, w: 12, d: 8.5, name: "Atelier", fn: "studio", storyId: rdc.id },
      { x: 12, y: 0, w: 5.5, d: 5, name: "Cuisine", fn: "kitchen", storyId: rdc.id },
      { x: 12, y: 5, w: 5.5, d: 3.5, name: "Chambre", fn: "bedroom", storyId: rdc.id },
      { x: 0, y: 8.5, w: 4, d: 3.2, name: "Entrée", fn: "entry", storyId: rdc.id },
      { x: 4, y: 8.5, w: 4, d: 3.2, name: "Salle de bain", fn: "bath", storyId: rdc.id },
      { x: 8, y: 8.5, w: 9.5, d: 3.2, name: "Rangement", fn: "storage", storyId: rdc.id },
    ],
    { wallMat: "brick", thickness: 0.3, height: 4.4 },
  );

  p = glassWalls(p, rdc.id, [{ x: 6, y: 0 }, { x: 14.5, y: 0 }]);
  p = open(p, rdc.id, 2, 11.7, "door", 1.2, 2.4, 0);
  p = open(p, rdc.id, 12, 2.4, "door", 0.9, 2.1, 0);
  p = open(p, rdc.id, 12, 6.6, "door", 0.8, 2.1, 0);
  p = open(p, rdc.id, 6, 8.5, "door", 0.8, 2.1, 0);
  p = open(p, rdc.id, 14.5, 11.7, "window", 1.8, 1.6, 1.2);
  p = open(p, rdc.id, 0, 4.2, "window", 1.6, 2.4, 0.8);
  p = addFurnitureAt(p, rdc.id, "desk", { x: 3.2, y: 1.4 }, 0);
  p = addFurnitureAt(p, rdc.id, "sofa", { x: 8.4, y: 5.5 }, 0);
  p = addFurnitureAt(p, rdc.id, "kitchen", { x: 14.5, y: 0.6 }, 0);
  p = addFurnitureAt(p, rdc.id, "bed", { x: 14.6, y: 6.5 }, 0);
  p = addGableRoof(p, rdc.id, rectPolygon(-0.4, -0.4, 18.3, 12.5), 32);
  return p;
}

export function maisonPatio(): Project {
  let p = emptyProject("Maison Patio");
  p.meta = {
    client: "H. Benali",
    location: "Aix-en-Provence",
    latitude: 43.53,
    longitude: 5.45,
    north: -8,
    brief: "Maison de plain-pied organisée autour d'un patio planté.",
  };
  const s = p.stories[0]!;
  s.height = 2.9;

  p = addRectRooms(
    p,
    [
      { x: 0, y: 0, w: 14, d: 4.2, name: "Salon", fn: "living", storyId: s.id },
      { x: 10, y: 4.2, w: 4, d: 5.6, name: "Cuisine", fn: "kitchen", storyId: s.id },
      { x: 0, y: 9.8, w: 5.5, d: 4.4, name: "Chambre 1", fn: "bedroom", storyId: s.id },
      { x: 5.5, y: 9.8, w: 4.5, d: 4.4, name: "Chambre 2", fn: "bedroom", storyId: s.id },
      { x: 10, y: 9.8, w: 4, d: 4.4, name: "Salle de bain", fn: "bath", storyId: s.id },
      { x: 0, y: 4.2, w: 4, d: 5.6, name: "Entrée", fn: "entry", storyId: s.id },
      { x: 4, y: 4.2, w: 6, d: 5.6, name: "Patio", fn: "patio", storyId: s.id },
    ],
    { wallMat: "stone", thickness: 0.28, height: 2.9 },
  );

  p = glassWalls(p, s.id, [
    { x: 7, y: 4.2 },
    { x: 4, y: 7 },
    { x: 10, y: 7 },
    { x: 7, y: 9.8 },
  ]);
  p = open(p, s.id, 7, 0, "window", 3.2, 2.4, 0.1);
  p = open(p, s.id, 2, 14.2, "window", 1.6, 1.4, 0.9);
  p = open(p, s.id, 7.6, 14.2, "window", 1.5, 1.4, 0.9);
  p = open(p, s.id, 0, 7, "door", 1.0, 2.2, 0);
  p = open(p, s.id, 4, 6, "door", 0.9, 2.1, 0);
  p = open(p, s.id, 10, 6.5, "door", 0.9, 2.1, 0);
  p = addFurnitureAt(p, s.id, "sofa", { x: 4.5, y: 1.6 }, 0);
  p = addFurnitureAt(p, s.id, "kitchen", { x: 12, y: 4.7 }, Math.PI / 2);
  p = addFurnitureAt(p, s.id, "bed", { x: 2.4, y: 11.6 }, 0);
  p = addFurnitureAt(p, s.id, "bed", { x: 7.6, y: 11.6 }, 0);
  p = addFurnitureAt(p, s.id, "plant", { x: 7, y: 7 }, 0);
  p = addFurnitureAt(p, s.id, "plant", { x: 5.2, y: 6.2 }, 0);
  p = addFlatRoof(p, s.id, rectPolygon(-0.25, -0.25, 14.5, 14.7));
  return p;
}

export function pavillonLac(): Project {
  let p = emptyProject("Pavillon Lac");
  p.meta = {
    client: "Week-end",
    location: "Annecy",
    latitude: 45.9,
    longitude: 6.13,
    north: 20,
    brief: "Cabane contemporaine 48 m², tout en bois, face au lac.",
  };
  const s = p.stories[0]!;
  s.height = 2.6;
  p = addRectRooms(
    p,
    [
      { x: 0, y: 0, w: 7.2, d: 5.4, name: "Séjour", fn: "living", storyId: s.id },
      { x: 7.2, y: 0, w: 3.4, d: 5.4, name: "Chambre", fn: "bedroom", storyId: s.id },
      { x: 0, y: 5.4, w: 3.6, d: 2.6, name: "Cuisine", fn: "kitchen", storyId: s.id },
      { x: 3.6, y: 5.4, w: 3.2, d: 2.6, name: "Salle d'eau", fn: "bath", storyId: s.id },
      { x: 6.8, y: 5.4, w: 3.8, d: 2.6, name: "Entrée", fn: "entry", storyId: s.id },
    ],
    { wallMat: "wood", thickness: 0.2, height: 2.6 },
  );
  p = open(p, s.id, 3.6, 0, "window", 4.2, 2.3, 0.1);
  p = open(p, s.id, 8.8, 0, "window", 1.6, 1.4, 0.8);
  p = open(p, s.id, 8.8, 8, "door", 0.9, 2.1, 0);
  p = open(p, s.id, 7.2, 2.6, "door", 0.8, 2.1, 0);
  p = addFurnitureAt(p, s.id, "sofa", { x: 2.2, y: 2.4 }, 0);
  p = addFurnitureAt(p, s.id, "bed", { x: 8.8, y: 2.4 }, 0);
  p = addFurnitureAt(p, s.id, "kitchen", { x: 1.6, y: 6.6 }, 0);
  p = addGableRoof(p, s.id, rectPolygon(-0.5, -0.5, 11.6, 8.8), 36);
  p = glassWalls(p, s.id, [{ x: 3.6, y: 0 }]);
  return p;
}

export function tourHorizon(): Project {
  let p = emptyProject("Tour Horizon");
  p.meta = {
    client: "SCI Horizon",
    location: "Lyon Part-Dieu",
    latitude: 45.76,
    longitude: 4.86,
    north: 0,
    brief: "Immeuble collectif R+8, noyau central, 2 logements par étage.",
    typology: "collective",
    climate: "H1",
    energyClass: "B",
    plotM2: 1800,
    ces: 0.45,
    cos: 2.4,
    seismic: "2",
    wind: "2",
    year: 2026,
  };
  const s = p.stories[0]!;
  s.name = "RDC";
  s.height = 3.2;
  p = addRectRooms(
    p,
    [
      { x: 0, y: 0, w: 7.2, d: 9.6, name: "Hall", fn: "entry", storyId: s.id },
      { x: 7.2, y: 0, w: 3.6, d: 6.4, name: "Noyau", fn: "corridor", storyId: s.id },
      { x: 10.8, y: 0, w: 7.2, d: 9.6, name: "Local vélos", fn: "storage", storyId: s.id },
      { x: 0, y: 9.6, w: 18, d: 6.4, name: "Commerce", fn: "living", storyId: s.id },
    ],
    { wallMat: "concrete", thickness: 0.28, height: 3.2 },
  );
  p = open(p, s.id, 9, 0, "door", 1.8, 2.4, 0);
  p = open(p, s.id, 4, 0, "window", 2.4, 2.2, 0.4);
  p = open(p, s.id, 14, 0, "window", 2.4, 2.2, 0.4);
  p = open(p, s.id, 9, 16, "window", 4.2, 2.4, 0.3);
  p = addFurnitureAt(p, s.id, "elevator", { x: 9, y: 2.2 }, 0);
  p = addStair(p, s.id, { x: 7.4, y: 3.6 }, Math.PI / 2, 4.2, 1.1);
  p = addFurnitureAt(p, s.id, "staircore", { x: 9, y: 4.8 }, 0);
  p = addFurnitureAt(p, s.id, "people", { x: 3.2, y: 4 }, 0);

  p = copyStory(p, s.id, { furniture: false, roof: false });
  const r1 = p.stories[1]!;
  r1.name = "R+1 type";
  r1.height = 2.8;
  p.walls = p.walls.map((w) => (w.storyId === r1.id ? { ...w, height: 2.8 } : w));
  p = addFurnitureAt(p, r1.id, "elevator", { x: 9, y: 2.2 }, 0);
  p = addFurnitureAt(p, r1.id, "sofa", { x: 3.2, y: 3.4 }, 0);
  p = addFurnitureAt(p, r1.id, "bed", { x: 14.4, y: 3.2 }, 0);
  p = addFurnitureAt(p, r1.id, "kitchen", { x: 3.4, y: 11.2 }, 0);
  p = addFurnitureAt(p, r1.id, "balcony", { x: 9, y: -0.6 }, 0);
  p = addFurnitureAt(p, r1.id, "curtain", { x: 0.1, y: 8 }, Math.PI / 2);
  p = addStair(p, r1.id, { x: 7.4, y: 3.6 }, Math.PI / 2, 4.2, 1.1);

  p = repeatStories(p, r1.id, 6);
  p.stories = p.stories.map((st, i) => ({
    ...st,
    name: i === 0 ? "RDC" : `R+${i}`,
    height: i === 0 ? 3.2 : 2.8,
  }));
  p = restackStories(p);
  p.walls = p.walls.map((w) => {
    const st = p.stories.find((s) => s.id === w.storyId);
    return st ? { ...w, height: st.height } : w;
  });
  const last = p.stories[p.stories.length - 1]!;
  p = addFlatRoof(p, last.id, rectPolygon(-0.4, -0.4, 18.8, 16.8));
  return p;
}

export function seedProjects(): Project[] {
  return [villaCalanque(), tourHorizon(), atelierVoltaire(), maisonPatio(), pavillonLac()];
}

export function projectFromAiDraft(draft: AiDraft): Project {
  let p = emptyProject(draft.name || "Projet IA");
  p.meta = {
    client: draft.client ?? "",
    location: draft.location ?? "France",
    latitude: draft.latitude ?? 46.5,
    longitude: draft.longitude ?? 2.2,
    north: 0,
    brief: draft.brief ?? "",
  };
  p.stories = [];
  const storyIds: string[] = [];
  const stories = draft.stories?.length
    ? draft.stories
    : [{ name: "RDC", elevation: 0, height: 2.8 }];
  for (const st of stories) {
    const id = uid("st");
    storyIds.push(id);
    p.stories.push({
      id,
      name: st.name,
      elevation: st.elevation ?? 0,
      height: st.height ?? 2.8,
    });
  }

  const roomsByStory = new Map<number, typeof draft.rooms>();
  for (const r of draft.rooms ?? []) {
    const i = Math.min(Math.max(r.story ?? 0, 0), storyIds.length - 1);
    const list = roomsByStory.get(i) ?? [];
    list.push(r);
    roomsByStory.set(i, list);
  }

  for (const [si, rooms] of roomsByStory) {
    const storyId = storyIds[si]!;
    p = addRectRooms(
      p,
      (rooms ?? []).map((r) => ({
        x: r.x,
        y: r.y,
        w: r.w,
        d: r.d,
        name: r.name,
        fn: r.function ?? "other",
        storyId,
      })),
      { thickness: 0.22, height: p.stories[si]!.height },
    );
  }

  for (const o of draft.openings ?? []) {
    const si = Math.min(Math.max(o.story ?? 0, 0), storyIds.length - 1);
    p = open(p, storyIds[si]!, o.x, o.y, o.kind, o.width, o.height, o.sill);
  }
  for (const f of draft.furniture ?? []) {
    const si = Math.min(Math.max(f.story ?? 0, 0), storyIds.length - 1);
    p = addFurnitureAt(p, storyIds[si]!, f.kind, { x: f.x, y: f.y }, f.rotation ?? 0);
  }

  if (p.roofs.length === 0 && p.rooms.length) {
    const last = p.stories[p.stories.length - 1]!;
    const xs = p.rooms.flatMap((r) => r.polygon.map((v) => v.x));
    const ys = p.rooms.flatMap((r) => r.polygon.map((v) => v.y));
    const poly = rectPolygon(
      Math.min(...xs) - 0.3,
      Math.min(...ys) - 0.3,
      Math.max(...xs) - Math.min(...xs) + 0.6,
      Math.max(...ys) - Math.min(...ys) + 0.6,
    );
    p = draft.roof === "gable" ? addGableRoof(p, last.id, poly, 28) : addFlatRoof(p, last.id, poly);
  }
  return p;
}

export interface AiDraft {
  name?: string;
  client?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  brief?: string;
  roof?: "flat" | "gable";
  stories?: { name: string; elevation?: number; height?: number }[];
  rooms?: {
    x: number;
    y: number;
    w: number;
    d: number;
    name: string;
    function?: Project["rooms"][number]["function"];
    story?: number;
  }[];
  openings?: {
    x: number;
    y: number;
    kind: "door" | "window";
    width?: number;
    height?: number;
    sill?: number;
    story?: number;
  }[];
  furniture?: {
    kind: Project["furniture"][number]["kind"];
    x: number;
    y: number;
    rotation?: number;
    story?: number;
  }[];
}

export function fallbackDraftFromPrompt(prompt: string): AiDraft {
  const q = prompt.toLowerCase();
  const villa = q.includes("villa") || q.includes("maison") || q.includes("family") || q.includes("famille");
  const loft = q.includes("loft") || q.includes("atelier") || q.includes("studio");
  const patio = q.includes("patio") || q.includes("cour");
  if (loft) {
    const p = atelierVoltaire();
    return {
      name: "Loft généré",
      brief: prompt,
      location: "Paris",
      roof: "gable",
      stories: p.stories.map((s) => ({ name: s.name, elevation: s.elevation, height: s.height })),
      rooms: p.rooms.map((r) => {
        const xs = r.polygon.map((v) => v.x);
        const ys = r.polygon.map((v) => v.y);
        return {
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          d: Math.max(...ys) - Math.min(...ys),
          name: r.name,
          function: r.function,
          story: 0,
        };
      }),
    };
  }
  if (patio) {
    return {
      name: "Maison patio",
      brief: prompt,
      location: "Aix-en-Provence",
      roof: "flat",
      stories: [{ name: "RDC", elevation: 0, height: 2.9 }],
      rooms: [
        { x: 0, y: 0, w: 14, d: 4.2, name: "Salon", function: "living", story: 0 },
        { x: 10, y: 4.2, w: 4, d: 5.6, name: "Cuisine", function: "kitchen", story: 0 },
        { x: 0, y: 9.8, w: 5.5, d: 4.4, name: "Chambre 1", function: "bedroom", story: 0 },
        { x: 5.5, y: 9.8, w: 4.5, d: 4.4, name: "Chambre 2", function: "bedroom", story: 0 },
        { x: 10, y: 9.8, w: 4, d: 4.4, name: "Salle de bain", function: "bath", story: 0 },
        { x: 0, y: 4.2, w: 4, d: 5.6, name: "Entrée", function: "entry", story: 0 },
        { x: 4, y: 4.2, w: 6, d: 5.6, name: "Patio", function: "patio", story: 0 },
      ],
      openings: [
        { x: 7, y: 0, kind: "window", width: 3.2, height: 2.4, sill: 0.1, story: 0 },
        { x: 0, y: 7, kind: "door", width: 1, height: 2.2, story: 0 },
      ],
    };
  }
  if (villa || dist({ x: 0, y: 0 }, { x: 1, y: 0 })) {
    return {
      name: villa ? "Villa générée" : "Maison générée",
      brief: prompt,
      location: "France",
      roof: q.includes("toit") && q.includes("plat") ? "flat" : "gable",
      stories: [
        { name: "RDC", elevation: 0, height: 2.8 },
        ...(q.includes("étage") || q.includes("etage") || q.includes("2 niveau")
          ? [{ name: "Étage", elevation: 2.8, height: 2.6 }]
          : []),
      ],
      rooms: [
        { x: 0, y: 0, w: 7, d: 6, name: "Salon", function: "living", story: 0 },
        { x: 7, y: 0, w: 5, d: 4, name: "Cuisine", function: "kitchen", story: 0 },
        { x: 7, y: 4, w: 5, d: 2, name: "Entrée", function: "entry", story: 0 },
        { x: 0, y: 6, w: 5, d: 4, name: "Chambre", function: "bedroom", story: 0 },
        { x: 5, y: 6, w: 4, d: 4, name: "Salle de bain", function: "bath", story: 0 },
        { x: 9, y: 6, w: 3, d: 4, name: "Bureau", function: "office", story: 0 },
      ],
      openings: [
        { x: 3.5, y: 0, kind: "window", width: 2.8, height: 2.2, sill: 0.1, story: 0 },
        { x: 9.5, y: 0, kind: "window", width: 1.6, height: 1.4, sill: 0.9, story: 0 },
        { x: 9.5, y: 4, kind: "door", width: 0.9, height: 2.1, sill: 0, story: 0 },
        { x: 2.4, y: 6, kind: "door", width: 0.9, height: 2.1, story: 0 },
      ],
      furniture: [
        { kind: "sofa", x: 2.4, y: 2.6 },
        { kind: "kitchen", x: 9.2, y: 0.5 },
        { kind: "bed", x: 2.2, y: 7.8 },
      ],
    };
  }
  return { name: "Projet généré", brief: prompt };
}
