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
  beton_lisse: { id: 'beton_lisse', label: 'Beton lisse', color: '#c4cacf', roughness: 0.45, metalness: 0.06, map: 'concrete' },
  enduit: { id: 'enduit', label: 'Enduit blanc', color: '#f0ebe3', roughness: 0.62, metalness: 0, map: 'plaster' },
  enduit_gris: { id: 'enduit_gris', label: 'Enduit gris', color: '#d5d2cc', roughness: 0.68, metalness: 0, map: 'plaster' },
  pierre: { id: 'pierre', label: 'Pierre', color: '#c9bda8', roughness: 0.88, metalness: 0, map: 'concrete' },
  pierre_claire: { id: 'pierre_claire', label: 'Pierre claire', color: '#ddd5c4', roughness: 0.82, metalness: 0, map: 'concrete' },
  bois: { id: 'bois', label: 'Bois', color: '#8b6914', roughness: 0.55, metalness: 0, map: 'wood' },
  bois_clair: { id: 'bois_clair', label: 'Bois clair', color: '#c4a574', roughness: 0.5, metalness: 0, map: 'wood' },
  parquet: { id: 'parquet', label: 'Parquet', color: '#b08968', roughness: 0.5, metalness: 0, map: 'wood' },
  verre: { id: 'verre', label: 'Verre', color: '#c5e8f5', roughness: 0.05, metalness: 0.15 },
  verre_teinte: { id: 'verre_teinte', label: 'Verre teinte', color: '#6a9aaa', roughness: 0.08, metalness: 0.2 },
  acier: { id: 'acier', label: 'Acier', color: '#8a929c', roughness: 0.28, metalness: 0.85 },
  aluminium: { id: 'aluminium', label: 'Aluminium', color: '#b8c0c8', roughness: 0.32, metalness: 0.9 },
  zinc: { id: 'zinc', label: 'Zinc', color: '#9aa3ab', roughness: 0.35, metalness: 0.7 },
  cuivre: { id: 'cuivre', label: 'Cuivre', color: '#b87333', roughness: 0.4, metalness: 0.85 },
  tuile: { id: 'tuile', label: 'Tuile', color: '#8b4513', roughness: 0.72, metalness: 0, map: 'tile' },
  ardoise: { id: 'ardoise', label: 'Ardoise', color: '#4a5560', roughness: 0.75, metalness: 0.1, map: 'tile' },
  herbe: { id: 'herbe', label: 'Herbe', color: '#3d5c3a', roughness: 0.95, metalness: 0, map: 'grass' },
  eau: { id: 'eau', label: 'Eau', color: '#2f7a9a', roughness: 0.08, metalness: 0.35 },
  rideau: { id: 'rideau', label: 'Mur rideau', color: '#8ec4d4', roughness: 0.12, metalness: 0.45 },
  brique: { id: 'brique', label: 'Brique', color: '#a65d3f', roughness: 0.85, metalness: 0, map: 'concrete' },
  crepis: { id: 'crepis', label: 'Crepis', color: '#e8dcc8', roughness: 0.9, metalness: 0, map: 'plaster' },
  carrelage: { id: 'carrelage', label: 'Carrelage', color: '#e4e8ec', roughness: 0.35, metalness: 0.05, map: 'tile' },
  bitume: { id: 'bitume', label: 'Bitume', color: '#2a2a2e', roughness: 0.92, metalness: 0 },
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
  lamp: { label: 'Lampe', w: 0.35, d: 0.35, h: 1.5, color: '#d4c4a8' },
  shelf: { label: 'Etagere', w: 1.2, d: 0.35, h: 1.8, color: '#6b5344' },
  bathtub: { label: 'Baignoire', w: 1.7, d: 0.75, h: 0.55, color: '#e8eef2' },
  plant: { label: 'Plante', w: 0.5, d: 0.5, h: 1.1, color: '#3d6b3a' },
  parking: { label: 'Place parking', w: 2.5, d: 5.0, h: 0.05, color: '#4a5568' },
}

export type FurnitureFamily = {
  id: string
  label: string
  kinds: FurnitureKind[]
}

export const FURNITURE_FAMILIES: FurnitureFamily[] = [
  { id: 'salon', label: 'Salon', kinds: ['sofa', 'table', 'chair', 'lamp', 'shelf'] },
  { id: 'chambre', label: 'Chambre', kinds: ['bed', 'desk', 'shelf'] },
  { id: 'cuisine', label: 'Cuisine', kinds: ['kitchen'] },
  { id: 'bain', label: 'Salle de bain', kinds: ['bathtub'] },
  { id: 'exterieur', label: 'Exterieur', kinds: ['tree', 'car', 'plant', 'parking'] },
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
