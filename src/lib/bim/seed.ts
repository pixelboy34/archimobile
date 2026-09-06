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
    ...partial,
  }
}

export function seedVillaCalanque(): Project {
  const now = Date.now()
  const story = makeStory(0, 0, 2.8, 'RDC')
  const ox = -7
  const oz = -5
  const w = 14
  const d = 10

  const walls = rectWalls(story.id, ox, oz, w, d, 2.8, 0.25, 'exterior')
  for (const wall of walls) wall.materialId = 'enduit'

  // Interior partition
  walls.push({
    id: uid('wall'),
    storyId: story.id,
    a: { x: 0, y: oz },
    b: { x: 0, y: oz + d },
    thickness: 0.15,
    height: 2.8,
    typology: 'interior',
    materialId: 'enduit',
  })

  const openings = [
    makeOpening(walls[0].id, 'door', 0.35, 0.9, 2.1, 0),
    makeOpening(walls[1].id, 'window', 0.4, 1.5, 1.4, 0.9),
    makeOpening(walls[2].id, 'window', 0.5, 2.0, 1.5, 0.8),
    makeOpening(walls[3].id, 'window', 0.55, 1.2, 1.2, 1.0),
  ]

  const rooms = [
    makeRoom(story.id, 'Sejour', rectPolygon(ox, oz, 7, d)),
    makeRoom(story.id, 'Chambre', rectPolygon(0, oz, 7, 5)),
    makeRoom(story.id, 'Cuisine', rectPolygon(0, oz + 5, 7, 5)),
  ]

  const slabs = [
    makeSlab(story.id, rectPolygon(ox, oz, w, d), 0, 'floor', 0.25),
    // Pool
    makeSlab(story.id, rectPolygon(ox + 2, oz + d + 2, 6, 3.5), -0.4, 'pool', 0.15),
  ]

  const furniture = [
    makeFurniture(story.id, 'sofa', { x: ox + 3, y: oz + 3 }, 2.2, 0.9, 0.75, 0),
    makeFurniture(story.id, 'table', { x: ox + 3, y: oz + 5.5 }, 1.6, 0.9, 0.75, 0),
    makeFurniture(story.id, 'bed', { x: 3, y: oz + 2 }, 1.6, 2.0, 0.55, 0),
    makeFurniture(story.id, 'kitchen', { x: 3.5, y: oz + 7.5 }, 3.0, 0.6, 0.9, 0),
    makeFurniture(story.id, 'tree', { x: ox - 3, y: oz + 4 }, 1.5, 1.5, 4, 0),
  ]

  const columns = [
    makeColumn(story.id, { x: ox + 1, y: oz + 1 }, 2.8, 0.3),
    makeColumn(story.id, { x: ox + w - 1, y: oz + d - 1 }, 2.8, 0.3),
  ]

  const roofs = [
    {
      id: uid('roof'),
      storyId: story.id,
      polygon: rectPolygon(ox - 0.4, oz - 0.4, w + 0.8, d + 0.8),
      ridgeHeight: 1.2,
      overhang: 0.4,
    },
  ]

  return {
    id: 'villa-calanque',
    meta: meta({
      name: 'Villa Calanque',
      city: 'Cassis',
      latitude: 43.214,
      longitude: 5.538,
      north: 15,
      parcelWidth: 35,
      parcelDepth: 28,
      typology: 'villa',
      climate: 'mediterraneen',
    }),
    stories: [story],
    walls,
    openings,
    rooms,
    slabs,
    roofs,
    columns,
    stairs: [],
    furniture,
    updatedAt: now,
    createdAt: now,
  }
}

export function seedTourHorizon(): Project {
  const now = Date.now()
  const massing = generateMassing({ width: 12, depth: 18, floors: 8, floorHeight: 3 })
  return {
    id: 'tour-horizon',
    meta: meta({
      name: 'Tour Horizon',
      city: 'Lyon',
      latitude: 45.764,
      longitude: 4.835,
      north: 0,
      parcelWidth: 40,
      parcelDepth: 50,
      typology: 'immeuble',
      climate: 'continental',
      lightHour: 15,
    }),
    ...massing,
    updatedAt: now,
    createdAt: now,
  }
}

function simpleBox(id: string, name: string, city: string, w: number, d: number, lat: number, lon: number): Project {
  const now = Date.now()
  const story = makeStory(0, 0, 3.0, 'RDC')
  const ox = -w / 2
  const oz = -d / 2
  const walls = rectWalls(story.id, ox, oz, w, d, 3.0, 0.2, 'exterior')
  for (const wall of walls) wall.materialId = 'pierre'
  return {
    id,
    meta: meta({ name, city, latitude: lat, longitude: lon, parcelWidth: w + 15, parcelDepth: d + 15 }),
    stories: [story],
    walls,
    openings: [makeOpening(walls[0].id, 'door', 0.5, 1.0, 2.2, 0)],
    rooms: [makeRoom(story.id, 'Espace', rectPolygon(ox, oz, w, d))],
    slabs: [makeSlab(story.id, rectPolygon(ox, oz, w, d), 0, 'floor')],
    roofs: [{ id: uid('roof'), storyId: story.id, polygon: rectPolygon(ox - 0.3, oz - 0.3, w + 0.6, d + 0.6), ridgeHeight: 0.8, overhang: 0.3 }],
    columns: [],
    stairs: [],
    furniture: [makeFurniture(story.id, 'table', { x: 0, y: 0 }, 1.4, 0.8, 0.75)],
    updatedAt: now,
    createdAt: now,
  }
}

export function seedAtelierVoltaire(): Project {
  return simpleBox('atelier-voltaire', 'Atelier Voltaire', 'Paris', 16, 9, 48.86, 2.36)
}

export function seedMaisonPatio(): Project {
  return simpleBox('maison-patio', 'Maison Patio', 'Nimes', 12, 12, 43.84, 4.36)
}

export function seedPavillonLac(): Project {
  return simpleBox('pavillon-lac', 'Pavillon Lac', 'Annecy', 10, 8, 45.9, 6.13)
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
