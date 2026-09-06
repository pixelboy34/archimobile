import type { Project, Meta } from './types'
import { uid } from './types'
import {
  makeStory,
  rectWalls,
  rectPolygon,
  makeRoom,
  makeSlab,
  makeOpening,
  makeFurniture,
  makeColumn,
  makeRoof,
  makeRailing,
  emptyProject,
} from './builder'
import { generateMassing } from '../cad/massing'

function meta(partial: Partial<Meta> & Pick<Meta, 'name' | 'city'>): Meta {
  return {
    latitude: 43.3,
    longitude: 5.4,
    north: 0,
    parcelWidth: 40,
    parcelDepth: 30,
    typology: 'logement',
    lightHour: 14,
    ces: 0.4,
    cos: 1.2,
    sismo: '2',
    ...partial,
  }
}

export function seedVillaCalanque(): Project {
  const now = Date.now()
  const story = makeStory(0, 0, 2.85, 'RDC')
  const ox = -8
  const oz = -5.5
  const w = 16
  const d = 9

  const walls = rectWalls(story.id, ox, oz, w, d, 2.85, 0.28, 'exterior')
  for (const wall of walls) wall.materialId = 'enduit'

  walls.push(
    {
      id: uid('wall'),
      storyId: story.id,
      a: { x: ox + 7.2, y: oz },
      b: { x: ox + 7.2, y: oz + d },
      thickness: 0.14,
      height: 2.85,
      typology: 'interior',
      materialId: 'enduit',
    },
    {
      id: uid('wall'),
      storyId: story.id,
      a: { x: ox + 7.2, y: oz + 4.2 },
      b: { x: ox + w, y: oz + 4.2 },
      thickness: 0.14,
      height: 2.85,
      typology: 'interior',
      materialId: 'enduit',
    },
    {
      id: uid('wall'),
      storyId: story.id,
      a: { x: ox + 11.6, y: oz + 4.2 },
      b: { x: ox + 11.6, y: oz + d },
      thickness: 0.12,
      height: 2.85,
      typology: 'interior',
      materialId: 'enduit',
    },
  )

  const south = walls[0]!
  const east = walls[1]!
  const north = walls[2]!
  const west = walls[3]!

  const openings = [
    makeOpening(south.id, 'door', 0.28, 1.0, 2.15, 0),
    makeOpening(south.id, 'window', 0.58, 2.4, 2.2, 0.15),
    makeOpening(south.id, 'window', 0.82, 1.5, 1.5, 0.85),
    makeOpening(east.id, 'window', 0.35, 1.4, 1.45, 0.9),
    makeOpening(east.id, 'window', 0.72, 1.2, 1.35, 0.95),
    makeOpening(north.id, 'window', 0.4, 1.8, 1.4, 0.9),
    makeOpening(north.id, 'window', 0.7, 1.4, 1.35, 0.95),
    makeOpening(west.id, 'window', 0.45, 1.6, 1.5, 0.85),
    makeOpening(west.id, 'door', 0.78, 0.9, 2.1, 0),
  ]

  const rooms = [
    makeRoom(story.id, 'Sejour', rectPolygon(ox, oz, 7.2, d)),
    makeRoom(story.id, 'Cuisine', rectPolygon(ox + 7.2, oz, 8.8, 4.2)),
    makeRoom(story.id, 'Chambre', rectPolygon(ox + 7.2, oz + 4.2, 4.4, 4.8)),
    makeRoom(story.id, 'Suite', rectPolygon(ox + 11.6, oz + 4.2, 4.4, 4.8)),
  ]

  const slabs = [
    makeSlab(story.id, rectPolygon(ox, oz, w, d), 0, 'floor', 0.28),
    makeSlab(story.id, rectPolygon(ox + 1, oz - 4.2, 10, 4.0), -0.02, 'terrace', 0.12),
    makeSlab(story.id, rectPolygon(ox + 2.5, oz - 7.6, 7.5, 3.2), -0.55, 'pool', 0.18),
    makeSlab(story.id, rectPolygon(ox + 1.5, oz - 8.4, 9.5, 4.0), -0.08, 'terrace', 0.1),
  ]

  const furniture = [
    makeFurniture(story.id, 'sofa', { x: ox + 3.2, y: oz + 3.2 }, 2.4, 0.95, 0.78, 0),
    makeFurniture(story.id, 'table', { x: ox + 3.2, y: oz + 5.6 }, 1.7, 0.95, 0.75, 0),
    makeFurniture(story.id, 'chair', { x: ox + 2.2, y: oz + 5.6 }, 0.45, 0.5, 0.9, 0.2),
    makeFurniture(story.id, 'chair', { x: ox + 4.2, y: oz + 5.6 }, 0.45, 0.5, 0.9, -0.2),
    makeFurniture(story.id, 'kitchen', { x: ox + 11.5, y: oz + 1.4 }, 3.4, 0.62, 0.92, 0),
    makeFurniture(story.id, 'table', { x: ox + 9.2, y: oz + 2.6 }, 1.4, 0.8, 0.75, 0),
    makeFurniture(story.id, 'bed', { x: ox + 9.3, y: oz + 6.5 }, 1.6, 2.0, 0.55, Math.PI / 2),
    makeFurniture(story.id, 'bed', { x: ox + 13.8, y: oz + 6.5 }, 1.6, 2.0, 0.55, Math.PI / 2),
    makeFurniture(story.id, 'desk', { x: ox + 14.8, y: oz + 5.0 }, 1.2, 0.6, 0.75, 0),
    makeFurniture(story.id, 'tree', { x: ox - 3.2, y: oz + 2 }, 1.6, 1.6, 4.2, 0),
    makeFurniture(story.id, 'tree', { x: ox + w + 2.5, y: oz + 6 }, 1.4, 1.4, 3.8, 0.4),
    makeFurniture(story.id, 'tree', { x: ox + 12, y: oz - 9.5 }, 1.3, 1.3, 3.5, 0.1),
    makeFurniture(story.id, 'car', { x: ox - 5.5, y: oz + d + 3.5 }, 4.2, 1.8, 1.45, Math.PI / 2),
  ]

  const columns = [
    makeColumn(story.id, { x: ox + 1.2, y: oz - 0.8 }, 2.85, 0.28),
    makeColumn(story.id, { x: ox + 10.5, y: oz - 0.8 }, 2.85, 0.28),
  ]

  const roofs = [
    makeRoof(story.id, rectPolygon(ox - 0.55, oz - 0.55, w + 1.1, d + 1.1), 0.3, 0.55, '2pentes', 28),
  ]

  const railings = [
    makeRailing(story.id, [{ x: ox + 1.5, y: oz - 4.2 }, { x: ox + 11, y: oz - 4.2 }], 1.0, 'acier'),
  ]

  return {
    id: 'villa-calanque',
    meta: meta({
      name: 'Villa Calanque',
      city: 'Cassis',
      latitude: 43.214,
      longitude: 5.538,
      north: 12,
      parcelWidth: 42,
      parcelDepth: 36,
      typology: 'villa',
      climate: 'mediterraneen',
      lightHour: 15,
    }),
    stories: [story],
    walls,
    openings,
    rooms,
    slabs,
    roofs,
    columns,
    stairs: [],
    railings,
    furniture,
    updatedAt: now,
    createdAt: now,
  }
}

export function seedTourHorizon(): Project {
  const now = Date.now()
  const massing = generateMassing({ width: 14, depth: 20, floors: 8, floorHeight: 3.1 })
  const ground = massing.stories[0]!

  const lobbyFurniture = [
    makeFurniture(ground.id, 'sofa', { x: -3.5, y: -7.5 }, 2.4, 0.9, 0.75, 0),
    makeFurniture(ground.id, 'sofa', { x: 3.5, y: -7.5 }, 2.4, 0.9, 0.75, Math.PI),
    makeFurniture(ground.id, 'table', { x: 0, y: -7.2 }, 1.2, 1.2, 0.45, 0),
    makeFurniture(ground.id, 'desk', { x: 0, y: -4.2 }, 2.2, 0.7, 1.1, 0),
    makeFurniture(ground.id, 'chair', { x: -1.2, y: -3.4 }, 0.5, 0.5, 0.95, 0),
    makeFurniture(ground.id, 'tree', { x: -5.5, y: -9.2 }, 1.2, 1.2, 3.2, 0),
    makeFurniture(ground.id, 'tree', { x: 5.5, y: -9.2 }, 1.2, 1.2, 3.2, 0.3),
  ]

  const lobbyRoom = makeRoom(ground.id, 'Lobby', rectPolygon(-7, -10, 14, 6))
  const rooms = [lobbyRoom, ...massing.rooms.filter((r) => r.storyId !== ground.id)]
  rooms.push(makeRoom(ground.id, 'Plateau', rectPolygon(-7, -4, 14, 14)))

  return {
    id: 'tour-horizon',
    meta: meta({
      name: 'Tour Horizon',
      city: 'Lyon',
      latitude: 45.764,
      longitude: 4.835,
      north: 0,
      parcelWidth: 48,
      parcelDepth: 56,
      typology: 'immeuble',
      climate: 'continental',
      lightHour: 15,
    }),
    ...massing,
    furniture: [...massing.furniture, ...lobbyFurniture],
    rooms,
    updatedAt: now,
    createdAt: now,
  }
}

function premiumBox(
  id: string,
  name: string,
  city: string,
  w: number,
  d: number,
  lat: number,
  lon: number,
  typology: string,
  withTree: boolean,
): Project {
  const now = Date.now()
  const story = makeStory(0, 0, 3.0, 'RDC')
  const ox = -w / 2
  const oz = -d / 2
  const walls = rectWalls(story.id, ox, oz, w, d, 3.0, 0.22, 'exterior')
  for (const wall of walls) wall.materialId = 'pierre'
  const openings = [
    makeOpening(walls[0]!.id, 'door', 0.5, 1.1, 2.2, 0),
    makeOpening(walls[1]!.id, 'window', 0.4, 1.5, 1.5, 0.9),
    makeOpening(walls[2]!.id, 'window', 0.5, 1.8, 1.45, 0.9),
    makeOpening(walls[3]!.id, 'window', 0.55, 1.3, 1.4, 0.95),
  ]
  const furniture = [
    makeFurniture(story.id, 'table', { x: 0, y: 0.5 }, 1.6, 0.9, 0.75),
    makeFurniture(story.id, 'sofa', { x: -2, y: -1.5 }, 2.2, 0.9, 0.75, 0.2),
    makeFurniture(story.id, 'chair', { x: 1.2, y: 0.5 }, 0.45, 0.5, 0.9, 0),
  ]
  if (withTree) {
    furniture.push(makeFurniture(story.id, 'tree', { x: ox - 2.5, y: oz + d / 2 }, 1.4, 1.4, 3.6, 0))
  }
  return {
    id,
    meta: meta({
      name,
      city,
      latitude: lat,
      longitude: lon,
      parcelWidth: w + 16,
      parcelDepth: d + 16,
      typology,
    }),
    stories: [story],
    walls,
    openings,
    rooms: [makeRoom(story.id, 'Espace', rectPolygon(ox, oz, w, d))],
    slabs: [
      makeSlab(story.id, rectPolygon(ox, oz, w, d), 0, 'floor'),
      makeSlab(story.id, rectPolygon(ox - 1, oz - 2.5, w + 2, 2.2), -0.02, 'terrace', 0.1),
    ],
    roofs: [makeRoof(story.id, rectPolygon(ox - 0.35, oz - 0.35, w + 0.7, d + 0.7), 0.3, 0.35, 'terrasse', 30)],
    columns: [
      makeColumn(story.id, { x: ox + 0.8, y: oz + 0.8 }, 3.0, 0.35),
      makeColumn(story.id, { x: ox + w - 0.8, y: oz + d - 0.8 }, 3.0, 0.35),
    ],
    stairs: [],
    railings: [],
    furniture,
    updatedAt: now,
    createdAt: now,
  }
}

export function seedAtelierVoltaire(): Project {
  return premiumBox('atelier-voltaire', 'Atelier Voltaire', 'Paris', 16, 9, 48.86, 2.36, 'atelier', true)
}

export function seedMaisonPatio(): Project {
  const p = premiumBox('maison-patio', 'Maison Patio', 'Nimes', 14, 14, 43.84, 4.36, 'villa', true)
  const story = p.stories[0]!
  p.slabs.push(makeSlab(story.id, rectPolygon(-2.5, -2.5, 5, 5), -0.05, 'terrace', 0.08))
  p.furniture.push(makeFurniture(story.id, 'tree', { x: 0, y: 0 }, 1.5, 1.5, 3.8, 0))
  return p
}

export function seedPavillonLac(): Project {
  return premiumBox('pavillon-lac', 'Pavillon Lac', 'Annecy', 11, 8, 45.9, 6.13, 'pavillon', true)
}

export function allSeeds(): Project[] {
  return [
    seedVillaCalanque(),
    seedTourHorizon(),
    seedAtelierVoltaire(),
    seedMaisonPatio(),
    seedPavillonLac(),
  ]
}

export function newSketchProject(name = 'Esquisse'): Project {
  const p = emptyProject(
    meta({ name, city: 'France', typology: 'esquisse', parcelWidth: 30, parcelDepth: 25 }),
  )
  p.id = uid('proj')
  return p
}

