import type {
  FireRating,
  FurnitureKind,
  Glazing,
  MaterialId,
  OpeningVariant,
  WallAlign,
  WallRole,
} from "./types";
import { FURNITURE_LABELS } from "./types";

export type MeshStyle =
  | "sofa"
  | "chair"
  | "table"
  | "bed"
  | "cabinet"
  | "appliance"
  | "sanitary"
  | "lamp"
  | "screen"
  | "plant"
  | "tree"
  | "hedge"
  | "fence"
  | "pergola"
  | "vehicle"
  | "pool"
  | "people"
  | "rug"
  | "fire"
  | "post"
  | "panel"
  | "box";

export interface ObjectDef {
  kind: FurnitureKind;
  label: string;
  group: string;
  w: number;
  d: number;
  h: number;
  style: MeshStyle;
  mat: MaterialId;
  site?: boolean;
  essential?: boolean;
}

const GROUP_META: { id: string; label: string }[] = [
  { id: "living", label: "Salon" },
  { id: "dining", label: "Repas" },
  { id: "sleep", label: "Nuit" },
  { id: "cook", label: "Cuisine" },
  { id: "wet", label: "Eau" },
  { id: "work", label: "Bureau" },
  { id: "tech", label: "Technique" },
  { id: "core", label: "Noyau" },
  { id: "garden", label: "Jardin" },
  { id: "site", label: "Site" },
];

export const OBJECT_CATALOG: ObjectDef[] = [
  { kind: "sofa", label: FURNITURE_LABELS.sofa, group: "living", w: 2.2, d: 0.9, h: 0.78, style: "sofa", mat: "wood", essential: true },
  { kind: "armchair", label: FURNITURE_LABELS.armchair, group: "living", w: 0.85, d: 0.9, h: 0.78, style: "sofa", mat: "wood", essential: true },
  { kind: "coffee", label: FURNITURE_LABELS.coffee, group: "living", w: 1.2, d: 0.7, h: 0.38, style: "table", mat: "wood", essential: true },
  { kind: "ottoman", label: FURNITURE_LABELS.ottoman, group: "living", w: 0.7, d: 0.7, h: 0.4, style: "box", mat: "wood" },
  { kind: "sideboard", label: FURNITURE_LABELS.sideboard, group: "living", w: 1.8, d: 0.45, h: 0.75, style: "cabinet", mat: "darkwood" },
  { kind: "console", label: FURNITURE_LABELS.console, group: "living", w: 1.2, d: 0.35, h: 0.8, style: "cabinet", mat: "darkwood" },
  { kind: "rug", label: FURNITURE_LABELS.rug, group: "living", w: 2.4, d: 1.7, h: 0.02, style: "rug", mat: "wood" },
  { kind: "fireplace", label: FURNITURE_LABELS.fireplace, group: "living", w: 1.4, d: 0.5, h: 1.2, style: "fire", mat: "stone" },
  { kind: "piano", label: FURNITURE_LABELS.piano, group: "living", w: 1.5, d: 0.55, h: 1.0, style: "cabinet", mat: "darkwood" },
  { kind: "lamp", label: FURNITURE_LABELS.lamp, group: "living", w: 0.4, d: 0.4, h: 1.6, style: "lamp", mat: "darkwood" },
  { kind: "tv", label: FURNITURE_LABELS.tv, group: "living", w: 1.2, d: 0.08, h: 0.7, style: "screen", mat: "metal", essential: true },

  { kind: "table", label: FURNITURE_LABELS.table, group: "dining", w: 1.8, d: 0.9, h: 0.75, style: "table", mat: "wood", essential: true },
  { kind: "chair", label: FURNITURE_LABELS.chair, group: "dining", w: 0.45, d: 0.5, h: 0.9, style: "chair", mat: "wood", essential: true },

  { kind: "bed", label: FURNITURE_LABELS.bed, group: "sleep", w: 1.6, d: 2.0, h: 0.5, style: "bed", mat: "white", essential: true },
  { kind: "kingbed", label: FURNITURE_LABELS.kingbed, group: "sleep", w: 1.8, d: 2.0, h: 0.52, style: "bed", mat: "white" },
  { kind: "crib", label: FURNITURE_LABELS.crib, group: "sleep", w: 0.7, d: 1.4, h: 0.9, style: "bed", mat: "wood" },
  { kind: "nightstand", label: FURNITURE_LABELS.nightstand, group: "sleep", w: 0.5, d: 0.4, h: 0.55, style: "cabinet", mat: "wood", essential: true },
  { kind: "dresser", label: FURNITURE_LABELS.dresser, group: "sleep", w: 1.1, d: 0.5, h: 0.85, style: "cabinet", mat: "wood" },
  { kind: "wardrobe", label: FURNITURE_LABELS.wardrobe, group: "sleep", w: 1.8, d: 0.6, h: 2.2, style: "cabinet", mat: "darkwood", essential: true },

  { kind: "kitchen", label: FURNITURE_LABELS.kitchen, group: "cook", w: 3.0, d: 0.65, h: 0.9, style: "cabinet", mat: "white", essential: true },
  { kind: "counter", label: FURNITURE_LABELS.counter, group: "cook", w: 2.4, d: 0.6, h: 0.9, style: "cabinet", mat: "white" },
  { kind: "island", label: FURNITURE_LABELS.island, group: "cook", w: 2.0, d: 1.0, h: 0.9, style: "cabinet", mat: "white" },
  { kind: "fridge", label: FURNITURE_LABELS.fridge, group: "cook", w: 0.6, d: 0.65, h: 1.85, style: "appliance", mat: "metal", essential: true },
  { kind: "freezer", label: FURNITURE_LABELS.freezer, group: "cook", w: 0.6, d: 0.65, h: 1.85, style: "appliance", mat: "metal" },
  { kind: "stove", label: FURNITURE_LABELS.stove, group: "cook", w: 0.6, d: 0.6, h: 0.9, style: "appliance", mat: "metal" },
  { kind: "oven", label: FURNITURE_LABELS.oven, group: "cook", w: 0.6, d: 0.6, h: 0.6, style: "appliance", mat: "metal" },
  { kind: "microwave", label: FURNITURE_LABELS.microwave, group: "cook", w: 0.5, d: 0.4, h: 0.35, style: "appliance", mat: "metal" },
  { kind: "sink", label: FURNITURE_LABELS.sink, group: "cook", w: 1.2, d: 0.6, h: 0.9, style: "cabinet", mat: "white" },
  { kind: "dishwasher", label: FURNITURE_LABELS.dishwasher, group: "cook", w: 0.6, d: 0.6, h: 0.85, style: "appliance", mat: "metal" },
  { kind: "hood", label: FURNITURE_LABELS.hood, group: "cook", w: 0.9, d: 0.5, h: 0.45, style: "appliance", mat: "metal" },

  { kind: "bath", label: FURNITURE_LABELS.bath, group: "wet", w: 1.7, d: 0.75, h: 0.55, style: "sanitary", mat: "white", essential: true },
  { kind: "toilet", label: FURNITURE_LABELS.toilet, group: "wet", w: 0.4, d: 0.7, h: 0.8, style: "sanitary", mat: "white", essential: true },
  { kind: "shower", label: FURNITURE_LABELS.shower, group: "wet", w: 0.9, d: 0.9, h: 2.0, style: "sanitary", mat: "glass", essential: true },
  { kind: "basin", label: FURNITURE_LABELS.basin, group: "wet", w: 0.6, d: 0.45, h: 0.85, style: "sanitary", mat: "white" },
  { kind: "bidet", label: FURNITURE_LABELS.bidet, group: "wet", w: 0.38, d: 0.6, h: 0.4, style: "sanitary", mat: "white" },
  { kind: "washer", label: FURNITURE_LABELS.washer, group: "wet", w: 0.6, d: 0.6, h: 0.85, style: "appliance", mat: "metal" },
  { kind: "dryer", label: FURNITURE_LABELS.dryer, group: "wet", w: 0.6, d: 0.6, h: 0.85, style: "appliance", mat: "metal" },

  { kind: "desk", label: FURNITURE_LABELS.desk, group: "work", w: 1.4, d: 0.7, h: 0.75, style: "table", mat: "wood", essential: true },
  { kind: "officechair", label: FURNITURE_LABELS.officechair, group: "work", w: 0.62, d: 0.62, h: 1.05, style: "chair", mat: "metal" },
  { kind: "shelf", label: FURNITURE_LABELS.shelf, group: "work", w: 1.2, d: 0.35, h: 1.8, style: "cabinet", mat: "wood" },
  { kind: "bookshelf", label: FURNITURE_LABELS.bookshelf, group: "work", w: 2.0, d: 0.35, h: 2.2, style: "cabinet", mat: "darkwood" },
  { kind: "printer", label: FURNITURE_LABELS.printer, group: "work", w: 0.5, d: 0.45, h: 0.35, style: "box", mat: "white" },
  { kind: "millwork", label: FURNITURE_LABELS.millwork, group: "work", w: 2.4, d: 0.4, h: 2.4, style: "cabinet", mat: "clt" },

  { kind: "radiator", label: FURNITURE_LABELS.radiator, group: "tech", w: 1.0, d: 0.12, h: 0.6, style: "panel", mat: "metal" },
  { kind: "ac", label: FURNITURE_LABELS.ac, group: "tech", w: 0.9, d: 0.25, h: 0.3, style: "panel", mat: "metal" },
  { kind: "solar", label: FURNITURE_LABELS.solar, group: "tech", w: 1.7, d: 1.0, h: 0.08, style: "panel", mat: "metal", site: true },
  { kind: "chimney", label: FURNITURE_LABELS.chimney, group: "tech", w: 0.6, d: 0.6, h: 1.6, style: "box", mat: "brick" },
  { kind: "skylight", label: FURNITURE_LABELS.skylight, group: "tech", w: 0.78, d: 0.98, h: 0.12, style: "panel", mat: "glass" },

  { kind: "elevator", label: FURNITURE_LABELS.elevator, group: "core", w: 1.6, d: 1.8, h: 2.5, style: "cabinet", mat: "metal", essential: true },
  { kind: "staircore", label: FURNITURE_LABELS.staircore, group: "core", w: 2.6, d: 5.2, h: 2.8, style: "box", mat: "concrete", essential: true },
  { kind: "balcony", label: FURNITURE_LABELS.balcony, group: "core", w: 3.2, d: 1.4, h: 0.12, style: "panel", mat: "concrete", essential: true },
  { kind: "curtain", label: FURNITURE_LABELS.curtain, group: "core", w: 1.5, d: 0.08, h: 2.8, style: "panel", mat: "glass", essential: true },

  { kind: "plant", label: FURNITURE_LABELS.plant, group: "garden", w: 0.5, d: 0.5, h: 1.2, style: "plant", mat: "vegetation", site: true, essential: true },
  { kind: "tree", label: FURNITURE_LABELS.tree, group: "garden", w: 3.0, d: 3.0, h: 5.5, style: "tree", mat: "vegetation", site: true, essential: true },
  { kind: "olive", label: FURNITURE_LABELS.olive, group: "garden", w: 3.2, d: 3.2, h: 4.2, style: "tree", mat: "vegetation", site: true },
  { kind: "cypress", label: FURNITURE_LABELS.cypress, group: "garden", w: 1.1, d: 1.1, h: 6.5, style: "tree", mat: "vegetation", site: true },
  { kind: "hedge", label: FURNITURE_LABELS.hedge, group: "garden", w: 3.0, d: 0.45, h: 1.4, style: "hedge", mat: "vegetation", site: true },
  { kind: "planter", label: FURNITURE_LABELS.planter, group: "garden", w: 1.2, d: 0.4, h: 0.5, style: "box", mat: "terracotta", site: true },
  { kind: "bench", label: FURNITURE_LABELS.bench, group: "garden", w: 1.6, d: 0.45, h: 0.45, style: "box", mat: "wood", site: true },
  { kind: "pergola", label: FURNITURE_LABELS.pergola, group: "garden", w: 3.6, d: 3.6, h: 2.4, style: "pergola", mat: "wood", site: true },
  { kind: "barbecue", label: FURNITURE_LABELS.barbecue, group: "garden", w: 0.7, d: 0.5, h: 0.95, style: "appliance", mat: "metal", site: true },
  { kind: "umbrella", label: FURNITURE_LABELS.umbrella, group: "garden", w: 3.0, d: 3.0, h: 2.4, style: "panel", mat: "white", site: true },
  { kind: "fountain", label: FURNITURE_LABELS.fountain, group: "garden", w: 1.6, d: 1.6, h: 0.7, style: "pool", mat: "stone", site: true },
  { kind: "firepit", label: FURNITURE_LABELS.firepit, group: "garden", w: 1.1, d: 1.1, h: 0.45, style: "fire", mat: "corten", site: true },
  { kind: "pool", label: FURNITURE_LABELS.pool, group: "garden", w: 8, d: 3.5, h: 0.15, style: "pool", mat: "water", site: true },
  { kind: "jacuzzi", label: FURNITURE_LABELS.jacuzzi, group: "garden", w: 2.2, d: 2.2, h: 0.85, style: "pool", mat: "water", site: true },

  { kind: "fence", label: FURNITURE_LABELS.fence, group: "site", w: 3.0, d: 0.08, h: 1.2, style: "fence", mat: "wood", site: true },
  { kind: "gate", label: FURNITURE_LABELS.gate, group: "site", w: 3.5, d: 0.12, h: 1.6, style: "fence", mat: "metal", site: true },
  { kind: "lamppost", label: FURNITURE_LABELS.lamppost, group: "site", w: 0.2, d: 0.2, h: 3.2, style: "post", mat: "metal", site: true },
  { kind: "mailbox", label: FURNITURE_LABELS.mailbox, group: "site", w: 0.35, d: 0.18, h: 1.2, style: "box", mat: "corten", site: true },
  { kind: "car", label: FURNITURE_LABELS.car, group: "site", w: 4.2, d: 1.75, h: 1.48, style: "vehicle", mat: "metal", site: true, essential: true },
  { kind: "bike", label: FURNITURE_LABELS.bike, group: "site", w: 1.8, d: 0.5, h: 1.1, style: "vehicle", mat: "metal", site: true },
  { kind: "parking", label: FURNITURE_LABELS.parking, group: "site", w: 5.0, d: 2.5, h: 0.04, style: "rug", mat: "concrete", site: true },
  { kind: "evcharger", label: FURNITURE_LABELS.evcharger, group: "site", w: 0.28, d: 0.22, h: 1.4, style: "post", mat: "white", site: true },
  { kind: "people", label: FURNITURE_LABELS.people, group: "site", w: 0.45, d: 0.3, h: 1.75, style: "people", mat: "lime", site: true },
];

export const OBJECT_GROUPS: { id: string; label: string; kinds: FurnitureKind[] }[] = GROUP_META.map((g) => ({
  ...g,
  kinds: OBJECT_CATALOG.filter((o) => o.group === g.id).map((o) => o.kind),
}));

export const OBJECT_SIZES: Record<FurnitureKind, { w: number; d: number; h: number }> = Object.fromEntries(
  OBJECT_CATALOG.map((o) => [o.kind, { w: o.w, d: o.d, h: o.h }]),
) as Record<FurnitureKind, { w: number; d: number; h: number }>;

export const OBJECT_MESH: Record<FurnitureKind, { style: MeshStyle; mat: MaterialId }> = Object.fromEntries(
  OBJECT_CATALOG.map((o) => [o.kind, { style: o.style, mat: o.mat }]),
) as Record<FurnitureKind, { style: MeshStyle; mat: MaterialId }>;

export const OBJECT_LIST: ObjectDef[] = OBJECT_CATALOG;

export const SITE_KINDS = new Set<FurnitureKind>(OBJECT_CATALOG.filter((o) => o.site).map((o) => o.kind));

export const ESSENTIAL_KINDS = OBJECT_CATALOG.filter((o) => o.essential).map((o) => o.kind);

export function objectDef(kind: FurnitureKind): ObjectDef {
  return OBJECT_CATALOG.find((o) => o.kind === kind) ?? OBJECT_CATALOG[0]!;
}

export const WALL_PRESETS: {
  id: string;
  label: string;
  thickness: number;
  partition: boolean;
  loadBearing: boolean;
  insulationMm: number;
  uValue: number;
  fireRating: FireRating;
  alignment: WallAlign;
  role: WallRole;
  acousticRw: number;
}[] = [
  { id: "part", label: "Cloison 7", thickness: 0.07, partition: true, loadBearing: false, insulationMm: 0, uValue: 2.4, fireRating: "none", alignment: "center", role: "interior", acousticRw: 32 },
  { id: "ba13", label: "BA13 10", thickness: 0.1, partition: true, loadBearing: false, insulationMm: 45, uValue: 0.7, fireRating: "EI30", alignment: "center", role: "interior", acousticRw: 38 },
  { id: "int", label: "Mur 20", thickness: 0.2, partition: false, loadBearing: false, insulationMm: 0, uValue: 1.8, fireRating: "EI30", alignment: "center", role: "interior", acousticRw: 42 },
  { id: "beton", label: "Banché 20", thickness: 0.2, partition: false, loadBearing: true, insulationMm: 0, uValue: 2.3, fireRating: "EI120", alignment: "center", role: "interior", acousticRw: 55 },
  { id: "bois", label: "Ossature 20", thickness: 0.2, partition: false, loadBearing: true, insulationMm: 145, uValue: 0.18, fireRating: "EI30", alignment: "center", role: "exterior", acousticRw: 42 },
  { id: "iti", label: "ITI 28", thickness: 0.28, partition: false, loadBearing: true, insulationMm: 100, uValue: 0.28, fireRating: "EI60", alignment: "exterior", role: "exterior", acousticRw: 48 },
  { id: "iso", label: "ITE 36", thickness: 0.36, partition: false, loadBearing: true, insulationMm: 140, uValue: 0.22, fireRating: "EI60", alignment: "interior", role: "exterior", acousticRw: 52 },
  { id: "brique", label: "Brique 30", thickness: 0.3, partition: false, loadBearing: true, insulationMm: 0, uValue: 1.1, fireRating: "EI90", alignment: "center", role: "exterior", acousticRw: 50 },
  { id: "load", label: "Porteur 40", thickness: 0.4, partition: false, loadBearing: true, insulationMm: 80, uValue: 0.36, fireRating: "EI90", alignment: "center", role: "exterior", acousticRw: 55 },
  { id: "stone", label: "Pierre 50", thickness: 0.5, partition: false, loadBearing: true, insulationMm: 0, uValue: 1.5, fireRating: "EI90", alignment: "exterior", role: "exterior", acousticRw: 58 },
  { id: "rideau", label: "Rideau 12", thickness: 0.12, partition: false, loadBearing: false, insulationMm: 0, uValue: 1.4, fireRating: "EI30", alignment: "center", role: "exterior", acousticRw: 38 },
  { id: "noyau", label: "Noyau 30", thickness: 0.3, partition: false, loadBearing: true, insulationMm: 0, uValue: 2.1, fireRating: "EI120", alignment: "center", role: "interior", acousticRw: 58 },
];

export const DOOR_PRESETS: { id: string; label: string; width: number; height: number; sill: number; variant: OpeningVariant }[] = [
  { id: "d70", label: "Service 70", width: 0.7, height: 2.04, sill: 0, variant: "single" },
  { id: "d80", label: "Porte 80", width: 0.8, height: 2.04, sill: 0, variant: "single" },
  { id: "d90", label: "Porte 90", width: 0.9, height: 2.1, sill: 0, variant: "single" },
  { id: "pal", label: "Palière 90", width: 0.9, height: 2.04, sill: 0, variant: "single" },
  { id: "dd", label: "Double 160", width: 1.6, height: 2.15, sill: 0, variant: "double" },
  { id: "slide", label: "Coulissante", width: 1.8, height: 2.15, sill: 0, variant: "sliding" },
  { id: "pf", label: "Porte-fenêtre", width: 2.2, height: 2.2, sill: 0, variant: "french" },
  { id: "garage", label: "Garage 240", width: 2.4, height: 2.15, sill: 0, variant: "sliding" },
];

export const WINDOW_PRESETS: { id: string; label: string; width: number; height: number; sill: number; variant: OpeningVariant; glazing: Glazing }[] = [
  { id: "w14", label: "140 × 135", width: 1.4, height: 1.35, sill: 0.9, variant: "casement", glazing: "double" },
  { id: "w10", label: "100 × 105", width: 1.0, height: 1.05, sill: 1.0, variant: "casement", glazing: "double" },
  { id: "fix", label: "Fixe 180", width: 1.8, height: 1.5, sill: 0.4, variant: "fixed", glazing: "double" },
  { id: "coul", label: "Coulissante 240", width: 2.4, height: 2.15, sill: 0.05, variant: "sliding", glazing: "double" },
  { id: "bay", label: "Baie 320", width: 3.2, height: 2.2, sill: 0.05, variant: "sliding", glazing: "double" },
  { id: "tri", label: "Triple 140", width: 1.4, height: 1.35, sill: 0.9, variant: "casement", glazing: "triple" },
  { id: "vitr", label: "Vitrine 240", width: 2.4, height: 2.4, sill: 0.05, variant: "fixed", glazing: "double" },
  { id: "soupir", label: "Soupirail", width: 0.8, height: 0.5, sill: 0.3, variant: "fixed", glazing: "single" },
  { id: "velux", label: "Velux 78×98", width: 0.78, height: 0.98, sill: 1.4, variant: "casement", glazing: "double" },
  { id: "oeil", label: "Œil-de-bœuf", width: 0.6, height: 0.6, sill: 1.6, variant: "fixed", glazing: "double" },
];

export const SLAB_PRESETS: { id: string; label: string; thickness: number; insulationMm: number; liveLoad: number }[] = [
  { id: "hourdis", label: "Hourdis 16", thickness: 0.16, insulationMm: 60, liveLoad: 150 },
  { id: "floor", label: "Plancher 20", thickness: 0.2, insulationMm: 80, liveLoad: 150 },
  { id: "porte", label: "Dalle portée 22", thickness: 0.22, insulationMm: 100, liveLoad: 250 },
  { id: "terrace", label: "Terrasse 18", thickness: 0.18, insulationMm: 120, liveLoad: 250 },
  { id: "found", label: "Dalle 25", thickness: 0.25, insulationMm: 100, liveLoad: 150 },
];

export const ROOF_PRESETS: { id: string; label: string; kind: "flat" | "gable" | "shed" | "hip"; pitch: number; overhang: number }[] = [
  { id: "flat", label: "Terrasse 2%", kind: "flat", pitch: 2, overhang: 0.15 },
  { id: "zinc", label: "Zinc 5%", kind: "flat", pitch: 5, overhang: 0.2 },
  { id: "gable", label: "Deux pentes 30°", kind: "gable", pitch: 30, overhang: 0.45 },
  { id: "tuile", label: "Tuile 40°", kind: "gable", pitch: 40, overhang: 0.5 },
  { id: "shed", label: "Une pente 15°", kind: "shed", pitch: 15, overhang: 0.3 },
  { id: "hip", label: "Croupe 35°", kind: "hip", pitch: 35, overhang: 0.5 },
];

export const STAIR_PRESETS: { id: string; label: string; width: number; steps: number }[] = [
  { id: "std", label: "Courant 90", width: 0.9, steps: 16 },
  { id: "wide", label: "Large 110", width: 1.1, steps: 16 },
  { id: "quart", label: "Quart tournant", width: 0.9, steps: 18 },
  { id: "helico", label: "Hélicoïdale", width: 0.8, steps: 14 },
  { id: "esc", label: "Escamotable", width: 0.7, steps: 12 },
];
