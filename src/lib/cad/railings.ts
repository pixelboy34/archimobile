import type { Stair, Vec2, Railing } from '../bim/types'
import { buildStairGeometry, normalizeStair } from './stairs'

export const RAILING_DEFAULT_HEIGHT = 1.0
export const RAILING_POST_SPACING = 1.05
export const RAILING_POST_SIZE = 0.05
export const RAILING_RAIL_SIZE = 0.04

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}
function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}
function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s }
}
function len(v: Vec2): number {
  return Math.hypot(v.x, v.y)
}
function norm(v: Vec2): Vec2 {
  const L = len(v)
  if (L < 1e-9) return { x: 1, y: 0 }
  return { x: v.x / L, y: v.y / L }
}
function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x }
}

/** 3D sample along a railing run (plan + elevation of walking surface). */
export type RailingSample = {
  x: number
  y: number
  /** Walking-surface elevation relative to story floor */
  elev: number
}

export type RailingRun = {
  samples: RailingSample[]
  height: number
}

export function stairHasRailings(stair: Stair): boolean {
  return stair.railings !== false
}

export function stairRailingHeight(stair: Stair): number {
  return stair.railingHeight && stair.railingHeight > 0.3 ? stair.railingHeight : RAILING_DEFAULT_HEIGHT
}

function sampleSegment(a: Vec2, b: Vec2, elevA: number, elevB: number, spacing: number): RailingSample[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  if (L < 1e-6) return [{ x: a.x, y: a.y, elev: elevA }]
  const n = Math.max(1, Math.ceil(L / spacing))
  const out: RailingSample[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    out.push({
      x: a.x + dx * t,
      y: a.y + dy * t,
      elev: elevA + (elevB - elevA) * t,
    })
  }
  return out
}

function mergeSamples(parts: RailingSample[][]): RailingSample[] {
  const out: RailingSample[] = []
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      const s = part[i]!
      if (out.length > 0) {
        const prev = out[out.length - 1]!
        if (Math.hypot(prev.x - s.x, prev.y - s.y) < 1e-4) {
          out[out.length - 1] = s
          continue
        }
      }
      out.push(s)
    }
  }
  return out
}

/** Auto railing runs on both sides of flights + landing perimeters. */
export function buildStairRailingRuns(stair: Stair, storyHeight: number): RailingRun[] {
  if (!stairHasRailings(stair)) return []
  const s = normalizeStair(stair)
  const geom = buildStairGeometry(s, storyHeight)
  const height = stairRailingHeight(stair)
  const half = s.width / 2 + 0.02
  const runs: RailingRun[] = []

  for (const f of geom.flights) {
    const dir = norm(sub(f.b, f.a))
    const side = scale(perp(dir), half)
    for (const sign of [-1, 1] as const) {
      const off = scale(side, sign)
      const a = add(f.a, off)
      const b = add(f.b, off)
      const samples = sampleSegment(a, b, f.startElev, f.endElev, RAILING_POST_SPACING)
      if (samples.length >= 2) runs.push({ samples, height })
    }
  }

  for (const land of geom.landings) {
    const poly = land.polygon
    if (poly.length < 3) continue
    const parts: RailingSample[][] = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!
      const b = poly[(i + 1) % poly.length]!
      parts.push(sampleSegment(a, b, land.elevation, land.elevation, RAILING_POST_SPACING))
    }
    const samples = mergeSamples(parts)
    if (samples.length >= 2) runs.push({ samples, height })
  }

  return runs
}

/** Flat-level railing from a plan polyline (manual garde-corps). */
export function buildPathRailingRun(railing: Railing): RailingRun | null {
  const path = railing.path
  if (!path || path.length < 2) return null
  const height = railing.height > 0.3 ? railing.height : RAILING_DEFAULT_HEIGHT
  const parts: RailingSample[][] = []
  for (let i = 0; i < path.length - 1; i++) {
    parts.push(sampleSegment(path[i]!, path[i + 1]!, 0, 0, RAILING_POST_SPACING))
  }
  const samples = mergeSamples(parts)
  if (samples.length < 2) return null
  return { samples, height }
}

/** Plan polylines for 2D display (thin lines). */
export function stairRailingPlanPaths(stair: Stair): Vec2[][] {
  const runs = buildStairRailingRuns(stair, stair.rise ?? 2.8)
  return runs.map((r) => r.samples.map((s) => ({ x: s.x, y: s.y })))
}

export function railingHitDist(railing: Railing, p: Vec2): number {
  const pts = railing.path
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby
    let t = len2 > 1e-12 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby)))
  }
  return best
}
