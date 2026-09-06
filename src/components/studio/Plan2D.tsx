import { useMemo, useRef, useState, useCallback } from 'react'
import type { Project, Vec2 } from '../../lib/bim/types'
import { useProjectStore } from '../../lib/store/project-store'
import { FURNITURE_PRESETS } from '../../lib/bim/catalog'

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

  const [draft, setDraft] = useState<Vec2 | null>(null)
  /** For trim/extend: first selected wall id awaiting second click */
  const [cadWallId, setCadWallId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const story = project.stories.find((s) => s.id === storyId) ?? project.stories[0]
  const walls = project.walls.filter((w) => w.storyId === story?.id)
  const rooms = project.rooms.filter((r) => r.storyId === story?.id)
  const furniture = project.furniture.filter((f) => f.storyId === story?.id)

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
    const pad = 4
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad }
  }, [walls, furniture])

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
      if (ortho && draft) {
        const dx = Math.abs(x - draft.x)
        const dy = Math.abs(y - draft.y)
        if (dx > dy) y = draft.y
        else x = draft.x
      }
      return { x: Math.round(x * 20) / 20, y: Math.round(y * 20) / 20 }
    },
    [draft, ortho],
  )

  const hitWall = (p: Vec2, maxDist = 0.55): string | null => {
    let best: { id: string; d: number } | null = null
    for (const w of walls) {
      const abx = w.b.x - w.a.x
      const aby = w.b.y - w.a.y
      const len2 = abx * abx + aby * aby
      if (len2 < 1e-10) continue
      let t = ((p.x - w.a.x) * abx + (p.y - w.a.y) * aby) / len2
      t = Math.max(0, Math.min(1, t))
      const qx = w.a.x + t * abx
      const qy = w.a.y + t * aby
      const d = Math.hypot(p.x - qx, p.y - qy)
      if (d <= maxDist && (!best || d < best.d)) best = { id: w.id, d }
    }
    return best?.id ?? null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!story) return
    const p = clientToWorld(e.clientX, e.clientY)

    if (tool === 'objects' && placeKind) {
      addFurnitureAt(p)
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
      // select furniture or clear
      const furn = furniture.find(
        (f) => Math.hypot(f.position.x - p.x, f.position.y - p.y) < Math.max(0.4, f.width * 0.35),
      )
      if (furn) {
        select({ kind: 'furniture', id: furn.id })
        setInspectorOpen(true)
        setInspectorTab('ouvrage')
        return
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

  return (
    <div className="absolute inset-0 bg-[#04080c]">
      <div className="absolute top-20 left-3 z-10 flex gap-2 flex-wrap">
        <button type="button" className="chip" data-active={ortho} onClick={() => setOrtho(!ortho)}>
          Ortho {ortho ? 'ON' : 'OFF'}
        </button>
        {draft && (
          <button type="button" className="chip" onClick={() => setDraft(null)}>
            Annuler point
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
                    // if clicking same wall again, use click point
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

        {draft && <circle cx={draft.x} cy={draft.y} r={0.15} fill="#6ed0c3" />}

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
