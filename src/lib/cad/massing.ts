import type { Project, Wall, Slab, Furniture, Column } from '../bim/types'
import { uid } from '../bim/types'
import { makeStory, rectWalls, rectPolygon, makeSlab, makeFurniture, makeColumn, makeRoom } from '../bim/builder'

export type MassingParams = {
  width: number
  depth: number
  floors: number
  floorHeight: number
}

/** Plateau + noyau + etages empiles + terrasse. Caps floors at 80. */
export function generateMassing(params: MassingParams): Pick<
  Project,
  'stories' | 'walls' | 'slabs' | 'columns' | 'furniture' | 'rooms' | 'roofs' | 'openings' | 'stairs'
> {
  const width = Math.max(6, params.width)
  const depth = Math.max(6, params.depth)
  const floors = Math.min(80, Math.max(1, Math.round(params.floors)))
  const hsp = Math.max(2.5, Math.min(4.5, params.floorHeight))

  const ox = -width / 2
  const oz = -depth / 2

  const stories = []
  const walls: Wall[] = []
  const slabs: Slab[] = []
  const columns: Column[] = []
  const furniture: Furniture[] = []

  // Core size
  const coreW = Math.min(4, width * 0.25)
  const coreD = Math.min(5, depth * 0.3)
  const coreX = -coreW / 2
  const coreZ = -coreD / 2

  for (let i = 0; i < floors; i++) {
    const elev = i * hsp
    const story = makeStory(i, elev, hsp)
    stories.push(story)

    // Exterior envelope
    const envelope = rectWalls(story.id, ox, oz, width, depth, hsp, 0.25, i === 0 ? 'exterior' : 'curtain')
    for (const w of envelope) {
      w.materialId = i === 0 ? 'beton' : 'rideau'
      walls.push(w)
    }

    // Core walls
    const core = rectWalls(story.id, coreX, coreZ, coreW, coreD, hsp, 0.2, 'core')
    for (const w of core) {
      w.materialId = 'beton'
      walls.push(w)
    }

    // Floor slab
    slabs.push(makeSlab(story.id, rectPolygon(ox, oz, width, depth), elev, 'floor', 0.3))

    // Core furniture markers
    furniture.push(
      makeFurniture(story.id, 'elevator', { x: 0, y: coreZ + 1 }, 1.8, 1.8, hsp - 0.2),
      makeFurniture(story.id, 'staircore', { x: 0, y: coreZ + coreD - 1.2 }, 2.2, 2.4, hsp - 0.2),
    )

    // Corner columns
    const inset = 0.6
    for (const [cx, cz] of [
      [ox + inset, oz + inset],
      [ox + width - inset, oz + inset],
      [ox + width - inset, oz + depth - inset],
      [ox + inset, oz + depth - inset],
    ] as const) {
      columns.push(makeColumn(story.id, { x: cx, y: cz }, hsp, 0.45))
    }
  }

  // Ground plate / podium
  const platePad = 2
  const plateStory = stories[0]
  slabs.unshift(
    makeSlab(
      plateStory.id,
      rectPolygon(ox - platePad, oz - platePad, width + platePad * 2, depth + platePad * 2),
      -0.15,
      'ground',
      0.2,
    ),
  )

  // Roof terrace on top
  const top = stories[stories.length - 1]
  const topElev = top.elevation + top.height
  slabs.push(makeSlab(top.id, rectPolygon(ox + 0.5, oz + 0.5, width - 1, depth - 1), topElev, 'terrace', 0.2))

  // Open plateau rooms (helps visite spawn off the core)
  const rooms = stories.map((story) =>
    makeRoom(story.id, 'Plateau', rectPolygon(ox, oz, width, depth)),
  )

  // Simple stair runs in the core for IFC (one per story except top)
  const stairs = stories.slice(0, -1).map((story) => ({
    id: `stair-${story.id}`,
    storyId: story.id,
    a: { x: -0.6, y: coreZ + coreD - 1.4 },
    b: { x: 0.6, y: coreZ + coreD - 1.4 },
    width: 1.2,
    rises: Math.max(8, Math.round(hsp / 0.17)),
  }))

  return {
    stories,
    walls,
    slabs,
    columns,
    furniture,
    rooms,
    roofs: [],
    openings: [],
    stairs,
  }
}
