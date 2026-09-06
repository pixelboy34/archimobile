import type { FurnitureKind } from './types'

export type MaterialDef = {
  id: string
  label: string
  color: string
  roughness: number
  metalness: number
  map?: 'plaster' | 'concrete' | 'wood' | 'tile' | 'grass'
}

export const MATERIALS: Record<string, MaterialDef> = {
  beton: { id: 'beton', label: 'Beton', color: '#a8b0b5', roughness: 0.78, metalness: 0.04, map: 'concrete' },
  enduit: { id: 'enduit', label: 'Enduit blanc', color: '#f0ebe3', roughness: 0.62, metalness: 0, map: 'plaster' },
  pierre: { id: 'pierre', label: 'Pierre', color: '#c9bda8', roughness: 0.88, metalness: 0, map: 'concrete' },
  bois: { id: 'bois', label: 'Bois', color: '#8b6914', roughness: 0.55, metalness: 0, map: 'wood' },
  verre: { id: 'verre', label: 'Verre', color: '#c5e8f5', roughness: 0.05, metalness: 0.15 },
  acier: { id: 'acier', label: 'Acier', color: '#8a929c', roughness: 0.28, metalness: 0.85 },
  tuile: { id: 'tuile', label: 'Tuile', color: '#8b4513', roughness: 0.72, metalness: 0, map: 'tile' },
  herbe: { id: 'herbe', label: 'Herbe', color: '#3d5c3a', roughness: 0.95, metalness: 0, map: 'grass' },
  eau: { id: 'eau', label: 'Eau', color: '#2f7a9a', roughness: 0.08, metalness: 0.35 },
  rideau: { id: 'rideau', label: 'Mur rideau', color: '#8ec4d4', roughness: 0.12, metalness: 0.45 },
}

export const FURNITURE_PRESETS: Record<string, { label: string; w: number; d: number; h: number; color: string }> = {
  sofa: { label: 'Canape', w: 2.2, d: 0.9, h: 0.75, color: '#4a5568' },
  table: { label: 'Table', w: 1.6, d: 0.9, h: 0.75, color: '#6b4423' },
  bed: { label: 'Lit', w: 1.6, d: 2.0, h: 0.55, color: '#718096' },
  desk: { label: 'Bureau', w: 1.4, d: 0.7, h: 0.75, color: '#5a4632' },
  chair: { label: 'Chaise', w: 0.45, d: 0.5, h: 0.9, color: '#2d3748' },
  kitchen: { label: 'Cuisine', w: 3.0, d: 0.6, h: 0.9, color: '#e2e8f0' },
  tree: { label: 'Arbre', w: 1.2, d: 1.2, h: 3.5, color: '#2f5d2e' },
  car: { label: 'Voiture', w: 4.2, d: 1.8, h: 1.5, color: '#1a365d' },
  elevator: { label: 'Ascenseur', w: 2.0, d: 2.0, h: 2.8, color: '#4a5568' },
  staircore: { label: 'Cage escalier', w: 2.5, d: 3.0, h: 2.8, color: '#718096' },
  balcony: { label: 'Balcon', w: 3.0, d: 1.2, h: 1.1, color: '#a0aec0' },
  curtain: { label: 'Rideau', w: 6.0, d: 0.2, h: 2.8, color: '#7eb8c9' },
}

export type FurnitureFamily = {
  id: string
  label: string
  kinds: FurnitureKind[]
}

export const FURNITURE_FAMILIES: FurnitureFamily[] = [
  { id: 'salon', label: 'Salon', kinds: ['sofa', 'table', 'chair'] },
  { id: 'chambre', label: 'Chambre', kinds: ['bed', 'desk'] },
  { id: 'cuisine', label: 'Cuisine', kinds: ['kitchen'] },
  { id: 'exterieur', label: 'Exterieur', kinds: ['tree', 'car'] },
  { id: 'noyau', label: 'Noyau', kinds: ['elevator', 'staircore', 'balcony', 'curtain'] },
]

export const OPENING_DEFAULTS = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.4, sill: 0.9 },
  opening: { width: 1.0, height: 2.1, sill: 0 },
} as const

export const COLUMN_DEFAULT_SIZE = 0.4
export const SLAB_DEFAULT_THICKNESS = 0.25
export const STAIR_DEFAULT_WIDTH = 1.0
export const ROOF_DEFAULT_RIDGE = 0.35
export const ROOF_DEFAULT_PITCH = 30
export const RAILING_DEFAULT_HEIGHT = 1.0
