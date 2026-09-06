import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStairGeometry,
  normalizeStair,
  pointsNeededForMode,
  stairPlanOutlines,
  defaultRisesForHeight,
} from './stairs'
import type { Stair } from '../bim/types'

function baseStair(partial: Partial<Stair> & Pick<Stair, 'path' | 'mode'>): Stair {
  return normalizeStair({
    id: 'st1',
    storyId: 's1',
    width: 1,
    rises: 16,
    a: partial.path[0]!,
    b: partial.path[partial.path.length - 1]!,
    ...partial,
  })
}

describe('stairs multi-flight', () => {
  it('pointsNeededForMode', () => {
    assert.equal(pointsNeededForMode('droit'), 2)
    assert.equal(pointsNeededForMode('quart'), 3)
    assert.equal(pointsNeededForMode('demi'), 4)
  })

  it('normalizeStair recovers path from a/b', () => {
    const s = normalizeStair({
      id: 'x',
      storyId: 's',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      width: 1,
      rises: 10,
      mode: 'droit',
      path: [],
    } as Stair)
    assert.equal(s.path.length, 2)
    assert.equal(s.path[0]!.x, 0)
    assert.equal(s.path[1]!.x, 3)
  })

  it('droit has one flight and no landing', () => {
    const s = baseStair({
      mode: 'droit',
      path: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      rises: 14,
    })
    const g = buildStairGeometry(s, 2.8)
    assert.equal(g.flights.length, 1)
    assert.equal(g.landings.length, 0)
    assert.equal(g.flights[0]!.rises, 14)
  })

  it('quart has two flights and one landing', () => {
    const s = baseStair({
      mode: 'quart',
      path: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
      ],
      rises: 16,
    })
    const g = buildStairGeometry(s, 2.8)
    assert.equal(g.flights.length, 2)
    assert.equal(g.landings.length, 1)
    assert.equal(g.flights[0]!.rises + g.flights[1]!.rises, 16)
    assert.ok(g.landings[0]!.polygon.length >= 3)
  })

  it('demi has three flights and two landings', () => {
    const s = baseStair({
      mode: 'demi',
      path: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 1.2 },
        { x: 0, y: 1.2 },
      ],
      rises: 18,
    })
    const g = buildStairGeometry(s, 3.0)
    assert.equal(g.flights.length, 3)
    assert.equal(g.landings.length, 2)
    const sum = g.flights.reduce((a, f) => a + f.rises, 0)
    assert.equal(sum, 18)
  })

  it('plan outlines cover flights', () => {
    const s = baseStair({
      mode: 'quart',
      path: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
      rises: 12,
    })
    const o = stairPlanOutlines(s)
    assert.equal(o.flights.length, 2)
    assert.equal(o.landings.length, 1)
    assert.equal(o.flights[0]!.length, 4)
  })

  it('defaultRisesForHeight ~ 0.175', () => {
    assert.equal(defaultRisesForHeight(2.8), 16)
  })
})
