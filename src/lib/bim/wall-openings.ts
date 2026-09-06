import type { Opening, OpeningKind, Wall } from './types'
import { wallLength } from './types'

/** Solid box in wall-local space: origin at wall plan-center, Y up from wall base. */
export type WallSolidBox = {
  x: number
  y: number
  w: number
  h: number
}

export type OpeningLocal = {
  id: string
  kind: OpeningKind
  /** Center along wall local X (0 = wall center) */
  x: number
  sill: number
  height: number
  width: number
}

type Span = { a: number; b: number; sill: number; head: number }

/**
 * Build solid wall boxes with voids for openings (doors/windows).
 * Local frame: X along wall (−len/2…+len/2), Y up from base (0…height), Z unused.
 */
export function wallSolidBoxes(wall: Wall, openings: Opening[]): WallSolidBox[] {
  const len = wallLength(wall)
  const H = wall.height
  if (len < 1e-4 || H < 1e-4) return []

  const spans = normalizeSpans(wall.id, len, H, openings)
  if (spans.length === 0) {
    return [{ x: 0, y: H / 2, w: len, h: H }]
  }

  const xs = new Set<number>([0, len])
  for (const s of spans) {
    xs.add(s.a)
    xs.add(s.b)
  }
  const sortedX = [...xs].sort((a, b) => a - b)
  const boxes: WallSolidBox[] = []

  for (let i = 0; i < sortedX.length - 1; i++) {
    const x0 = sortedX[i]!
    const x1 = sortedX[i + 1]!
    const w = x1 - x0
    if (w < 1e-4) continue
    const mid = (x0 + x1) / 2
    const covering = spans.filter((s) => mid >= s.a - 1e-9 && mid <= s.b + 1e-9)

    if (covering.length === 0) {
      boxes.push({ x: mid - len / 2, y: H / 2, w, h: H })
      continue
    }

    const voids = mergeIntervals(covering.map((c) => [c.sill, c.head] as [number, number]))
    let yCursor = 0
    for (const [vs, ve] of voids) {
      if (vs > yCursor + 1e-4) {
        const h = vs - yCursor
        boxes.push({ x: mid - len / 2, y: yCursor + h / 2, w, h })
      }
      yCursor = Math.max(yCursor, ve)
    }
    if (yCursor < H - 1e-4) {
      const h = H - yCursor
      boxes.push({ x: mid - len / 2, y: yCursor + h / 2, w, h })
    }
  }

  return boxes
}

/** Opening poses in the same local frame as wallSolidBoxes. */
export function openingsLocal(wall: Wall, openings: Opening[]): OpeningLocal[] {
  const len = wallLength(wall)
  const H = wall.height
  const out: OpeningLocal[] = []
  for (const op of openings) {
    if (op.wallId !== wall.id) continue
    const width = Math.min(op.width, len * 0.98)
    if (width < 0.05) continue
    const sill = Math.max(0, Math.min(H - 0.05, op.sill))
    const height = Math.max(0.05, Math.min(H - sill, op.height))
    out.push({
      id: op.id,
      kind: op.kind,
      x: (op.t - 0.5) * len,
      sill,
      height,
      width,
    })
  }
  return out
}

function normalizeSpans(wallId: string, len: number, H: number, openings: Opening[]): Span[] {
  const spans: Span[] = []
  for (const op of openings) {
    if (op.wallId !== wallId) continue
    const cx = Math.min(1, Math.max(0, op.t)) * len
    const half = op.width / 2
    const a = Math.max(0, cx - half)
    const b = Math.min(len, cx + half)
    if (b - a < 0.02) continue
    const sill = Math.max(0, Math.min(H - 0.05, op.sill))
    const head = Math.max(sill + 0.05, Math.min(H, op.sill + op.height))
    spans.push({ a, b, sill, head })
  }
  spans.sort((u, v) => u.a - v.a)
  return spans
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [[sorted[0]![0], sorted[0]![1]]]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!
    const last = merged[merged.length - 1]!
    if (cur[0] <= last[1] + 1e-6) {
      last[1] = Math.max(last[1], cur[1])
    } else {
      merged.push([cur[0], cur[1]])
    }
  }
  return merged
}
