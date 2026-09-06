import { SITE_KINDS } from "./catalog";
import type { Furniture, Slab } from "./types";

export const BUILD_PHASES = [
  { id: 0, label: "Terrain" },
  { id: 1, label: "Fondations" },
  { id: 2, label: "Structure" },
  { id: 3, label: "Murs" },
  { id: 4, label: "Plancher" },
  { id: 5, label: "Toiture" },
  { id: 6, label: "Ouvertures" },
  { id: 7, label: "Finitions" },
] as const;

export const PHASE_DONE = BUILD_PHASES.length - 1;

export function slabPhase(s: Slab): number {
  return s.outdoor ? 0 : 1;
}

export function furniturePhase(f: Furniture): number {
  if (SITE_KINDS.has(f.kind)) return 0;
  return 7;
}

export function visibleAt(phase: number, entityPhase: number): boolean {
  return entityPhase <= phase;
}
