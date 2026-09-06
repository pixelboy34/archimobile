import type { Stair, StairMode, Vec2 } from '../bim/types'

export const STAIR_TREAD = 0.28
export const STAIR_RISER = 0.175

export type NormalizedStair = Stair & {
  path: Vec2[]
  mode: StairMode
  a: Vec2
  b: Vec2
}

export function normalizeStair(stair: Stair): NormalizedStair {
  const mode: StairMode = stair.mode ?? 'droit'
  const path: Vec2[] =
    stair.path && stair.path.length >= 2
      ? stair.path.map((p) => ({ ...p }))
      : [
          { ...(stair.a ?? { x: 0, y: 0 }) },
          { ...(stair.b ?? { x: 1, y: 0 }) },
        ]
  const a = { ...path[0]! }
  const b = { ...path[path.length - 1]! }
  return {
    ...stair,
    mode,
    path,
    a,
    b,
    width: stair.width > 0 ? stair.width : 1,
    rises: Math.max(2, Math.round(stair.rises || 3)),
  }
}

export function pointsNeededForMode(mode: StairMode): number {
  if (mode === 'droit') return 2
  if (mode === 'quart') return 3
  return 4 // demi
}

export function labelForStairMode(mode: StairMode): string {
  if (mode === 'droit') return 'Droit'
  if (mode === 'quart') return 'Quart-tournant'
  return 'Demi-tournant'
}

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

export type StairFlightGeom = {
  a: Vec2
  b: Vec2
  rises: number
  /** Elevation of first tread bottom relative to story floor */
  startElev: number
  /** Elevation of last tread top relative to story floor */
  endElev: number
}

export type StairLandingGeom = {
  polygon: Vec2[]
  /** Top surface elevation relative to story floor */
  elevation: number
  thickness: number
}

export type StairGeom = {
  flights: StairFlightGeom[]
  landings: StairLandingGeom[]
  totalRise: number
}

function distributeRises(total: number, nFlights: number): number[] {
  const n = Math.max(1, nFlights)
  const base = Math.floor(total / n)
  const rem = total - base * n
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    out.push(Math.max(1, base + (i < rem ? 1 : 0)))
  }
  // Ensure sum equals total when total >= n
  let sum = out.reduce((a, b) => a + b, 0)
  if (sum < total) out[out.length - 1]! += total - sum
  return out
}

/** Square landing at corner `c`, oriented from incoming→outgoing dirs. */
function landingPolygon(prev: Vec2, corner: Vec2, next: Vec2, width: number): Vec2[] {
  const uIn = norm(sub(corner, prev))
  const uOut = norm(sub(next, corner))
  const half = width / 2
  // Build a width×width square centered on corner, axes from average turn
  const along = norm(add(uIn, uOut))
  const side = len(along) > 0.2 ? perp(along) : perp(uIn)
  const axis = len(along) > 0.2 ? along : uIn
  const c = corner
  const ax = scale(axis, half)
  const ay = scale(side, half)
  return [
    add(add(c, scale(ax, -1)), scale(ay, -1)),
    add(add(c, ax), scale(ay, -1)),
    add(add(c, ax), ay),
    add(add(c, scale(ax, -1)), ay),
  ]
}

/**
 * Build flight + landing geometry from stair path.
 * Intermediate vertices get flat landings; rises split across flights.
 */
export function buildStairGeometry(stair: Stair, storyHeight: number): StairGeom {
  const s = normalizeStair(stair)
  const path: Vec2[] = s.path
  const width = s.width
  const totalRise = Math.max(0.3, s.rise ?? storyHeight)
  const totalRises = Math.max(path.length > 1 ? path.length - 1 : 2, s.rises)
  const nSeg = path.length - 1
  if (nSeg < 1) return { flights: [], landings: [], totalRise }

  const riseCounts = distributeRises(totalRises, nSeg)
  const riseH = totalRise / totalRises
  const trim = Math.min(width * 0.55, 0.65)

  const flights: StairFlightGeom[] = []
  const landings: StairLandingGeom[] = []
  let elev = 0

  for (let i = 0; i < nSeg; i++) {
    const p0 = path[i]!
    const p1 = path[i + 1]!
    const dir = norm(sub(p1, p0))
    const segLen = len(sub(p1, p0))
    let a = { ...p0 }
    let b = { ...p1 }
    if (i > 0 && segLen > trim * 2) a = add(p0, scale(dir, trim))
    if (i < nSeg - 1 && segLen > trim * 2) b = sub(p1, scale(dir, trim))

    const fr = riseCounts[i]!
    const startElev = elev
    const endElev = elev + fr * riseH
    flights.push({ a, b, rises: fr, startElev, endElev })

    if (i < nSeg - 1) {
      const next = path[i + 2]!
      landings.push({
        polygon: landingPolygon(p0, p1, next, width),
        elevation: endElev,
        thickness: Math.max(0.08, Math.min(0.2, riseH)),
      })
    }
    elev = endElev
  }

  return { flights, landings, totalRise }
}

/** Outline polygons for plan view (flights as quads + landings). */
export function stairPlanOutlines(stair: Stair): { flights: Vec2[][]; landings: Vec2[][] } {
  // Use unit story height for plan (2D); elevations unused
  const geom = buildStairGeometry(stair, stair.rise ?? 2.8)
  const w = normalizeStair(stair).width
  const flights = geom.flights.map((f) => {
    const dir = norm(sub(f.b, f.a))
    const side = scale(perp(dir), w / 2)
    return [
      add(f.a, scale(side, -1)),
      add(f.a, side),
      add(f.b, side),
      add(f.b, scale(side, -1)),
    ]
  })
  return { flights, landings: geom.landings.map((l) => l.polygon) }
}

/** Rough hit-test: distance to path polyline or landing. */
export function stairHitDist(stair: Stair, p: Vec2): number {
  const s = normalizeStair(stair)
  const pts = s.path
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby
    let t = len2 > 1e-12 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const qx = a.x + t * abx
    const qy = a.y + t * aby
    best = Math.min(best, Math.hypot(p.x - qx, p.y - qy))
  }
  return best
}

export function defaultRisesForHeight(height: number): number {
  return Math.max(3, Math.round(height / STAIR_RISER))
}
