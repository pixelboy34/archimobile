import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  placeOpeningAtWall,
  placeSlabRect,
  placeSlabPolygon,
  placeColumnAt,
  placeStairRun,
  placeStairPath,
  nearestWallHit,
} from './ops'
import type { Project, Wall, Opening, Room } from '../bim/types'

function emptyProject(walls: Wall[], openings: Opening[] = [], rooms: Room[] = []): Project {
  return {
    id: 'p1',
    meta: {
      name: 't',
      city: '',
      latitude: 0,
      longitude: 0,
      north: 0,
      parcelWidth: 20,
      parcelDepth: 20,
      typology: 'test',
      lightHour: 12,
    },
    stories: [{ id: 's1', name: 'RDC', elevation: 0, height: 2.8, index: 0 }],
    walls,
    openings,
    rooms,
    slabs: [],
    roofs: [],
    columns: [],
    stairs: [],
    furniture: [],
    updatedAt: 0,
    createdAt: 0,
  }
}

describe('placement ouvrage', () => {
  it('nearestWallHit returns t along wall', () => {
    const walls: Wall[] = [
      {
        id: 'w1',
        storyId: 's1',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        thickness: 0.2,
        height: 2.8,
        typology: 'exterior',
      },
    ]
    const hit = nearestWallHit({ x: 4, y: 0.2 }, walls, 0.5)
    assert.ok(hit)
    assert.equal(hit!.wall.id, 'w1')
    assert.ok(Math.abs(hit!.t - 0.4) < 0.02)
  })

  it('placeOpeningAtWall adds door with defaults', () => {
    const base = emptyProject([
      {
        id: 'w1',
        storyId: 's1',
        a: { x: 0, y: 0 },
        b: { x: 8, y: 0 },
        thickness: 0.2,
        height: 2.8,
        typology: 'exterior',
      },
    ])
    const { project, openingId } = placeOpeningAtWall(base, 'w1', 0.5, 'door')
    assert.ok(openingId)
    assert.equal(project.openings.length, 1)
    assert.equal(project.openings[0]!.kind, 'door')
    assert.equal(project.openings[0]!.width, 0.9)
    assert.equal(project.openings[0]!.sill, 0)
  })

  it('placeSlabRect / placeColumnAt / placeStairRun create elements', () => {
    let p = emptyProject([])
    const slab = placeSlabRect(p, 's1', { x: 0, y: 0 }, { x: 4, y: 3 })
    assert.ok(slab.slabId)
    p = slab.project
    assert.equal(p.slabs[0]!.polygon.length, 4)
    const col = placeColumnAt(p, 's1', { x: 1.05, y: 1.07 })
    assert.ok(col.columnId)
    p = col.project
    assert.equal(p.columns[0]!.position.x, 1.05)
    const stair = placeStairRun(p, 's1', { x: 0, y: 0 }, { x: 3, y: 0 })
    assert.ok(stair.stairId)
    assert.ok(stair.project.stairs[0]!.rises >= 3)
    assert.equal(stair.project.stairs[0]!.mode, 'droit')
    assert.equal(stair.project.stairs[0]!.path.length, 2)
  })

  it('placeSlabPolygon stores arbitrary vertices', () => {
    const p = emptyProject([])
    const poly = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 3, y: 2 },
      { x: 1, y: 2.5 },
      { x: 0, y: 1 },
    ]
    const res = placeSlabPolygon(p, 's1', poly)
    assert.ok(res.slabId)
    assert.equal(res.project.slabs[0]!.polygon.length, 5)
  })

  it('placeStairPath quart creates L stair', () => {
    const p = emptyProject([])
    const res = placeStairPath(
      p,
      's1',
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 2.5 },
      ],
      'quart',
    )
    assert.ok(res.stairId)
    assert.equal(res.project.stairs[0]!.mode, 'quart')
    assert.equal(res.project.stairs[0]!.path.length, 3)
  })
})
