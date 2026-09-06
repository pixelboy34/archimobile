export type Vec2 = { x: number; y: number }

export type Story = {
  id: string
  name: string
  elevation: number
  height: number
  index: number
}

export type WallTypology = 'exterior' | 'interior' | 'curtain' | 'core'

export type Wall = {
  id: string
  storyId: string
  a: Vec2
  b: Vec2
  thickness: number
  height: number
  typology: WallTypology
  materialId?: string
}

export type OpeningKind = 'door' | 'window' | 'opening'

export type Opening = {
  id: string
  wallId: string
  kind: OpeningKind
  t: number
  width: number
  height: number
  sill: number
}

export type Room = {
  id: string
  storyId: string
  name: string
  polygon: Vec2[]
  floorFinish?: string
}

export type SlabKind = 'floor' | 'roof' | 'terrace' | 'pool' | 'ground'

export type Slab = {
  id: string
  storyId: string
  kind: SlabKind
  polygon: Vec2[]
  thickness: number
  elevation: number
  materialId?: string
}

export type Roof = {
  id: string
  storyId: string
  polygon: Vec2[]
  ridgeHeight: number
  overhang: number
}

export type Column = {
  id: string
  storyId: string
  position: Vec2
  width: number
  depth: number
  height: number
}

export type StairMode = 'droit' | 'quart' | 'demi'

export type Stair = {
  id: string
  storyId: string
  /** Waypoints: depart → paliers / angles → arrivee (optional on legacy saves) */
  path?: Vec2[]
  width: number
  rises: number
  mode?: StairMode
  /** Optional explicit total rise (m); default = story height */
  rise?: number
  /** Legacy first/last path points (kept for IFC / older saves) */
  a: Vec2
  b: Vec2
}

export type FurnitureKind =
  | 'sofa'
  | 'table'
  | 'bed'
  | 'desk'
  | 'chair'
  | 'kitchen'
  | 'tree'
  | 'car'
  | 'elevator'
  | 'staircore'
  | 'balcony'
  | 'curtain'

export type Furniture = {
  id: string
  storyId: string
  kind: FurnitureKind
  position: Vec2
  rotation: number
  width: number
  depth: number
  height: number
}

export type Meta = {
  name: string
  city: string
  latitude: number
  longitude: number
  north: number
  parcelWidth: number
  parcelDepth: number
  typology: string
  climate?: string
  lightHour: number
}

export type Project = {
  id: string
  meta: Meta
  stories: Story[]
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  slabs: Slab[]
  roofs: Roof[]
  columns: Column[]
  stairs: Stair[]
  furniture: Furniture[]
  updatedAt: number
  createdAt: number
}

export type ViewMode = 'plan' | '3d' | 'visite' | 'coupe' | 'ar'
export type SkillLevel = 'simple' | 'pro'
export type InspectorTab = 'ouvrage' | 'etages' | 'site' | 'vue'
export type ToolMode =
  | 'select'
  | 'wall'
  | 'rect'
  | 'objects'
  | 'trim'
  | 'extend'
  | 'door'
  | 'window'
  | 'slab'
  | 'column'
  | 'stair'
  | 'roof'

export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'slab'; id: string }
  | { kind: 'story'; id: string }
  | { kind: 'column'; id: string }
  | { kind: 'stair'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'roof'; id: string }
  | null

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function wallLength(w: Wall): number {
  const dx = w.b.x - w.a.x
  const dy = w.b.y - w.a.y
  return Math.hypot(dx, dy)
}

export function wallCenter(w: Wall): Vec2 {
  return { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }
}

export function wallAngle(w: Wall): number {
  return Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
}
