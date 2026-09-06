/**
 * IFC4 subset exporter for FORMA.
 * Emits ISO-10303-21 STEP text for:
 *   IfcProject, IfcSite, IfcBuilding, IfcBuildingStorey,
 *   IfcWallStandardCase, IfcOpeningElement (optional),
 *   IfcSlab, IfcBuildingElementProxy (furniture).
 * Coordinates in meters. Stories map to storeys.
 * Subset only — not a full ArchiCAD / Revit round-trip.
 */

import type { Project, Wall, Opening, Slab, Furniture, Story } from './types'
import { wallLength, wallAngle, wallCenter } from './types'
import { FURNITURE_PRESETS } from './catalog'

const IFC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

function ifcGuid(): string {
  let s = ''
  for (let i = 0; i < 22; i++) s += IFC_CHARS[(Math.random() * 64) | 0]
  return s
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

type Writer = {
  lines: string[]
  next: number
  push: (line: string) => number
}

function createWriter(): Writer {
  const lines: string[] = []
  let next = 1
  return {
    lines,
    get next() {
      return next
    },
    push(line: string) {
      const n = next++
      lines.push(`#${n}=${line};`)
      return n
    },
  }
}

/** Placement relative to parent IfcLocalPlacement. Angle around Z (rad). */
function localPlacement(
  w: Writer,
  parentId: number | null,
  x: number,
  y: number,
  z: number,
  angle = 0,
): number {
  const loc = w.push(`IFCCARTESIANPOINT((${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}))`)
  let axis: number
  if (Math.abs(angle) < 1e-9) {
    axis = w.push(`IFCAXIS2PLACEMENT3D(#${loc},$,$)`)
  } else {
    const dir = w.push(
      `IFCDIRECTION((${Math.cos(angle).toFixed(6)},${Math.sin(angle).toFixed(6)},0.))`,
    )
    const zdir = w.push(`IFCDIRECTION((0.,0.,1.))`)
    axis = w.push(`IFCAXIS2PLACEMENT3D(#${loc},#${zdir},#${dir})`)
  }
  const parent = parentId == null ? '$' : `#${parentId}`
  return w.push(`IFCLOCALPLACEMENT(${parent},#${axis})`)
}

function extrudedBox(
  w: Writer,
  ctxId: number,
  width: number,
  depth: number,
  height: number,
): number {
  const p0 = w.push(
    `IFCCARTESIANPOINT((${(-width / 2).toFixed(6)},${(-depth / 2).toFixed(6)}))`,
  )
  const axis2 = w.push(`IFCAXIS2PLACEMENT2D(#${p0},$)`)
  const profile = w.push(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,#${axis2},${width.toFixed(6)},${depth.toFixed(6)})`,
  )
  const origin = w.push(`IFCCARTESIANPOINT((0.,0.,0.))`)
  const zdir = w.push(`IFCDIRECTION((0.,0.,1.))`)
  const pos = w.push(`IFCAXIS2PLACEMENT3D(#${origin},#${zdir},$)`)
  const extrudeDir = w.push(`IFCDIRECTION((0.,0.,1.))`)
  const solid = w.push(
    `IFCEXTRUDEDAREASOLID(#${profile},#${pos},#${extrudeDir},${Math.max(0.01, height).toFixed(6)})`,
  )
  const shape = w.push(`IFCSHAPEREPRESENTATION(#${ctxId},'Body','SweptSolid',(#${solid}))`)
  return w.push(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}))`)
}

function polygonBBox(poly: { x: number; y: number }[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return {
    width: Math.max(0.1, maxX - minX),
    depth: Math.max(0.1, maxY - minY),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  }
}

function writeWall(
  w: Writer,
  wall: Wall,
  ownerId: number,
  storeyEntityId: number,
  storeyPlaceId: number,
  ctxId: number,
  openings: Opening[],
): void {
  const len = wallLength(wall)
  if (len < 0.01) return
  const angle = wallAngle(wall)
  const c = wallCenter(wall)
  // FORMA plan XZ → IFC XY (Vec2.y = world Z = IFC Y)
  const place = localPlacement(w, storeyPlaceId, c.x, c.y, 0, angle)
  const body = extrudedBox(w, ctxId, len, wall.thickness, wall.height)
  const wallId = w.push(
    `IFCWALLSTANDARDCASE('${ifcGuid()}',#${ownerId},'${esc(wall.id)}',$,$,#${place},#${body},$)`,
  )
  w.push(
    `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',#${ownerId},$,$,(#${wallId}),#${storeyEntityId})`,
  )

  for (const op of openings.filter((o) => o.wallId === wall.id)) {
    const t = Math.min(1, Math.max(0, op.t))
    const ox = (t - 0.5) * len
    const opPlace = localPlacement(w, place, ox, 0, op.sill, 0)
    const opBody = extrudedBox(w, ctxId, op.width, wall.thickness + 0.05, op.height)
    const opId = w.push(
      `IFCOPENINGELEMENT('${ifcGuid()}',#${ownerId},'${esc(op.id)}','${esc(op.kind)}',$,#${opPlace},#${opBody},$)`,
    )
    w.push(`IFCRELVOIDSELEMENT('${ifcGuid()}',#${ownerId},$,$,#${wallId},#${opId})`)
  }
}

function writeSlab(
  w: Writer,
  slab: Slab,
  story: Story,
  ownerId: number,
  storeyEntityId: number,
  storeyPlaceId: number,
  ctxId: number,
): void {
  const b = polygonBBox(slab.polygon)
  const elevRel = slab.elevation - slab.thickness - story.elevation
  const place = localPlacement(w, storeyPlaceId, b.cx, b.cy, elevRel, 0)
  const body = extrudedBox(w, ctxId, b.width, b.depth, Math.max(0.05, slab.thickness))
  const predefined =
    slab.kind === 'roof' ? '.ROOF.' : slab.kind === 'ground' ? '.BASESLAB.' : '.FLOOR.'
  const slabId = w.push(
    `IFCSLAB('${ifcGuid()}',#${ownerId},'${esc(slab.id)}','${esc(slab.kind)}',$,#${place},#${body},$,${predefined})`,
  )
  w.push(
    `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',#${ownerId},$,$,(#${slabId}),#${storeyEntityId})`,
  )
}

function writeFurniture(
  w: Writer,
  item: Furniture,
  ownerId: number,
  storeyEntityId: number,
  storeyPlaceId: number,
  ctxId: number,
): void {
  const label = FURNITURE_PRESETS[item.kind]?.label ?? item.kind
  const place = localPlacement(
    w,
    storeyPlaceId,
    item.position.x,
    item.position.y,
    0,
    item.rotation,
  )
  const body = extrudedBox(w, ctxId, item.width, item.depth, item.height)
  const proxyId = w.push(
    `IFCBUILDINGELEMENTPROXY('${ifcGuid()}',#${ownerId},'${esc(label)}','${esc(item.kind)}',$,#${place},#${body},$,.NOTDEFINED.)`,
  )
  w.push(
    `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',#${ownerId},$,$,(#${proxyId}),#${storeyEntityId})`,
  )
}

/** Generate IFC4 STEP text for a FORMA project (subset). */
export function exportIfc4(project: Project): string {
  const w = createWriter()
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, '')

  const app = w.push(`IFCAPPLICATION($,'0.9','FORMA','FORMA')`)
  const person = w.push(`IFCPERSON($,$,'FORMA',$,$,$,$,$)`)
  const org = w.push(`IFCORGANIZATION($,'FORMA',$,$,$)`)
  const personOrg = w.push(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`)
  const owner = w.push(
    `IFCOWNERHISTORY(#${personOrg},#${app},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})`,
  )

  const siLen = w.push(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`)
  const unitAssign = w.push(`IFCUNITASSIGNMENT((#${siLen}))`)

  const origin = w.push(`IFCCARTESIANPOINT((0.,0.,0.))`)
  const axisZ = w.push(`IFCDIRECTION((0.,0.,1.))`)
  const axisX = w.push(`IFCDIRECTION((1.,0.,0.))`)
  const world = w.push(`IFCAXIS2PLACEMENT3D(#${origin},#${axisZ},#${axisX})`)
  const ctx = w.push(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${world},$)`,
  )
  const subCtx = w.push(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${ctx},$,.MODEL_VIEW.,$)`,
  )

  const projectId = w.push(
    `IFCPROJECT('${ifcGuid()}',#${owner},'${esc(project.meta.name)}',$,$,$,$,(#${subCtx}),#${unitAssign})`,
  )

  const sitePlace = localPlacement(w, null, 0, 0, 0, 0)
  const siteId = w.push(
    `IFCSITE('${ifcGuid()}',#${owner},'${esc(project.meta.city || 'Site')}',$,$,#${sitePlace},$,$,.ELEMENT.,$,$,$,$,$)`,
  )
  w.push(`IFCRELAGGREGATES('${ifcGuid()}',#${owner},$,$,#${projectId},(#${siteId}))`)

  const bldgPlace = localPlacement(w, sitePlace, 0, 0, 0, 0)
  const bldgId = w.push(
    `IFCBUILDING('${ifcGuid()}',#${owner},'${esc(project.meta.name)}',$,$,#${bldgPlace},$,$,.ELEMENT.,$,$,$)`,
  )
  w.push(`IFCRELAGGREGATES('${ifcGuid()}',#${owner},$,$,#${siteId},(#${bldgId}))`)

  type StoryEntry = { story: Story; placeId: number; entityId: number }
  const storyMap = new Map<string, StoryEntry>()
  const storeyEntityIds: number[] = []

  for (const story of project.stories) {
    const place = localPlacement(w, bldgPlace, 0, 0, story.elevation, 0)
    const entityId = w.push(
      `IFCBUILDINGSTOREY('${ifcGuid()}',#${owner},'${esc(story.name)}',$,$,#${place},$,$,.ELEMENT.,${story.elevation.toFixed(6)})`,
    )
    storyMap.set(story.id, { story, placeId: place, entityId })
    storeyEntityIds.push(entityId)
  }

  if (storeyEntityIds.length) {
    w.push(
      `IFCRELAGGREGATES('${ifcGuid()}',#${owner},$,$,#${bldgId},(${storeyEntityIds
        .map((id) => `#${id}`)
        .join(',')}))`,
    )
  }

  for (const wall of project.walls) {
    const entry = storyMap.get(wall.storyId)
    if (!entry) continue
    writeWall(w, wall, owner, entry.entityId, entry.placeId, subCtx, project.openings)
  }

  for (const slab of project.slabs) {
    const entry = storyMap.get(slab.storyId)
    if (!entry) continue
    writeSlab(w, slab, entry.story, owner, entry.entityId, entry.placeId, subCtx)
  }

  for (const item of project.furniture) {
    const entry = storyMap.get(item.storyId)
    if (!entry) continue
    writeFurniture(w, item, owner, entry.entityId, entry.placeId, subCtx)
  }

  const header = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');",
    `FILE_NAME('${esc(project.meta.name)}.ifc','${now}',('FORMA'),('FORMA'),'FORMA IFC4 subset','FORMA','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
  ]

  return [...header, ...w.lines, 'ENDSEC;', 'END-ISO-10303-21;'].join('\n')
}

/** Trigger browser download of .ifc file. */
export function downloadIfc(project: Project): void {
  const text = exportIfc4(project)
  const blob = new Blob([text], { type: 'application/x-step' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = project.meta.name.replace(/[^\w\-]+/g, '_').slice(0, 48) || 'forma'
  a.href = url
  a.download = `${safe}.ifc`
  a.click()
  URL.revokeObjectURL(url)
}
