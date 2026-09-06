import type { Furniture, Room, Vec2, Wall } from '../bim/types'

export function v2(x: number, y: number): Vec2 {
  return { x, y }
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s }
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

export function normalize(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y) || 1
  return { x: a.x / l, y: a.y / l }
}

export function perp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x }
}

/** Project point onto segment AB. Returns t in [0,1], closest point, and distance. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2; dist: number } {
  const ab = sub(b, a)
  const len2 = ab.x * ab.x + ab.y * ab.y
  if (len2 < 1e-12) {
    return { t: 0, point: { ...a }, dist: dist(p, a) }
  }
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2))
  const point = lerp(a, b, t)
  return { t, point, dist: dist(p, point) }
}

/** Infinite line intersection of A+t*(B-A) and C+s*(D-C). t/s unrestricted. */
export function lineIntersection(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): { point: Vec2; t: number; s: number } | null {
  const r = sub(b, a)
  const q = sub(d, c)
  const denom = r.x * q.y - r.y * q.x
  if (Math.abs(denom) < 1e-10) return null
  const ac = sub(c, a)
  const t = (ac.x * q.y - ac.y * q.x) / denom
  const s = (ac.x * r.y - ac.y * r.x) / denom
  return { point: lerp(a, b, t), t, s }
}

/** Segment intersection; both t and s in [0,1] (with small epsilon). */
export function segmentIntersection(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
  eps = 1e-4,
): { point: Vec2; t: number; s: number } | null {
  const hit = lineIntersection(a, b, c, d)
  if (!hit) return null
  if (hit.t < -eps || hit.t > 1 + eps || hit.s < -eps || hit.s > 1 + eps) return null
  return {
    point: hit.point,
    t: Math.max(0, Math.min(1, hit.t)),
    s: Math.max(0, Math.min(1, hit.s)),
  }
}

/** Snap position toward nearest wall centerline if within threshold (meters). */
export function snapNearWall(pos: Vec2, walls: Wall[], threshold = 0.45): Vec2 {
  let best: { dist: number; point: Vec2 } | null = null
  for (const w of walls) {
    const proj = projectOnSegment(pos, w.a, w.b)
    if (proj.dist < threshold && (!best || proj.dist < best.dist)) {
      const dir = normalize(sub(w.b, w.a))
      const n = perp(dir)
      const toP = sub(pos, proj.point)
      const side = dot(toP, n) >= 0 ? 1 : -1
      const offset = (w.thickness / 2 + 0.05) * side
      best = { dist: proj.dist, point: add(proj.point, scale(n, offset)) }
    }
  }
  return best ? best.point : pos
}

/**
 * Circle (xz) vs wall segment collision — push out if overlapping.
 * `pad` thickens the wall slightly for a more solid feel in visite.
 */
export function resolveWallCollision(
  pos: Vec2,
  radius: number,
  walls: Wall[],
  pad = 0.08,
): Vec2 {
  let p = { ...pos }
  for (const w of walls) {
    const proj = projectOnSegment(p, w.a, w.b)
    const half = w.thickness / 2 + radius + pad
    if (proj.dist < half && proj.dist > 1e-8) {
      const push = normalize(sub(p, proj.point))
      p = add(proj.point, scale(push, half))
    } else if (proj.dist <= 1e-8) {
      const dir = normalize(sub(w.b, w.a))
      const n = perp(dir)
      p = add(proj.point, scale(n, half))
    }
  }
  return p
}

/** Axis-aligned footprint of furniture (rotated rect → AABB), plus radius. */
export function furnitureAabb(
  f: Pick<Furniture, 'position' | 'width' | 'depth' | 'rotation'>,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const hw = f.width / 2
  const hd = f.depth / 2
  const c = Math.cos(f.rotation)
  const s = Math.sin(f.rotation)
  const corners = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const q of corners) {
    const x = f.position.x + q.x * c - q.y * s
    const y = f.position.y + q.x * s + q.y * c
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return { minX, maxX, minY, maxY }
}

/** Circle vs furniture AABB footprints — push out on shortest axis. */
export function resolveFurnitureCollision(
  pos: Vec2,
  radius: number,
  furniture: Pick<Furniture, 'position' | 'width' | 'depth' | 'rotation' | 'kind'>[],
): Vec2 {
  let p = { ...pos }
  for (const f of furniture) {
    // Soft props (trees) — skip
    if (f.kind === 'tree' || f.kind === 'curtain') continue
    const box = furnitureAabb(f)
    const nearestX = Math.max(box.minX, Math.min(p.x, box.maxX))
    const nearestY = Math.max(box.minY, Math.min(p.y, box.maxY))
    const dx = p.x - nearestX
    const dy = p.y - nearestY
    const d2 = dx * dx + dy * dy
    if (d2 < radius * radius) {
      if (d2 < 1e-10) {
        // Center inside: push along smallest penetration
        const left = p.x - box.minX + radius
        const right = box.maxX - p.x + radius
        const bottom = p.y - box.minY + radius
        const top = box.maxY - p.y + radius
        const m = Math.min(left, right, bottom, top)
        if (m === left) p.x = box.minX - radius
        else if (m === right) p.x = box.maxX + radius
        else if (m === bottom) p.y = box.minY - radius
        else p.y = box.maxY + radius
      } else {
        const d = Math.sqrt(d2)
        const push = (radius - d) / d
        p.x += dx * push
        p.y += dy * push
      }
    }
  }
  return p
}

export function findNearestWall(
  pos: Vec2,
  walls: Wall[],
  maxDist = 0.6,
): { wall: Wall; t: number; dist: number } | null {
  let best: { wall: Wall; t: number; dist: number } | null = null
  for (const w of walls) {
    const proj = projectOnSegment(pos, w.a, w.b)
    if (proj.dist <= maxDist && (!best || proj.dist < best.dist)) {
      best = { wall: w, t: proj.t, dist: proj.dist }
    }
  }
  return best
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y
    const yj = poly[j].y
    const xi = poly[i].x
    const xj = poly[j].x
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-15) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function polygonCentroid(poly: Vec2[]): Vec2 | null {
  if (poly.length === 0) return null
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  return { x: x / poly.length, y: y / poly.length }
}

export function wallsBounds(walls: Wall[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} | null {
  if (walls.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const w of walls) {
    minX = Math.min(minX, w.a.x, w.b.x)
    maxX = Math.max(maxX, w.a.x, w.b.x)
    minY = Math.min(minY, w.a.y, w.b.y)
    maxY = Math.max(maxY, w.a.y, w.b.y)
  }
  return { minX, maxX, minY, maxY }
}

/** Bounds center of wall endpoints. */
export function wallsBoundsCenter(walls: Wall[]): Vec2 {
  const b = wallsBounds(walls)
  if (!b) return { x: 0, y: 0 }
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

/** Clearance from point to nearest wall face (centerline dist − half thickness). */
export function wallClearance(pos: Vec2, walls: Wall[]): number {
  let best = Infinity
  for (const w of walls) {
    const proj = projectOnSegment(pos, w.a, w.b)
    best = Math.min(best, proj.dist - w.thickness / 2)
  }
  return best
}

function yawToward(from: Vec2, to: Vec2, fallback: Vec2): number {
  const dx = to.x - from.x
  const dz = to.y - from.y
  if (Math.hypot(dx, dz) > 1e-4) return Math.atan2(dx, -dz)
  const tx = fallback.x - from.x
  const tz = fallback.y - from.y
  if (Math.hypot(tx, tz) > 1e-4) return Math.atan2(tx, -tz)
  return 0
}

/**
 * Spawn for visite: prefer largest room centroid (clear of walls),
 * else open-floor samples outside cores — never sit inside wall solids.
 * Yaw faces inward (toward building / room center).
 */
export function computeVisitSpawn(
  rooms: Room[],
  walls: Wall[],
): { position: Vec2; yaw: number } {
  const center = wallsBoundsCenter(walls)
  const clearanceNeed = 0.35
  const candidates: Vec2[] = []

  const withPoly = rooms.filter((r) => r.polygon && r.polygon.length >= 3)
  if (withPoly.length > 0) {
    let best = withPoly[0]
    let bestArea = 0
    for (const r of withPoly) {
      let a = 0
      for (let i = 0; i < r.polygon.length; i++) {
        const p = r.polygon[i]
        const q = r.polygon[(i + 1) % r.polygon.length]
        a += p.x * q.y - q.x * p.y
      }
      a = Math.abs(a) * 0.5
      if (a > bestArea) {
        bestArea = a
        best = r
      }
    }
    const c = polygonCentroid(best.polygon)
    if (c) {
      candidates.push(c)
      for (let i = 0; i < best.polygon.length; i++) {
        const p = best.polygon[i]
        const q = best.polygon[(i + 1) % best.polygon.length]
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
        candidates.push({
          x: c.x * 0.55 + mid.x * 0.45,
          y: c.y * 0.55 + mid.y * 0.45,
        })
      }
    }
  }

  // Open-floor samples from envelope (massing often has empty rooms[])
  const envelopeWalls = walls.filter(
    (w) => w.typology === 'exterior' || w.typology === 'curtain',
  )
  const envelope = envelopeWalls.length > 0 ? envelopeWalls : walls
  const b = wallsBounds(envelope)
  if (b) {
    const xs = [0.22, 0.35, 0.5, 0.65, 0.78]
    const ys = [0.22, 0.35, 0.5, 0.65, 0.78]
    for (const u of xs) {
      for (const v of ys) {
        candidates.push({
          x: b.minX + (b.maxX - b.minX) * u,
          y: b.minY + (b.maxY - b.minY) * v,
        })
      }
    }
  } else {
    candidates.push({ ...center })
  }

  let position = { ...center }
  let bestScore = -Infinity
  for (const raw of candidates) {
    const p = resolveWallCollision(raw, 0.28, walls, 0.08)
    const clear = wallClearance(p, walls)
    if (clear < clearanceNeed * 0.5) continue
    const offCenter = Math.hypot(p.x - center.x, p.y - center.y)
    const score = clear * 4 + Math.min(offCenter, 6) * 0.35
    if (score > bestScore) {
      bestScore = score
      position = p
    }
  }

  let face = { ...center }
  const near = findNearestWall(position, walls, 50)
  if (near) {
    const proj = projectOnSegment(position, near.wall.a, near.wall.b)
    const inward = normalize(sub(position, proj.point))
    face = add(position, inward)
    const toCenter = sub(center, position)
    if (
      toCenter.x * inward.x + toCenter.y * inward.y > 0 &&
      Math.hypot(toCenter.x, toCenter.y) > 0.4
    ) {
      face = center
    }
  }

  return { position, yaw: yawToward(position, face, center) }
}
