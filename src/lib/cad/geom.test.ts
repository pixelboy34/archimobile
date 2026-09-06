import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  segmentIntersection,
  lineIntersection,
  projectOnSegment,
  furnitureAabb,
  resolveFurnitureCollision,
  resolveWallCollision,
  computeVisitSpawn,
  polygonCentroid,
  pointInPolygon,
} from './geom'
import { makeTJoint, splitWallAt, trimWall, extendWallDetailed, healWallTJoints } from './ops'
import { wallSolidBoxes, openingsLocal } from '../bim/wall-openings'
import { generateMassing } from './massing'
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
    updatedAt: 1,
    createdAt: 1,
  }
}

describe('geom intersection', () => {
  it('segmentIntersection finds mid T point', () => {
    const hit = segmentIntersection(
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      { x: -2, y: 2 },
      { x: 2, y: 2 },
    )
    assert.ok(hit)
    assert.equal(hit!.point.x, 0)
    assert.equal(hit!.point.y, 2)
    assert.ok(Math.abs(hit!.t - 0.5) < 1e-9)
    assert.ok(Math.abs(hit!.s - 0.5) < 1e-9)
  })

  it('lineIntersection allows extension beyond segment', () => {
    const hit = lineIntersection(
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 3 },
      { x: 1, y: 3 },
    )
    assert.ok(hit)
    assert.equal(hit!.point.y, 3)
    assert.ok(hit!.t > 1)
  })

  it('projectOnSegment clamps t', () => {
    const p = projectOnSegment({ x: 5, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 })
    assert.equal(p.t, 1)
    assert.equal(p.point.x, 2)
  })
})

describe('collision helpers', () => {
  it('resolveWallCollision pushes out of thick wall', () => {
    const walls: Wall[] = [
      {
        id: 'w1',
        storyId: 's1',
        a: { x: -2, y: 0 },
        b: { x: 2, y: 0 },
        thickness: 0.2,
        height: 2.8,
        typology: 'interior',
      },
    ]
    const out = resolveWallCollision({ x: 0, y: 0.05 }, 0.28, walls, 0.1)
    assert.ok(Math.abs(out.y) >= 0.28 + 0.1 + 0.1 - 0.01)
  })

  it('furniture AABB + collision', () => {
    const f = {
      position: { x: 0, y: 0 },
      width: 2,
      depth: 1,
      rotation: 0,
      kind: 'sofa' as const,
    }
    const box = furnitureAabb(f)
    assert.equal(box.minX, -1)
    assert.equal(box.maxX, 1)
    const pushed = resolveFurnitureCollision({ x: 0, y: 0 }, 0.3, [f])
    assert.ok(Math.hypot(pushed.x, pushed.y) >= 0.29)
  })
})

describe('visit spawn', () => {
  it('spawns inside room with clearance from walls', () => {
    const rooms: Room[] = [
      {
        id: 'r1',
        storyId: 's1',
        name: 'Salon',
        polygon: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
          { x: 0, y: 4 },
        ],
      },
    ]
    const walls: Wall[] = [
      { id: 'w1', storyId: 's1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness: 0.2, height: 2.8, typology: 'exterior' },
      { id: 'w2', storyId: 's1', a: { x: 4, y: 0 }, b: { x: 4, y: 4 }, thickness: 0.2, height: 2.8, typology: 'exterior' },
      { id: 'w3', storyId: 's1', a: { x: 4, y: 4 }, b: { x: 0, y: 4 }, thickness: 0.2, height: 2.8, typology: 'exterior' },
      { id: 'w4', storyId: 's1', a: { x: 0, y: 4 }, b: { x: 0, y: 0 }, thickness: 0.2, height: 2.8, typology: 'exterior' },
    ]
    const c = polygonCentroid(rooms[0].polygon)!
    assert.ok(pointInPolygon(c, rooms[0].polygon))
    const spawn = computeVisitSpawn(rooms, walls)
    assert.ok(pointInPolygon(spawn.position, rooms[0].polygon))
    // Prefer open floor near center (not stuck in a wall)
    assert.ok(Math.hypot(spawn.position.x - 2, spawn.position.y - 2) < 1.6)
    assert.ok(Number.isFinite(spawn.yaw))
  })

  it('avoids core center when rooms empty (massing)', () => {
    const walls: Wall[] = [
      { id: 'e1', storyId: 's1', a: { x: -6, y: -9 }, b: { x: 6, y: -9 }, thickness: 0.25, height: 3, typology: 'exterior' },
      { id: 'e2', storyId: 's1', a: { x: 6, y: -9 }, b: { x: 6, y: 9 }, thickness: 0.25, height: 3, typology: 'exterior' },
      { id: 'e3', storyId: 's1', a: { x: 6, y: 9 }, b: { x: -6, y: 9 }, thickness: 0.25, height: 3, typology: 'exterior' },
      { id: 'e4', storyId: 's1', a: { x: -6, y: 9 }, b: { x: -6, y: -9 }, thickness: 0.25, height: 3, typology: 'exterior' },
      { id: 'c1', storyId: 's1', a: { x: -1.5, y: -2.7 }, b: { x: 1.5, y: -2.7 }, thickness: 0.2, height: 3, typology: 'core' },
      { id: 'c2', storyId: 's1', a: { x: 1.5, y: -2.7 }, b: { x: 1.5, y: 2.7 }, thickness: 0.2, height: 3, typology: 'core' },
      { id: 'c3', storyId: 's1', a: { x: 1.5, y: 2.7 }, b: { x: -1.5, y: 2.7 }, thickness: 0.2, height: 3, typology: 'core' },
      { id: 'c4', storyId: 's1', a: { x: -1.5, y: 2.7 }, b: { x: -1.5, y: -2.7 }, thickness: 0.2, height: 3, typology: 'core' },
    ]
    const spawn = computeVisitSpawn([], walls)
    // Should not sit at exact building center (core hollow) — prefer open plateau
    assert.ok(Math.hypot(spawn.position.x, spawn.position.y) > 0.5)
  })
})

describe('T-joint ops', () => {
  it('splitWallAt remaps openings by t', () => {
    const wall: Wall = {
      id: 'wa',
      storyId: 's1',
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      thickness: 0.2,
      height: 2.8,
      typology: 'interior',
    }
    const openings: Opening[] = [
      { id: 'o1', wallId: 'wa', kind: 'window', t: 0.2, width: 1, height: 1.2, sill: 0.9 },
      { id: 'o2', wallId: 'wa', kind: 'door', t: 0.8, width: 0.9, height: 2.1, sill: 0 },
    ]
    const p = emptyProject([wall], openings)
    const res = splitWallAt(p, 'wa', 0.5)
    assert.ok(res.wallIds)
    const [a, b] = res.wallIds!
    const oA = res.project.openings.find((o) => o.wallId === a)
    const oB = res.project.openings.find((o) => o.wallId === b)
    assert.ok(oA)
    assert.ok(oB)
    assert.ok(Math.abs(oA!.t - 0.4) < 1e-6)
    assert.ok(Math.abs(oB!.t - 0.6) < 1e-6)
    assert.equal(res.project.walls.length, 2)
  })

  it('makeTJoint splits target and pins A endpoint', () => {
    const wallA: Wall = {
      id: 'wa',
      storyId: 's1',
      a: { x: 0, y: 0 },
      b: { x: 0, y: 3 },
      thickness: 0.2,
      height: 2.8,
      typology: 'interior',
    }
    const wallB: Wall = {
      id: 'wb',
      storyId: 's1',
      a: { x: -2, y: 2 },
      b: { x: 2, y: 2 },
      thickness: 0.2,
      height: 2.8,
      typology: 'interior',
    }
    const p = emptyProject([wallA, wallB])
    const res = makeTJoint(p, 'wa', 'wb', 'b')
    assert.ok(res.project.walls.find((w) => w.id === 'wa'))
    const a = res.project.walls.find((w) => w.id === 'wa')!
    assert.ok(Math.abs(a.b.x) < 1e-9)
    assert.ok(Math.abs(a.b.y - 2) < 1e-9)
    // B split into 2 — original wb gone
    assert.equal(res.project.walls.filter((w) => w.id === 'wb').length, 0)
    assert.equal(res.project.walls.length, 3)
    // All meet at junction
    const tips = res.project.walls.flatMap((w) => [w.a, w.b])
    const atJ = tips.filter((t) => Math.hypot(t.x - 0, t.y - 2) < 1e-6)
    assert.ok(atJ.length >= 3)
  })

  it('trimWall splits both walls on T', () => {
    const wallA: Wall = {
      id: 'wa',
      storyId: 's1',
      a: { x: 0, y: 0 },
      b: { x: 0, y: 4 },
      thickness: 0.2,
      height: 2.8,
      typology: 'interior',
    }
    const wallB: Wall = {
      id: 'wb',
      storyId: 's1',
      a: { x: -3, y: 2 },
      b: { x: 3, y: 2 },
      thickness: 0.2,
      height: 2.8,
      typology: 'interior',
    }
    const p = emptyProject([wallA, wallB])
    const res = trimWall(p, 'wa', { x: 0, y: 2 })
    // A split (2) + B split (2) = 4, original both replaced
    assert.equal(res.project.walls.length, 4)
    assert.ok(res.note?.toLowerCase().includes('t') || res.note?.includes('cible'))
  })

  it('extendWallDetailed creates T on target', () => {
    const wallA: Wall = {
      id: 'wa',
      storyId: 's1',
      a: { x: 0, y: 0 },
      b: { x: 0, y: 1 },
      thickness: 0.2,
      height: 2.8,
      typology: 'interior',
    }
    const wallB: Wall = {
      id: 'wb',
      storyId: 's1',
      a: { x: -2, y: 3 },
      b: { x: 2, y: 3 },
      thickness: 0.2,
      height: 2.8,
      typology: 'interior',
    }
    const p = emptyProject([wallA, wallB])
    const res = extendWallDetailed(p, 'wa', 'wb')
    const a = res.project.walls.find((w) => w.id === 'wa')!
    assert.ok(Math.abs(a.b.y - 3) < 1e-6)
    assert.equal(res.project.walls.length, 3)
  })

  it('healWallTJoints splits host when tip lands mid-span', () => {
    const host: Wall = {
      id: 'host',
      storyId: 's1',
      a: { x: 0, y: 0 },
      b: { x: 6, y: 0 },
      thickness: 0.2,
      height: 2.8,
      typology: 'exterior',
    }
    const stub: Wall = {
      id: 'stub',
      storyId: 's1',
      a: { x: 3, y: 0 },
      b: { x: 3, y: 2 },
      thickness: 0.2,
      height: 2.8,
      typology: 'interior',
    }
    const p = emptyProject([host, stub])
    const res = healWallTJoints(p, 'stub')
    assert.equal(res.project.walls.length, 3)
    assert.ok(res.note)
  })
})


describe('wall openings solids', () => {
  const wall: Wall = {
    id: 'w1',
    storyId: 's1',
    a: { x: 0, y: 0 },
    b: { x: 10, y: 0 },
    thickness: 0.25,
    height: 2.8,
    typology: 'exterior',
  }

  it('returns one full box when no openings', () => {
    const boxes = wallSolidBoxes(wall, [])
    assert.equal(boxes.length, 1)
    assert.ok(Math.abs(boxes[0]!.w - 10) < 1e-6)
    assert.ok(Math.abs(boxes[0]!.h - 2.8) < 1e-6)
  })

  it('cuts a door void to the sill and keeps lintel', () => {
    const openings: Opening[] = [
      { id: 'o1', wallId: 'w1', kind: 'door', t: 0.5, width: 1.0, height: 2.1, sill: 0 },
    ]
    const boxes = wallSolidBoxes(wall, openings)
    // left + right full-height + lintel over door
    assert.ok(boxes.length >= 3)
    const lintels = boxes.filter((b) => b.h < 1 && b.y > 2)
    assert.ok(lintels.length >= 1)
    const locals = openingsLocal(wall, openings)
    assert.equal(locals.length, 1)
    assert.equal(locals[0]!.kind, 'door')
  })

  it('keeps sill under a window', () => {
    const openings: Opening[] = [
      { id: 'o2', wallId: 'w1', kind: 'window', t: 0.3, width: 1.5, height: 1.4, sill: 0.9 },
    ]
    const boxes = wallSolidBoxes(wall, openings)
    const sills = boxes.filter((b) => b.y < 0.9 && b.h <= 0.95)
    assert.ok(sills.length >= 1)
  })
})

describe('massing openings', () => {
  it('seeds facade openings on envelope', () => {
    const m = generateMassing({ width: 12, depth: 18, floors: 3, floorHeight: 3 })
    assert.ok(m.openings.length > 0)
    assert.ok(m.openings.some((o) => o.kind === 'door'))
    assert.ok(m.openings.some((o) => o.kind === 'window'))
    const wallIds = new Set(m.walls.map((w) => w.id))
    for (const o of m.openings) assert.ok(wallIds.has(o.wallId))
  })
})
