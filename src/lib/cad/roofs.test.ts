import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildRoofGeometry, normalizeRoof, pitchedRidgeHeight, roofPlanLines } from './roofs'
import type { Roof } from '../bim/types'

function baseRoof(partial: Partial<Roof> = {}): Roof {
  return {
    id: 'r1',
    storyId: 's1',
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ],
    ridgeHeight: 0.35,
    overhang: 0.3,
    ...partial,
  }
}

describe('pitched roofs', () => {
  it('legacy roofs normalize to terrasse', () => {
    const n = normalizeRoof(baseRoof())
    assert.equal(n.mode, 'terrasse')
    assert.equal(n.pitchDeg, 30)
  })

  it('2pentes has ridge line and two faces', () => {
    const g = buildRoofGeometry(baseRoof({ mode: '2pentes', pitchDeg: 30 }))
    assert.equal(g.mode, '2pentes')
    assert.equal(g.faces.length, 2)
    assert.equal(g.planLines.length, 1)
    assert.ok(g.ridgeHeight > 1)
  })

  it('croupe has ridge + hips', () => {
    const g = buildRoofGeometry(baseRoof({ mode: 'croupe', pitchDeg: 30 }))
    assert.equal(g.mode, 'croupe')
    assert.ok(g.faces.length >= 4)
    assert.ok(g.planLines.length >= 3)
  })

  it('terrasse has no plan ridge lines', () => {
    const lines = roofPlanLines(baseRoof({ mode: 'terrasse' }))
    assert.equal(lines.length, 0)
  })

  it('pitch drives ridge height', () => {
    const low = pitchedRidgeHeight(baseRoof({ mode: '2pentes', pitchDeg: 15 }))
    const high = pitchedRidgeHeight(baseRoof({ mode: '2pentes', pitchDeg: 45 }))
    assert.ok(high > low)
  })
})
