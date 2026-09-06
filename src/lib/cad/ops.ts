import type { Project, Story, Wall, Slab, Opening, Room, Column, Furniture, Stair, Roof, Vec2 } from '../bim/types'
import { uid } from '../bim/types'
import { FURNITURE_PRESETS } from '../bim/catalog'
import { dist, lineIntersection, projectOnSegment, segmentIntersection, snapNearWall } from './geom'

/** Clone a story and all its elements upward. Cap total stories at 80. */
export function copyStory(project: Project, storyId: string): Project {
  const src = project.stories.find((s) => s.id === storyId)
  if (!src) return project
  if (project.stories.length >= 80) return project

  const newStoryId = uid('story')

  const elev = src.elevation + src.height
  const newStory: Story = {
    id: newStoryId,
    name: `R+${project.stories.length}`,
    elevation: elev,
    height: src.height,
    index: project.stories.length,
  }

  const walls: Wall[] = project.walls
    .filter((w) => w.storyId === storyId)
    .map((w) => ({ ...w, id: uid('wall'), storyId: newStoryId }))

  const wallIdMap = new Map<string, string>()
  project.walls.filter((w) => w.storyId === storyId).forEach((w, i) => {
    wallIdMap.set(w.id, walls[i].id)
  })

  const openings: Opening[] = project.openings
    .filter((o) => wallIdMap.has(o.wallId))
    .map((o) => ({ ...o, id: uid('open'), wallId: wallIdMap.get(o.wallId)! }))

  const rooms: Room[] = project.rooms
    .filter((r) => r.storyId === storyId)
    .map((r) => ({ ...r, id: uid('room'), storyId: newStoryId }))

  const slabs: Slab[] = project.slabs
    .filter((s) => s.storyId === storyId && s.kind === 'floor')
    .map((s) => ({ ...s, id: uid('slab'), storyId: newStoryId, elevation: elev }))

  const columns: Column[] = project.columns
    .filter((c) => c.storyId === storyId)
    .map((c) => ({ ...c, id: uid('col'), storyId: newStoryId }))

  const furniture: Furniture[] = project.furniture
    .filter((f) => f.storyId === storyId)
    .map((f) => ({ ...f, id: uid('furn'), storyId: newStoryId }))

  const stairs: Stair[] = project.stairs
    .filter((s) => s.storyId === storyId)
    .map((s) => ({ ...s, id: uid('stair'), storyId: newStoryId }))

  const roofs: Roof[] = []

  return {
    ...project,
    stories: [...project.stories, newStory],
    walls: [...project.walls, ...walls],
    openings: [...project.openings, ...openings],
    rooms: [...project.rooms, ...rooms],
    slabs: [...project.slabs, ...slabs],
    columns: [...project.columns, ...columns],
    furniture: [...project.furniture, ...furniture],
    stairs: [...project.stairs, ...stairs],
    roofs: [...project.roofs, ...roofs],
    updatedAt: Date.now(),
  }
}

export function repeatStories(project: Project, storyId: string, count: number): Project {
  let p = project
  const n = Math.min(count, 80 - project.stories.length)
  for (let i = 0; i < n; i++) {
    const last = p.stories[p.stories.length - 1]
    p = copyStory(p, i === 0 ? storyId : last.id)
  }
  return p
}

const MIN_SEG = 0.05
/** Interior split must be this far from both ends (meters along wall). */
const MIN_SPLIT_END = 0.08

export type TrimResult = {
  project: Project
  note?: string
}

export type SplitWallResult = {
  project: Project
  wallIds: [string, string] | null
  dropped: boolean
}

/**
 * Split wall at parameter t (clamped). Remaps openings onto each half.
 * Returns null wallIds if the cut is too close to an endpoint (no-op / shorten not done here).
 */
export function splitWallAt(
  project: Project,
  wallId: string,
  t: number,
  point?: Vec2,
): SplitWallResult {
  const wall = project.walls.find((w) => w.id === wallId)
  if (!wall) return { project, wallIds: null, dropped: false }

  const len = dist(wall.a, wall.b)
  if (len < MIN_SEG * 2) return { project, wallIds: null, dropped: false }

  const cutT = Math.max(0, Math.min(1, t))
  const cut = point ? { ...point } : {
    x: wall.a.x + (wall.b.x - wall.a.x) * cutT,
    y: wall.a.y + (wall.b.y - wall.a.y) * cutT,
  }

  if (cutT * len < MIN_SPLIT_END || (1 - cutT) * len < MIN_SPLIT_END) {
    return { project, wallIds: null, dropped: false }
  }

  const id1 = uid('wall')
  const id2 = uid('wall')
  const wall1: Wall = { ...wall, id: id1, b: { ...cut } }
  const wall2: Wall = { ...wall, id: id2, a: { ...cut } }

  const openings = project.openings.filter((o) => o.wallId !== wallId)
  let dropped = false
  for (const o of project.openings.filter((x) => x.wallId === wallId)) {
    if (o.t < cutT - 0.001) {
      openings.push({ ...o, id: uid('open'), wallId: id1, t: cutT > 1e-6 ? o.t / cutT : 0 })
    } else if (o.t > cutT + 0.001) {
      const rem = 1 - cutT
      openings.push({
        ...o,
        id: uid('open'),
        wallId: id2,
        t: rem > 1e-6 ? (o.t - cutT) / rem : 0,
      })
    } else {
      dropped = true
    }
  }

  return {
    project: {
      ...project,
      walls: [...project.walls.filter((w) => w.id !== wallId), wall1, wall2],
      openings,
      updatedAt: Date.now(),
    },
    wallIds: [id1, id2],
    dropped,
  }
}

function remapOpeningsAfterShorten(
  project: Project,
  wallId: string,
  keepFrom: number,
  keepTo: number,
): { openings: Opening[]; dropped: boolean } {
  const span = keepTo - keepFrom
  let dropped = false
  const openings = project.openings.flatMap((o) => {
    if (o.wallId !== wallId) return [o]
    if (o.t < keepFrom - 0.001 || o.t > keepTo + 0.001) {
      dropped = true
      return []
    }
    const t = span > 1e-6 ? (o.t - keepFrom) / span : 0.5
    return [{ ...o, t: Math.max(0, Math.min(1, t)) }]
  })
  return { openings, dropped }
}

/**
 * When wall A meets wall B in a T: split B at the junction and pin A's endpoint.
 * preferEnd: which endpoint of A to move ('a' | 'b'); default = closer to junction.
 */
export function makeTJoint(
  project: Project,
  wallAId: string,
  wallBId: string,
  preferEnd?: 'a' | 'b',
): TrimResult {
  if (wallAId === wallBId) return { project }
  const wallA = project.walls.find((w) => w.id === wallAId)
  const wallB = project.walls.find((w) => w.id === wallBId)
  if (!wallA || !wallB) return { project }
  if (wallA.storyId !== wallB.storyId) return { project }

  const hit = lineIntersection(wallA.a, wallA.b, wallB.a, wallB.b)
  if (!hit) return { project, note: 'Murs paralleles — joint T impossible' }

  // Junction must land on B's segment (with small tolerance)
  const s = hit.s
  if (s < -0.02 || s > 1.02) {
    return { project, note: 'Intersection hors du mur cible' }
  }
  const sClamped = Math.max(0, Math.min(1, s))
  const junction = {
    x: wallB.a.x + (wallB.b.x - wallB.a.x) * sClamped,
    y: wallB.a.y + (wallB.b.y - wallB.a.y) * sClamped,
  }

  const toA = dist(junction, wallA.a)
  const toB = dist(junction, wallA.b)
  let end: 'a' | 'b' = preferEnd ?? (toA <= toB ? 'a' : 'b')

  // If preferEnd would leave a near-zero wall, flip
  const other = end === 'a' ? wallA.b : wallA.a
  if (dist(junction, other) < MIN_SEG) {
    end = end === 'a' ? 'b' : 'a'
  }

  let nextA: Wall =
    end === 'a' ? { ...wallA, a: { ...junction } } : { ...wallA, b: { ...junction } }
  if (dist(nextA.a, nextA.b) < MIN_SEG) return { project }

  let p: Project = {
    ...project,
    walls: project.walls.map((w) => (w.id === wallAId ? nextA : w)),
    updatedAt: Date.now(),
  }

  const split = splitWallAt(p, wallBId, sClamped, junction)
  p = split.project

  const notes: string[] = ['Joint en T cree']
  if (split.wallIds) notes[0] = 'Joint en T — mur cible coupe'
  if (split.dropped) notes.push('ouverture au point de coupe retiree')

  return { project: p, note: notes.join(' ; ') }
}

/**
 * Trim / split a wall at cutPoint.
 * Prefers a real intersection with another wall on the same story near the click;
 * otherwise projects the click onto the wall centerline.
 * When an intersection with target wall B is used, B is also split (T-joint).
 */
export function trimWall(project: Project, wallId: string, cutPoint: Vec2): TrimResult {
  const wall = project.walls.find((w) => w.id === wallId)
  if (!wall) return { project }

  const len = dist(wall.a, wall.b)
  if (len < MIN_SEG * 2) return { project }

  const sameStory = project.walls.filter((w) => w.storyId === wall.storyId && w.id !== wallId)

  let cutT: number | null = null
  let cut: Vec2 | null = null
  let bestScore = Infinity
  let targetId: string | null = null
  let targetS: number | null = null

  for (const other of sameStory) {
    const hit = segmentIntersection(wall.a, wall.b, other.a, other.b, 0.02)
    if (!hit) continue
    const score = dist(hit.point, cutPoint)
    if (score < 0.8 && score < bestScore) {
      bestScore = score
      cutT = hit.t
      cut = hit.point
      targetId = other.id
      targetS = hit.s
    }
  }

  // Also: if click is near another wall and projects to an endpoint-ish T on that wall
  if (cut == null || cutT == null) {
    const proj = projectOnSegment(cutPoint, wall.a, wall.b)
    cutT = proj.t
    cut = proj.point

    // Find nearest other wall whose segment is close to cut — candidate T target
    let bestOther: { id: string; s: number; d: number; point: Vec2 } | null = null
    for (const other of sameStory) {
      const op = projectOnSegment(cut, other.a, other.b)
      if (op.dist < 0.35 && op.t > 0.02 && op.t < 0.98) {
        if (!bestOther || op.dist < bestOther.d) {
          bestOther = { id: other.id, s: op.t, d: op.dist, point: op.point }
        }
      }
    }
    if (bestOther && bestOther.d < 0.25) {
      targetId = bestOther.id
      targetS = bestOther.s
      cut = bestOther.point
      // Recompute t of cut on wall
      const re = projectOnSegment(cut, wall.a, wall.b)
      cutT = re.t
    }
  }

  let dropped = false
  let notes: string[] = []
  let p = project

  if (cutT * len < MIN_SEG) {
    const nextWalls = p.walls.map((w) => (w.id === wallId ? { ...w, a: cut! } : w))
    const openings = remapOpeningsAfterShorten(p, wallId, cutT, 1)
    dropped = openings.dropped
    p = { ...p, walls: nextWalls, openings: openings.openings, updatedAt: Date.now() }
    if (dropped) notes.push('Ouvertures hors segment retirees')
  } else if ((1 - cutT) * len < MIN_SEG) {
    const nextWalls = p.walls.map((w) => (w.id === wallId ? { ...w, b: cut! } : w))
    const openings = remapOpeningsAfterShorten(p, wallId, 0, cutT)
    dropped = openings.dropped
    p = { ...p, walls: nextWalls, openings: openings.openings, updatedAt: Date.now() }
    if (dropped) notes.push('Ouvertures hors segment retirees')
  } else {
    const splitA = splitWallAt(p, wallId, cutT, cut!)
    p = splitA.project
    if (splitA.dropped) dropped = true
    notes.push(targetId ? 'Mur coupe en deux segments (joint en T)' : 'Mur coupe en deux segments')
    if (splitA.dropped) notes.push('ouverture au point de coupe retiree')
  }

  // Split target wall B at junction for proper T topology
  if (targetId != null && targetS != null && cut != null) {
    // Target may still exist (if we didn't replace it); verify
    const still = p.walls.find((w) => w.id === targetId)
    if (still) {
      // Snap A's surviving endpoint(s) that are near junction onto exact cut
      p = {
        ...p,
        walls: p.walls.map((w) => {
          if (w.id === targetId) return w
          // Only walls that came from original wallId lineage on this story tip
          let next = w
          if (dist(w.a, cut!) < 0.05) next = { ...next, a: { ...cut! } }
          if (dist(w.b, cut!) < 0.05) next = { ...next, b: { ...cut! } }
          return next
        }),
        updatedAt: Date.now(),
      }
      const splitB = splitWallAt(p, targetId, targetS, cut)
      if (splitB.wallIds) {
        p = splitB.project
        notes.push('mur cible coupe au T')
        if (splitB.dropped) notes.push('ouverture cible retiree')
      }
    }
  }

  return {
    project: p,
    note: notes.length ? notes.join(' ; ') : undefined,
  }
}

/**
 * Extend wallId so an endpoint meets the infinite line of targetWallId,
 * then split the target at the junction when it lands mid-segment (T-joint).
 */
export function extendWall(project: Project, wallId: string, targetWallId: string): Project {
  const res = extendWallDetailed(project, wallId, targetWallId)
  return res.project
}

export function extendWallDetailed(
  project: Project,
  wallId: string,
  targetWallId: string,
): TrimResult {
  if (wallId === targetWallId) return { project }
  const wall = project.walls.find((w) => w.id === wallId)
  const target = project.walls.find((w) => w.id === targetWallId)
  if (!wall || !target) return { project }

  const hit = lineIntersection(wall.a, wall.b, target.a, target.b)
  if (!hit) return { project, note: 'Murs paralleles' }

  const toA = dist(hit.point, wall.a)
  const toB = dist(hit.point, wall.b)

  let next: Wall
  if (hit.t < 0) {
    next = { ...wall, a: { ...hit.point } }
  } else if (hit.t > 1) {
    next = { ...wall, b: { ...hit.point } }
  } else if (toA <= toB) {
    next = { ...wall, a: { ...hit.point } }
  } else {
    next = { ...wall, b: { ...hit.point } }
  }

  if (dist(next.a, next.b) < MIN_SEG) return { project }

  let p: Project = {
    ...project,
    walls: project.walls.map((w) => (w.id === wallId ? next : w)),
    updatedAt: Date.now(),
  }

  // T-split target if junction is on its segment
  if (hit.s >= 0.02 && hit.s <= 0.98) {
    const splitB = splitWallAt(p, targetWallId, hit.s, hit.point)
    if (splitB.wallIds) {
      p = splitB.project
      return {
        project: p,
        note: splitB.dropped
          ? 'Prolonge + T ; ouverture cible retiree'
          : 'Prolonge + joint en T (mur cible coupe)',
      }
    }
  }

  return { project: p, note: 'Mur prolonge' }
}

/**
 * After drawing a wall, auto-heal obvious T: if an endpoint of `wallId`
 * lies mid-span on another same-story wall, split that other wall.
 */
export function healWallTJoints(project: Project, wallId: string): TrimResult {
  const wall = project.walls.find((w) => w.id === wallId)
  if (!wall) return { project }

  let p = project
  let healed = 0
  const others = () => p.walls.filter((w) => w.storyId === wall.storyId && w.id !== wallId)

  // Refresh wall reference after mutations (id stable for the drawn wall)
  const ends: Array<'a' | 'b'> = ['a', 'b']
  for (const end of ends) {
    const current = p.walls.find((w) => w.id === wallId)
    if (!current) break
    const tip = end === 'a' ? current.a : current.b
    for (const other of others()) {
      const proj = projectOnSegment(tip, other.a, other.b)
      if (proj.dist > 0.12) continue
      if (proj.t < 0.04 || proj.t > 0.96) continue
      // Snap tip exactly onto other
      p = {
        ...p,
        walls: p.walls.map((w) =>
          w.id === wallId
            ? end === 'a'
              ? { ...w, a: { ...proj.point } }
              : { ...w, b: { ...proj.point } }
            : w,
        ),
        updatedAt: Date.now(),
      }
      const split = splitWallAt(p, other.id, proj.t, proj.point)
      if (split.wallIds) {
        p = split.project
        healed++
      }
      break
    }
  }

  return {
    project: p,
    note: healed > 0 ? `Auto-T : ${healed} joint(s) soigne(s)` : undefined,
  }
}

/** Place furniture from catalog preset at world XZ (Vec2), optionally snapped near walls. */
export function placeFurniture(
  project: Project,
  storyId: string,
  kind: Furniture['kind'],
  position: Vec2,
  rotation = 0,
  snap = true,
): Project {
  const preset = FURNITURE_PRESETS[kind]
  if (!preset) return project
  const walls = project.walls.filter((w) => w.storyId === storyId)
  const pos = snap ? snapNearWall(position, walls) : position
  const item: Furniture = {
    id: uid('furn'),
    storyId,
    kind,
    position: { x: Math.round(pos.x * 20) / 20, y: Math.round(pos.y * 20) / 20 },
    rotation,
    width: preset.w,
    depth: preset.d,
    height: preset.h,
  }
  return {
    ...project,
    furniture: [...project.furniture, item],
    updatedAt: Date.now(),
  }
}
