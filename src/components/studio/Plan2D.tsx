import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import type { Project, Vec2 } from '../../lib/bim/types'
import { useProjectStore } from '../../lib/store/project-store'
import { FURNITURE_PRESETS, OPENING_DEFAULTS } from '../../lib/bim/catalog'
import { nearestWallHit } from '../../lib/cad/ops'
import {
  labelForStairMode,
  normalizeStair,
  pointsNeededForMode,
  stairHitDist,
  stairPlanOutlines,
} from '../../lib/cad/stairs'
import type { StairMode } from '../../lib/bim/types'

type Props = {
  project: Project
  storyId: string | null
}

export default function Plan2D({ project, storyId }: Props) {
  const tool = useProjectStore((s) => s.tool)
  const ortho = useProjectStore((s) => s.ortho)
  const setOrtho = useProjectStore((s) => s.setOrtho)
  const addWall = useProjectStore((s) => s.addWall)
  const select = useProjectStore((s) => s.select)
  const selection = useProjectStore((s) => s.selection)
  const placeKind = useProjectStore((s) => s.placeKind)
  const placeRotation = useProjectStore((s) => s.placeRotation)
  const addFurnitureAt = useProjectStore((s) => s.addFurnitureAt)
  const applyTrim = useProjectStore((s) => s.applyTrim)
  const applyExtend = useProjectStore((s) => s.applyExtend)
  const setInspectorOpen = useProjectStore((s) => s.setInspectorOpen)
  const setInspectorTab = useProjectStore((s) => s.setInspectorTab)
  const addOpeningAtWall = useProjectStore((s) => s.addOpeningAtWall)
  const addSlab = useProjectStore((s) => s.addSlab)
  const addSlabPolygon = useProjectStore((s) => s.addSlabPolygon)
  const addColumn = useProjectStore((s) => s.addColumn)
  const addStairPath = useProjectStore((s) => s.addStairPath)
  const addRoof = useProjectStore((s) => s.addRoof)
  const addRoofPolygon = useProjectStore((s) => s.addRoofPolygon)
  const stairMode = useProjectStore((s) => s.stairMode)
  const setStairMode = useProjectStore((s) => s.setStairMode)
  const polyDrawMode = useProjectStore((s) => s.polyDrawMode)
  const setPolyDrawMode = useProjectStore((s) => s.setPolyDrawMode)

  const [draft, setDraft] = useState<Vec2 | null>(null)
  const [polyDraft, setPolyDraft] = useState<Vec2[]>([])
  const [hover, setHover] = useState<Vec2 | null>(null)
  /** For trim/extend: first selected wall id awaiting second click */
  const [cadWallId, setCadWallId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const lastClickAt = useRef(0)

  const story = project.stories.find((s) => s.id === storyId) ?? project.stories[0]
  const walls = project.walls.filter((w) => w.storyId === story?.id)
  const rooms = project.rooms.filter((r) => r.storyId === story?.id)
  const furniture = project.furniture.filter((f) => f.storyId === story?.id)
  const columns = project.columns.filter((c) => c.storyId === story?.id)
  const slabs = project.slabs.filter((s) => s.storyId === story?.id)
  const stairs = project.stairs.filter((s) => s.storyId === story?.id)
  const roofs = project.roofs.filter((r) => r.storyId === story?.id)
  const wallIds = new Set(walls.map((w) => w.id))
  const openings = project.openings.filter((o) => wallIds.has(o.wallId))

  useEffect(() => {
    setDraft(null)
    setPolyDraft([])
    setCadWallId(null)
  }, [tool, stairMode, polyDrawMode])

  const finishPolygon = useCallback(() => {
    if (polyDraft.length < 3) return
    if (tool === 'slab') addSlabPolygon(polyDraft)
    else if (tool === 'roof') addRoofPolygon(polyDraft)
    setPolyDraft([])
  }, [polyDraft, tool, addSlabPolygon, addRoofPolygon])

  const finishStairPath = useCallback(() => {
    const minPts = stairMode === 'droit' ? 2 : 3
    if (polyDraft.length < minPts) return
    addStairPath(polyDraft, stairMode)
    setPolyDraft([])
  }, [polyDraft, stairMode, addStairPath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(null)
        setPolyDraft([])
        setCadWallId(null)
      }
      if (e.key === 'Enter') {
        if (tool === 'slab' || tool === 'roof') {
          if (polyDrawMode === 'polygon' && polyDraft.length >= 3) {
            e.preventDefault()
            finishPolygon()
          }
        }
        if (tool === 'stair' && polyDraft.length >= (stairMode === 'droit' ? 2 : 3)) {
          e.preventDefault()
          finishStairPath()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, polyDrawMode, polyDraft, stairMode, finishPolygon, finishStairPath])

  const bounds = useMemo(() => {
    let minX = -15,
      maxX = 15,
      minY = -15,
      maxY = 15
    for (const w of walls) {
      minX = Math.min(minX, w.a.x, w.b.x)
      maxX = Math.max(maxX, w.a.x, w.b.x)
      minY = Math.min(minY, w.a.y, w.b.y)
      maxY = Math.max(maxY, w.a.y, w.b.y)
    }
    for (const f of furniture) {
      minX = Math.min(minX, f.position.x)
      maxX = Math.max(maxX, f.position.x)
      minY = Math.min(minY, f.position.y)
      maxY = Math.max(maxY, f.position.y)
    }
    for (const c of columns) {
      minX = Math.min(minX, c.position.x)
      maxX = Math.max(maxX, c.position.x)
      minY = Math.min(minY, c.position.y)
      maxY = Math.max(maxY, c.position.y)
    }
    const pad = 4
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad }
  }, [walls, furniture, columns])

  const vb = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const svg = svgRef.current
      if (!svg) return { x: 0, y: 0 }
      const pt = svg.createSVGPoint()
      pt.x = clientX
      pt.y = clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return { x: 0, y: 0 }
      const local = pt.matrixTransform(ctm.inverse())
      let x = local.x
      let y = local.y
      const anchor =
        draft ??
        (polyDraft.length > 0 ? polyDraft[polyDraft.length - 1]! : null)
      if (ortho && anchor && (tool === 'wall' || tool === 'stair')) {
        const dx = Math.abs(x - anchor.x)
        const dy = Math.abs(y - anchor.y)
        if (dx > dy) y = anchor.y
        else x = anchor.x
      }
      return { x: Math.round(x * 20) / 20, y: Math.round(y * 20) / 20 }
    },
    [draft, polyDraft, ortho, tool],
  )

  const hitWall = (p: Vec2, maxDist = 0.55): string | null => {
    return nearestWallHit(p, walls, maxDist)?.wall.id ?? null
  }

  const onPointerMove = (e: React.PointerEvent) => {
    setHover(clientToWorld(e.clientX, e.clientY))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!story) return
    const p = clientToWorld(e.clientX, e.clientY)

    if (tool === 'objects' && placeKind) {
      addFurnitureAt(p)
      return
    }

    if (tool === 'door' || tool === 'window') {
      const hit = nearestWallHit(p, walls, 0.7)
      if (hit) {
        addOpeningAtWall(hit.wall.id, hit.t, tool === 'door' ? 'door' : 'window')
      }
      return
    }

    if (tool === 'column') {
      addColumn(p)
      return
    }

    if (tool === 'slab' || tool === 'roof') {
      const useRect = polyDrawMode === 'rect' || e.shiftKey
      if (useRect) {
        if (!draft) {
          setDraft(p)
          setPolyDraft([])
          return
        }
        if (tool === 'slab') addSlab(draft, p)
        else addRoof(draft, p)
        setDraft(null)
        return
      }
      // Polygon mode: click vertices; double-click closes
      const now = Date.now()
      const isDouble = now - lastClickAt.current < 320 && polyDraft.length >= 2
      lastClickAt.current = now
      if (isDouble) {
        const next = [...polyDraft, p]
        if (tool === 'slab') addSlabPolygon(next.length >= 3 ? next : polyDraft)
        else addRoofPolygon(next.length >= 3 ? next : polyDraft)
        setPolyDraft([])
        return
      }
      setPolyDraft((prev) => [...prev, p])
      return
    }

    if (tool === 'stair') {
      const needed = pointsNeededForMode(stairMode)
      const now = Date.now()
      const next = [...polyDraft, p]
      // Auto-finish when enough points for mode
      if (next.length >= needed) {
        addStairPath(next, stairMode)
        setPolyDraft([])
        lastClickAt.current = now
        return
      }
      setPolyDraft(next)
      lastClickAt.current = now
      return
    }

    if (tool === 'trim') {
      if (!cadWallId) {
        const id = hitWall(p) ?? (selection?.kind === 'wall' ? selection.id : null)
        if (id) {
          setCadWallId(id)
          select({ kind: 'wall', id })
        }
        return
      }
      applyTrim(cadWallId, p)
      setCadWallId(null)
      return
    }

    if (tool === 'extend') {
      if (!cadWallId) {
        const id = hitWall(p) ?? (selection?.kind === 'wall' ? selection.id : null)
        if (id) {
          setCadWallId(id)
          select({ kind: 'wall', id })
        }
        return
      }
      const target = hitWall(p)
      if (target && target !== cadWallId) {
        applyExtend(cadWallId, target)
        setCadWallId(null)
      }
      return
    }

    if (tool !== 'wall' && tool !== 'rect') {
      const col = columns.find(
        (c) => Math.hypot(c.position.x - p.x, c.position.y - p.y) < Math.max(0.35, c.width),
      )
      if (col) {
        select({ kind: 'column', id: col.id })
        setInspectorOpen(true)
        setInspectorTab('ouvrage')
        return
      }
      const stair = stairs.find((s) => stairHitDist(normalizeStair(s), p) < Math.max(0.45, (s.width ?? 1) * 0.55))
      if (stair) {
        select({ kind: 'stair', id: stair.id })
        setInspectorOpen(true)
        setInspectorTab('ouvrage')
        return
      }
      const slab = slabs.find((s) => {
        const xs = s.polygon.map((pt) => pt.x)
        const ys = s.polygon.map((pt) => pt.y)
        return p.x >= Math.min(...xs) && p.x <= Math.max(...xs) && p.y >= Math.min(...ys) && p.y <= Math.max(...ys)
      })
      if (slab) {
        select({ kind: 'slab', id: slab.id })
        setInspectorOpen(true)
        setInspectorTab('ouvrage')
        return
      }
      const furn = furniture.find(
        (f) => Math.hypot(f.position.x - p.x, f.position.y - p.y) < Math.max(0.4, f.width * 0.35),
      )
      if (furn) {
        select({ kind: 'furniture', id: furn.id })
        setInspectorOpen(true)
        setInspectorTab('ouvrage')
        return
      }
      const openHit = nearestWallHit(p, walls, 0.45)
      if (openHit) {
        const nearOpen = openings.find((o) => {
          if (o.wallId !== openHit.wall.id) return false
          return Math.abs(o.t - openHit.t) * Math.hypot(openHit.wall.b.x - openHit.wall.a.x, openHit.wall.b.y - openHit.wall.a.y) < o.width * 0.6
        })
        if (nearOpen) {
          select({ kind: 'opening', id: nearOpen.id })
          setInspectorOpen(true)
          setInspectorTab('ouvrage')
          return
        }
      }
      select(null)
      setCadWallId(null)
      return
    }

    if (!draft) {
      setDraft(p)
      return
    }
    if (tool === 'wall') {
      addWall({
        storyId: story.id,
        a: draft,
        b: p,
        thickness: 0.2,
        height: story.height,
        typology: 'exterior',
      })
      setDraft(null)
    } else if (tool === 'rect') {
      const x0 = Math.min(draft.x, p.x)
      const y0 = Math.min(draft.y, p.y)
      const x1 = Math.max(draft.x, p.x)
      const y1 = Math.max(draft.y, p.y)
      const corners: Vec2[] = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ]
      for (let i = 0; i < 4; i++) {
        addWall({
          storyId: story.id,
          a: corners[i],
          b: corners[(i + 1) % 4],
          thickness: 0.2,
          height: story.height,
          typology: 'exterior',
        })
      }
      setDraft(null)
    }
  }

  const openingPreview =
    (tool === 'door' || tool === 'window') && hover
      ? nearestWallHit(hover, walls, 0.7)
      : null

  return (
    <div className="absolute inset-0 bg-[#04080c]">
      <div className="absolute top-20 left-3 z-10 flex gap-2 flex-wrap max-w-[92vw]">
        <button type="button" className="chip" data-active={ortho} onClick={() => setOrtho(!ortho)}>
          Ortho {ortho ? 'ON' : 'OFF'}
        </button>
        {tool === 'stair' &&
          (['droit', 'quart', 'demi'] as StairMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              data-active={stairMode === m}
              onClick={() => {
                setStairMode(m)
                setPolyDraft([])
              }}
            >
              {labelForStairMode(m)}
            </button>
          ))}
        {(tool === 'slab' || tool === 'roof') && (
          <>
            <button
              type="button"
              className="chip"
              data-active={polyDrawMode === 'polygon'}
              onClick={() => {
                setPolyDrawMode('polygon')
                setDraft(null)
              }}
            >
              Polygone
            </button>
            <button
              type="button"
              className="chip"
              data-active={polyDrawMode === 'rect'}
              onClick={() => {
                setPolyDrawMode('rect')
                setPolyDraft([])
              }}
            >
              Rectangle
            </button>
          </>
        )}
        {(draft || polyDraft.length > 0) && (
          <button
            type="button"
            className="chip"
            onClick={() => {
              setDraft(null)
              setPolyDraft([])
            }}
          >
            Annuler
          </button>
        )}
        {tool === 'stair' &&
          polyDraft.length >= (stairMode === 'droit' ? 2 : 3) &&
          polyDraft.length < pointsNeededForMode(stairMode) && (
          <button type="button" className="chip" onClick={() => finishStairPath()}>
            Terminer
          </button>
        )}
        {(tool === 'slab' || tool === 'roof') && polyDrawMode === 'polygon' && polyDraft.length >= 3 && (
          <button type="button" className="chip" onClick={() => finishPolygon()}>
            Terminer
          </button>
        )}
        {cadWallId && (
          <button type="button" className="chip" onClick={() => setCadWallId(null)}>
            Annuler CAD
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={vb}
        className="w-full h-full"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        <defs>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#12202a" strokeWidth="0.02" />
          </pattern>
        </defs>
        <rect
          x={bounds.minX}
          y={bounds.minY}
          width={bounds.maxX - bounds.minX}
          height={bounds.maxY - bounds.minY}
          fill="url(#grid)"
        />

        {rooms.map((r) => {
          const pts = r.polygon.map((pt) => `${pt.x},${pt.y}`).join(' ')
          return <polygon key={r.id} points={pts} fill="rgba(110,208,195,0.08)" stroke="none" />
        })}

        {slabs.map((s) => {
          const pts = s.polygon.map((pt) => `${pt.x},${pt.y}`).join(' ')
          const active = selection?.kind === 'slab' && selection.id === s.id
          return (
            <polygon
              key={s.id}
              points={pts}
              fill={active ? 'rgba(110,208,195,0.22)' : 'rgba(110,208,195,0.06)'}
              stroke={active ? '#6ed0c3' : '#3a5560'}
              strokeWidth={0.04}
              strokeDasharray={s.kind === 'pool' ? '0.15 0.1' : undefined}
              onPointerDown={(e) => {
                e.stopPropagation()
                select({ kind: 'slab', id: s.id })
                setInspectorOpen(true)
                setInspectorTab('ouvrage')
              }}
            />
          )
        })}

        {roofs.map((r) => {
          const pts = r.polygon.map((pt) => `${pt.x},${pt.y}`).join(' ')
          const active = selection?.kind === 'roof' && selection.id === r.id
          return (
            <polygon
              key={r.id}
              points={pts}
              fill="none"
              stroke={active ? '#c4784a' : '#8b5a3c'}
              strokeWidth={0.05}
              strokeDasharray="0.2 0.12"
              onPointerDown={(e) => {
                e.stopPropagation()
                select({ kind: 'roof', id: r.id })
                setInspectorOpen(true)
                setInspectorTab('ouvrage')
              }}
            />
          )
        })}

        {furniture.map((f) => {
          const active = selection?.kind === 'furniture' && selection.id === f.id
          const preset = FURNITURE_PRESETS[f.kind]
          return (
            <g
              key={f.id}
              transform={`translate(${f.position.x}, ${f.position.y}) rotate(${(f.rotation * 180) / Math.PI})`}
              onPointerDown={(e) => {
                e.stopPropagation()
                select({ kind: 'furniture', id: f.id })
                setInspectorOpen(true)
                setInspectorTab('ouvrage')
              }}
            >
              <rect
                x={-f.width / 2}
                y={-f.depth / 2}
                width={f.width}
                height={f.depth}
                fill={active ? 'rgba(110,208,195,0.45)' : 'rgba(110,208,195,0.18)'}
                stroke={active ? '#6ed0c3' : '#4a6570'}
                strokeWidth={0.04}
              />
              <text
                x={0}
                y={0.08}
                textAnchor="middle"
                fill="#a8bdc8"
                fontSize={0.28}
                fontFamily="IBM Plex Mono"
              >
                {preset?.label?.slice(0, 6) ?? f.kind}
              </text>
            </g>
          )
        })}

        {columns.map((c) => {
          const active = selection?.kind === 'column' && selection.id === c.id
          return (
            <rect
              key={c.id}
              x={c.position.x - c.width / 2}
              y={c.position.y - c.depth / 2}
              width={c.width}
              height={c.depth}
              fill={active ? 'rgba(110,208,195,0.5)' : 'rgba(154,163,168,0.55)'}
              stroke={active ? '#6ed0c3' : '#9aa3a8'}
              strokeWidth={0.04}
              onPointerDown={(e) => {
                e.stopPropagation()
                select({ kind: 'column', id: c.id })
                setInspectorOpen(true)
                setInspectorTab('ouvrage')
              }}
            />
          )
        })}

        {stairs.map((raw) => {
          const s = normalizeStair(raw)
          const active = selection?.kind === 'stair' && selection.id === s.id
          const outlines = stairPlanOutlines(s)
          return (
            <g
              key={s.id}
              onPointerDown={(e) => {
                e.stopPropagation()
                select({ kind: 'stair', id: s.id })
                setInspectorOpen(true)
                setInspectorTab('ouvrage')
              }}
            >
              {outlines.landings.map((poly, i) => (
                <polygon
                  key={`land-${i}`}
                  points={poly.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                  fill={active ? 'rgba(110,208,195,0.28)' : 'rgba(110,208,195,0.1)'}
                  stroke="#6ed0c3"
                  strokeWidth={0.035}
                />
              ))}
              {outlines.flights.map((poly, i) => (
                <polygon
                  key={`flight-${i}`}
                  points={poly.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                  fill={active ? 'rgba(110,208,195,0.35)' : 'rgba(110,208,195,0.12)'}
                  stroke="#6ed0c3"
                  strokeWidth={0.04}
                />
              ))}
              {s.path.map((pt, i) =>
                i < s.path.length - 1 ? (
                  <line
                    key={`path-${i}`}
                    x1={pt.x}
                    y1={pt.y}
                    x2={s.path[i + 1]!.x}
                    y2={s.path[i + 1]!.y}
                    stroke="#6ed0c3"
                    strokeWidth={0.03}
                    opacity={0.4}
                    strokeDasharray="0.1 0.08"
                  />
                ) : null,
              )}
            </g>
          )
        })}

        {walls.map((w) => {
          const active =
            (selection?.kind === 'wall' && selection.id === w.id) || cadWallId === w.id
          return (
            <line
              key={w.id}
              x1={w.a.x}
              y1={w.a.y}
              x2={w.b.x}
              y2={w.b.y}
              stroke={active ? '#6ed0c3' : w.typology === 'exterior' ? '#c5d4de' : '#8aa0ae'}
              strokeWidth={w.thickness}
              strokeLinecap="square"
              onPointerDown={(e) => {
                e.stopPropagation()
                if (tool === 'door' || tool === 'window') {
                  const p = clientToWorld(e.clientX, e.clientY)
                  const hit = nearestWallHit(p, [w], 2)
                  if (hit) addOpeningAtWall(w.id, hit.t, tool === 'door' ? 'door' : 'window')
                  return
                }
                if (tool === 'trim' || tool === 'extend') {
                  if (!cadWallId) {
                    setCadWallId(w.id)
                    select({ kind: 'wall', id: w.id })
                  } else if (tool === 'extend' && cadWallId !== w.id) {
                    applyExtend(cadWallId, w.id)
                    setCadWallId(null)
                  } else if (tool === 'trim') {
                    const mid = {
                      x: (w.a.x + w.b.x) / 2,
                      y: (w.a.y + w.b.y) / 2,
                    }
                    const p = clientToWorld(e.clientX, e.clientY)
                    applyTrim(cadWallId, cadWallId === w.id ? p : mid)
                    setCadWallId(null)
                  }
                  return
                }
                select({ kind: 'wall', id: w.id })
                setInspectorOpen(true)
                setInspectorTab('ouvrage')
              }}
            />
          )
        })}

        {openings.map((op) => {
          const w = walls.find((ww) => ww.id === op.wallId)
          if (!w) return null
          const dx = w.b.x - w.a.x
          const dy = w.b.y - w.a.y
          const len = Math.hypot(dx, dy)
          if (len < 1e-6) return null
          const ang = (Math.atan2(dy, dx) * 180) / Math.PI
          const cx = w.a.x + op.t * dx
          const cy = w.a.y + op.t * dy
          const isDoor = op.kind === 'door'
          const active = selection?.kind === 'opening' && selection.id === op.id
          return (
            <g
              key={op.id}
              transform={`translate(${cx}, ${cy}) rotate(${ang})`}
              onPointerDown={(e) => {
                e.stopPropagation()
                select({ kind: 'opening', id: op.id })
                setInspectorOpen(true)
                setInspectorTab('ouvrage')
              }}
            >
              <rect
                x={-op.width / 2}
                y={-w.thickness / 2 - 0.02}
                width={op.width}
                height={w.thickness + 0.04}
                fill="#04080c"
                stroke={active ? '#9eefe4' : isDoor ? '#6ed0c3' : '#7eb8c9'}
                strokeWidth={active ? 0.05 : 0.035}
              />
              {isDoor && (
                <path
                  d={`M ${-op.width / 2} 0 A ${op.width} ${op.width} 0 0 1 ${op.width / 2} ${op.width}`}
                  fill="none"
                  stroke="#6ed0c3"
                  strokeWidth={0.03}
                  opacity={0.55}
                />
              )}
              {!isDoor && (
                <line
                  x1={-op.width / 2 + 0.05}
                  y1={0}
                  x2={op.width / 2 - 0.05}
                  y2={0}
                  stroke="#7eb8c9"
                  strokeWidth={0.04}
                  opacity={0.7}
                />
              )}
            </g>
          )
        })}

        {/* Opening place preview */}
        {openingPreview && (
          (() => {
            const w = openingPreview.wall
            const def = OPENING_DEFAULTS[tool === 'door' ? 'door' : 'window']
            const dx = w.b.x - w.a.x
            const dy = w.b.y - w.a.y
            const ang = (Math.atan2(dy, dx) * 180) / Math.PI
            const cx = w.a.x + openingPreview.t * dx
            const cy = w.a.y + openingPreview.t * dy
            return (
              <g transform={`translate(${cx}, ${cy}) rotate(${ang})`} opacity={0.7}>
                <rect
                  x={-def.width / 2}
                  y={-w.thickness / 2 - 0.03}
                  width={def.width}
                  height={w.thickness + 0.06}
                  fill="none"
                  stroke="#6ed0c3"
                  strokeWidth={0.05}
                  strokeDasharray="0.1 0.08"
                />
              </g>
            )
          })()
        )}

        {/* Draft previews */}
        {draft && hover && (tool === 'rect' || ((tool === 'slab' || tool === 'roof') && polyDrawMode === 'rect')) && (
          <rect
            x={Math.min(draft.x, hover.x)}
            y={Math.min(draft.y, hover.y)}
            width={Math.abs(hover.x - draft.x)}
            height={Math.abs(hover.y - draft.y)}
            fill="rgba(110,208,195,0.12)"
            stroke="#6ed0c3"
            strokeWidth={0.04}
            strokeDasharray="0.12 0.08"
          />
        )}
        {draft && hover && tool === 'wall' && (
          <line
            x1={draft.x}
            y1={draft.y}
            x2={hover.x}
            y2={hover.y}
            stroke="#6ed0c3"
            strokeWidth={0.06}
            opacity={0.45}
          />
        )}
        {/* Polygon / stair path preview */}
        {polyDraft.length > 0 && (tool === 'slab' || tool === 'roof' || tool === 'stair') && (
          <g>
            {polyDraft.length >= 2 && (
              <polyline
                points={polyDraft.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                fill="none"
                stroke="#6ed0c3"
                strokeWidth={tool === 'stair' ? 0.08 : 0.05}
                opacity={0.7}
              />
            )}
            {hover && (
              <line
                x1={polyDraft[polyDraft.length - 1]!.x}
                y1={polyDraft[polyDraft.length - 1]!.y}
                x2={hover.x}
                y2={hover.y}
                stroke="#6ed0c3"
                strokeWidth={0.05}
                strokeDasharray="0.1 0.08"
                opacity={0.55}
              />
            )}
            {(tool === 'slab' || tool === 'roof') && polyDraft.length >= 2 && hover && (
              <polygon
                points={[...polyDraft, hover].map((pt) => `${pt.x},${pt.y}`).join(' ')}
                fill="rgba(110,208,195,0.12)"
                stroke="#6ed0c3"
                strokeWidth={0.04}
                strokeDasharray="0.12 0.08"
              />
            )}
            {polyDraft.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={0.12} fill="#6ed0c3" />
            ))}
          </g>
        )}

        {draft && <circle cx={draft.x} cy={draft.y} r={0.15} fill="#6ed0c3" />}
        {tool === 'column' && hover && (
          <rect
            x={hover.x - 0.2}
            y={hover.y - 0.2}
            width={0.4}
            height={0.4}
            fill="rgba(154,163,168,0.4)"
            stroke="#6ed0c3"
            strokeWidth={0.04}
            strokeDasharray="0.08 0.06"
          />
        )}

        <g
          transform={`translate(${bounds.maxX - 2}, ${bounds.minY + 2}) rotate(${-project.meta.north})`}
        >
          <line x1={0} y1={0.8} x2={0} y2={-0.8} stroke="#6ed0c3" strokeWidth={0.06} />
          <text x={0} y={-1} textAnchor="middle" fill="#6ed0c3" fontSize={0.5} fontFamily="IBM Plex Mono">
            N
          </text>
        </g>
      </svg>
    </div>
  )
}
