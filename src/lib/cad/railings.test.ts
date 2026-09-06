import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildStairRailingRuns, buildPathRailingRun, stairHasRailings } from './railings'
import { normalizeStair } from './stairs'
import type { Railing } from '../bim/types'

describe('railings', () => {
  it('auto railings on both sides of droit stair', () => {
    const stair = normalizeStair({
      id: 'st',
      storyId: 's1',
      a: { x: 0, y: 0 },
      b: { x: 4, y: 0 },
      path: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      width: 1,
      rises: 14,
      mode: 'droit',
      railings: true,
      railingHeight: 1.0,
    })
    const runs = buildStairRailingRuns(stair, 2.8)
    assert.equal(runs.length, 2)
    assert.ok(runs[0]!.samples.length >= 2)
    assert.equal(runs[0]!.height, 1)
  })

  it('respects railings off', () => {
    const stair = normalizeStair({
      id: 'st',
      storyId: 's1',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      path: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      width: 1,
      rises: 12,
      mode: 'droit',
      railings: false,
    })
    assert.equal(stairHasRailings(stair), false)
    assert.equal(buildStairRailingRuns(stair, 2.8).length, 0)
  })

  it('quart stair has flight + landing runs', () => {
    const stair = normalizeStair({
      id: 'st',
      storyId: 's1',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 3 },
      path: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
      ],
      width: 1,
      rises: 16,
      mode: 'quart',
      railings: true,
    })
    const runs = buildStairRailingRuns(stair, 2.8)
    assert.ok(runs.length >= 5)
  })

  it('manual railing path', () => {
    const r: Railing = {
      id: 'rail',
      storyId: 's1',
      path: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
      height: 1.1,
    }
    const run = buildPathRailingRun(r)
    assert.ok(run)
    assert.equal(run!.height, 1.1)
    assert.ok(run!.samples.length >= 3)
  })
})
