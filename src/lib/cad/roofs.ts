import type { Roof, RoofMode, Vec2 } from '../bim/types'

export const ROOF_DEFAULT_PITCH = 30

export type NormalizedRoof = Roof & {
  mode: RoofMode
  pitchDeg: number
}

export function normalizeRoof(roof: Roof): NormalizedRoof {
  return {
    ...roof,
    mode: roof.mode ?? 'terrasse',
    pitchDeg: roof.pitchDeg && roof.pitchDeg > 1 ? roof.pitchDeg : ROOF_DEFAULT_PITCH,
    ridgeHeight: roof.ridgeHeight > 0 ? roof.ridgeHeight : 0.3,
    overhang: roof.overhang ?? 0.3,
  }
}

export function labelForRoofMode(mode: RoofMode): string {
  if (mode === 'terrasse') return 'Terrasse'
  if (mode === '2pentes') return '2 pentes'
  return 'Croupe'
}

export type RoofBBox = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  cx: number
  cy: number
  w: number
  d: number
}

export function roofBBox(poly: Vec2[]): RoofBBox {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: Math.max(0.01, maxX - minX),
    d: Math.max(0.01, maxY - minY),
  }
}

/** Ridge height from pitch for pitched roofs (half short span). */
export function pitchedRidgeHeight(roof: Roof): number {
  const r = normalizeRoof(roof)
  if (r.mode === 'terrasse') return Math.max(0.15, r.ridgeHeight)
  const b = roofBBox(r.polygon)
  const halfSpan = Math.min(b.w, b.d) / 2
  const rad = (r.pitchDeg * Math.PI) / 180
  const fromPitch = halfSpan * Math.tan(rad)
  // Prefer pitch-driven height; ridgeHeight acts as minimum / legacy floor
  return Math.max(0.25, fromPitch)
}

export type RoofFace3 = {
  /** Triangle or quad vertices in plan+height: x,z plan → y up */
  verts: { x: number; y: number; z: number }[]
}

export type RoofGeom = {
  mode: RoofMode
  faces: RoofFace3[]
  /** Plan lines for ridge / hips */
  planLines: { a: Vec2; b: Vec2 }[]
  ridgeHeight: number
}

function quad(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
): RoofFace3 {
  return { verts: [a, b, c, d] }
}

function tri(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): RoofFace3 {
  return { verts: [a, b, c] }
}

/** Build pitched / flat roof geometry from footprint bbox. */
export function buildRoofGeometry(roof: Roof): RoofGeom {
  const r = normalizeRoof(roof)
  const b = roofBBox(r.polygon)
  const h = pitchedRidgeHeight(r)

  if (r.mode === 'terrasse') {
    // Flat prism represented as top face only (extrude handled elsewhere)
    return {
      mode: 'terrasse',
      faces: [],
      planLines: [],
      ridgeHeight: h,
    }
  }

  const { minX, maxX, minY, maxY, cx, cy, w, d } = b
  const alongX = w >= d

  if (r.mode === '2pentes') {
    if (alongX) {
      // Ridge parallel to X through cy
      const ridgeY = cy
      const faces = [
        quad(
          { x: minX, y: 0, z: minY },
          { x: maxX, y: 0, z: minY },
          { x: maxX, y: h, z: ridgeY },
          { x: minX, y: h, z: ridgeY },
        ),
        quad(
          { x: maxX, y: 0, z: maxY },
          { x: minX, y: 0, z: maxY },
          { x: minX, y: h, z: ridgeY },
          { x: maxX, y: h, z: ridgeY },
        ),
      ]
      return {
        mode: '2pentes',
        faces,
        planLines: [{ a: { x: minX, y: ridgeY }, b: { x: maxX, y: ridgeY } }],
        ridgeHeight: h,
      }
    }
    // Ridge parallel to Y through cx
    const ridgeX = cx
    const faces = [
      quad(
        { x: minX, y: 0, z: minY },
        { x: minX, y: 0, z: maxY },
        { x: ridgeX, y: h, z: maxY },
        { x: ridgeX, y: h, z: minY },
      ),
      quad(
        { x: maxX, y: 0, z: maxY },
        { x: maxX, y: 0, z: minY },
        { x: ridgeX, y: h, z: minY },
        { x: ridgeX, y: h, z: maxY },
      ),
    ]
    return {
      mode: '2pentes',
      faces,
      planLines: [{ a: { x: ridgeX, y: minY }, b: { x: ridgeX, y: maxY } }],
      ridgeHeight: h,
    }
  }

  // Croupe (hip)
  if (alongX) {
    const inset = d / 2
    const rx0 = minX + inset
    const rx1 = maxX - inset
    // Degenerate almost-square → pyramid
    if (rx1 - rx0 < 0.05) {
      const apex = { x: cx, y: h, z: cy }
      const faces = [
        tri({ x: minX, y: 0, z: minY }, { x: maxX, y: 0, z: minY }, apex),
        tri({ x: maxX, y: 0, z: minY }, { x: maxX, y: 0, z: maxY }, apex),
        tri({ x: maxX, y: 0, z: maxY }, { x: minX, y: 0, z: maxY }, apex),
        tri({ x: minX, y: 0, z: maxY }, { x: minX, y: 0, z: minY }, apex),
      ]
      return {
        mode: 'croupe',
        faces,
        planLines: [
          { a: { x: cx, y: cy }, b: { x: minX, y: minY } },
          { a: { x: cx, y: cy }, b: { x: maxX, y: minY } },
          { a: { x: cx, y: cy }, b: { x: maxX, y: maxY } },
          { a: { x: cx, y: cy }, b: { x: minX, y: maxY } },
        ],
        ridgeHeight: h,
      }
    }
    const r0 = { x: rx0, y: h, z: cy }
    const r1 = { x: rx1, y: h, z: cy }
    const faces = [
      // long south
      quad({ x: minX, y: 0, z: minY }, { x: maxX, y: 0, z: minY }, r1, r0),
      // long north
      quad({ x: maxX, y: 0, z: maxY }, { x: minX, y: 0, z: maxY }, r0, r1),
      // west hip
      tri({ x: minX, y: 0, z: minY }, r0, { x: minX, y: 0, z: maxY }),
      // east hip
      tri({ x: maxX, y: 0, z: maxY }, r1, { x: maxX, y: 0, z: minY }),
    ]
    return {
      mode: 'croupe',
      faces,
      planLines: [
        { a: { x: rx0, y: cy }, b: { x: rx1, y: cy } },
        { a: { x: rx0, y: cy }, b: { x: minX, y: minY } },
        { a: { x: rx0, y: cy }, b: { x: minX, y: maxY } },
        { a: { x: rx1, y: cy }, b: { x: maxX, y: minY } },
        { a: { x: rx1, y: cy }, b: { x: maxX, y: maxY } },
      ],
      ridgeHeight: h,
    }
  }

  // along Y longer
  const inset = w / 2
  const ry0 = minY + inset
  const ry1 = maxY - inset
  if (ry1 - ry0 < 0.05) {
    const apex = { x: cx, y: h, z: cy }
    const faces = [
      tri({ x: minX, y: 0, z: minY }, { x: maxX, y: 0, z: minY }, apex),
      tri({ x: maxX, y: 0, z: minY }, { x: maxX, y: 0, z: maxY }, apex),
      tri({ x: maxX, y: 0, z: maxY }, { x: minX, y: 0, z: maxY }, apex),
      tri({ x: minX, y: 0, z: maxY }, { x: minX, y: 0, z: minY }, apex),
    ]
    return {
      mode: 'croupe',
      faces,
      planLines: [
        { a: { x: cx, y: cy }, b: { x: minX, y: minY } },
        { a: { x: cx, y: cy }, b: { x: maxX, y: minY } },
        { a: { x: cx, y: cy }, b: { x: maxX, y: maxY } },
        { a: { x: cx, y: cy }, b: { x: minX, y: maxY } },
      ],
      ridgeHeight: h,
    }
  }
  const r0 = { x: cx, y: h, z: ry0 }
  const r1 = { x: cx, y: h, z: ry1 }
  const faces = [
    quad({ x: minX, y: 0, z: minY }, { x: minX, y: 0, z: maxY }, r1, r0),
    quad({ x: maxX, y: 0, z: maxY }, { x: maxX, y: 0, z: minY }, r0, r1),
    tri({ x: minX, y: 0, z: minY }, { x: maxX, y: 0, z: minY }, r0),
    tri({ x: maxX, y: 0, z: maxY }, { x: minX, y: 0, z: maxY }, r1),
  ]
  return {
    mode: 'croupe',
    faces,
    planLines: [
      { a: { x: cx, y: ry0 }, b: { x: cx, y: ry1 } },
      { a: { x: cx, y: ry0 }, b: { x: minX, y: minY } },
      { a: { x: cx, y: ry0 }, b: { x: maxX, y: minY } },
      { a: { x: cx, y: ry1 }, b: { x: minX, y: maxY } },
      { a: { x: cx, y: ry1 }, b: { x: maxX, y: maxY } },
    ],
    ridgeHeight: h,
  }
}

export function roofPlanLines(roof: Roof): { a: Vec2; b: Vec2 }[] {
  return buildRoofGeometry(roof).planLines
}
