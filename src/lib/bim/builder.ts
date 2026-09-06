import type { Vec2, Wall, Room, Slab, Opening, Column, Furniture, Story, Project, Meta, Stair, Roof } from './types'
import { uid } from './types'

export function rectWalls(
  storyId: string,
  x: number,
  z: number,
  w: number,
  d: number,
  height: number,
  thickness = 0.2,
  typology: Wall['typology'] = 'exterior',
): Wall[] {
  const corners: Vec2[] = [
    { x, y: z },
    { x: x + w, y: z },
    { x: x + w, y: z + d },
    { x, y: z + d },
  ]
  const walls: Wall[] = []
  for (let i = 0; i < 4; i++) {
    walls.push({
      id: uid('wall'),
      storyId,
      a: corners[i],
      b: corners[(i + 1) % 4],
      thickness,
      height,
      typology,
    })
  }
  return walls
}

export function makeStory(index: number, elevation: number, height: number, name?: string): Story {
  return {
    id: uid('story'),
    name: name ?? (index === 0 ? 'RDC' : `R+${index}`),
    elevation,
    height,
    index,
  }
}

export function makeRoom(storyId: string, name: string, polygon: Vec2[]): Room {
  return { id: uid('room'), storyId, name, polygon }
}

export function makeSlab(
  storyId: string,
  polygon: Vec2[],
  elevation: number,
  kind: Slab['kind'] = 'floor',
  thickness = 0.25,
): Slab {
  return { id: uid('slab'), storyId, kind, polygon, thickness, elevation }
}

export function makeOpening(wallId: string, kind: Opening['kind'], t: number, width: number, height: number, sill = 0): Opening {
  return { id: uid('open'), wallId, kind, t, width, height, sill }
}

export function makeColumn(storyId: string, position: Vec2, height: number, size = 0.4): Column {
  return { id: uid('col'), storyId, position, width: size, depth: size, height }
}

export function makeFurniture(
  storyId: string,
  kind: Furniture['kind'],
  position: Vec2,
  w: number,
  d: number,
  h: number,
  rotation = 0,
): Furniture {
  return { id: uid('furn'), storyId, kind, position, rotation, width: w, depth: d, height: h }
}

export function emptyProject(meta: Meta): Project {
  const now = Date.now()
  const story = makeStory(0, 0, 2.8)
  return {
    id: uid('proj'),
    meta,
    stories: [story],
    walls: [],
    openings: [],
    rooms: [],
    slabs: [],
    roofs: [],
    columns: [],
    stairs: [],
    furniture: [],
    updatedAt: now,
    createdAt: now,
  }
}

export function rectPolygon(x: number, z: number, w: number, d: number): Vec2[] {
  return [
    { x, y: z },
    { x: x + w, y: z },
    { x: x + w, y: z + d },
    { x, y: z + d },
  ]
}

export function makeStair(storyId: string, a: Vec2, b: Vec2, rises: number, width = 1.0): Stair {
  return { id: uid('stair'), storyId, a, b, width, rises }
}

export function makeRoof(storyId: string, polygon: Vec2[], ridgeHeight = 1.0, overhang = 0.3): Roof {
  return { id: uid('roof'), storyId, polygon, ridgeHeight, overhang }
}
