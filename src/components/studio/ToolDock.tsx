import { useEffect, useMemo, useState } from 'react'
import { useProjectStore } from '../../lib/store/project-store'
import type { ToolMode, SkillLevel, StairMode, RoofMode } from '../../lib/bim/types'
import { labelForStairMode } from '../../lib/cad/stairs'
import { labelForRoofMode } from '../../lib/cad/roofs'
import { FURNITURE_FAMILIES, FURNITURE_PRESETS } from '../../lib/bim/catalog'

type DockFamily = 'editer' | 'esquisse' | 'tracer' | 'ouvrage' | 'objets' | 'studio'

type ToolDef = { id: ToolMode; label: string; family: DockFamily; amateur?: boolean }

const ALL_TOOLS: ToolDef[] = [
  { id: 'select', label: 'Selection', family: 'editer', amateur: true },
  { id: 'trim', label: 'Couper', family: 'editer' },
  { id: 'extend', label: 'Prolonger', family: 'editer' },
  { id: 'wall', label: 'Mur', family: 'tracer', amateur: true },
  { id: 'rect', label: 'Rectangle', family: 'tracer' },
  { id: 'door', label: 'Porte', family: 'ouvrage', amateur: true },
  { id: 'window', label: 'Fenetre', family: 'ouvrage', amateur: true },
  { id: 'slab', label: 'Dalle', family: 'ouvrage' },
  { id: 'column', label: 'Pilier', family: 'ouvrage' },
  { id: 'stair', label: 'Escalier', family: 'ouvrage' },
  { id: 'railing', label: 'Garde-corps', family: 'ouvrage' },
  { id: 'roof', label: 'Toiture', family: 'ouvrage' },
  { id: 'objects', label: 'Objets', family: 'objets', amateur: true },
]

const FAMILIES: { id: DockFamily; label: string; amateur?: boolean }[] = [
  { id: 'editer', label: 'Editer', amateur: true },
  { id: 'esquisse', label: 'Esquisse', amateur: true },
  { id: 'tracer', label: 'Tracer', amateur: true },
  { id: 'ouvrage', label: 'Ouvrage', amateur: true },
  { id: 'objets', label: 'Objets', amateur: true },
  { id: 'studio', label: 'Studio' },
]

function toolsForSkill(skill: SkillLevel): ToolDef[] {
  if (skill === 'pro') return ALL_TOOLS
  return ALL_TOOLS.filter((t) => t.amateur)
}

const HINTS: Partial<Record<ToolMode, string>> = {
  wall: 'Mur : deux clics (plan ou 3D) — apercu elastique',
  door: 'Porte : cliquez un mur',
  window: 'Fenetre : cliquez un mur',
  slab: 'Dalle : polygone ou rectangle',
  column: 'Pilier : cliquez pour placer',
  stair: 'Escalier : parcours selon le mode',
  railing: 'Garde-corps : polyligne',
  roof: 'Toiture : terrasse / 2 pentes / croupe',
  trim: 'Couper : mur puis point',
  extend: 'Prolonger : mur puis cible',
}

function familyForTool(tool: ToolMode): DockFamily {
  return ALL_TOOLS.find((t) => t.id === tool)?.family ?? 'editer'
}

export default function ToolDock() {
  const tool = useProjectStore((s) => s.tool)
  const setTool = useProjectStore((s) => s.setTool)
  const skill = useProjectStore((s) => s.skill)
  const inspectorOpen = useProjectStore((s) => s.inspectorOpen)
  const viewMode = useProjectStore((s) => s.viewMode)
  const placeKind = useProjectStore((s) => s.placeKind)
  const setPlaceKind = useProjectStore((s) => s.setPlaceKind)
  const placeRotation = useProjectStore((s) => s.placeRotation)
  const rotatePlace = useProjectStore((s) => s.rotatePlace)
  const cadNote = useProjectStore((s) => s.cadNote)
  const clearCadNote = useProjectStore((s) => s.clearCadNote)
  const stairMode = useProjectStore((s) => s.stairMode)
  const setStairMode = useProjectStore((s) => s.setStairMode)
  const roofMode = useProjectStore((s) => s.roofMode)
  const setRoofMode = useProjectStore((s) => s.setRoofMode)
  const polyDrawMode = useProjectStore((s) => s.polyDrawMode)
  const setPolyDrawMode = useProjectStore((s) => s.setPolyDrawMode)
  const setWorkspace = useProjectStore((s) => s.setWorkspace)
  const setRadialOpen = useProjectStore((s) => s.setRadialOpen)
  const radialOpen = useProjectStore((s) => s.radialOpen)
  const setSkill = useProjectStore((s) => s.setSkill)
  const openStudioPanel = useProjectStore((s) => s.openStudioPanel)

  const [family, setFamily] = useState<DockFamily>(() => familyForTool(tool))

  useEffect(() => {
    if (!cadNote) return
    const t = window.setTimeout(() => clearCadNote(), 2800)
    return () => window.clearTimeout(t)
  }, [cadNote, clearCadNote])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        if (tool === 'objects' && placeKind) {
          e.preventDefault()
          rotatePlace()
        }
      }
      if (e.key === 'Escape') {
        if (placeKind) setPlaceKind(null)
        else if (tool !== 'select') setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, placeKind, rotatePlace, setPlaceKind, setTool])

  useEffect(() => {
    if (skill === 'simple') {
      const allowed = new Set(toolsForSkill('simple').map((t) => t.id))
      if (!allowed.has(tool)) setTool('select')
    }
  }, [skill, tool, setTool])

  useEffect(() => {
    if (tool === 'objects') setFamily('objets')
    else setFamily(familyForTool(tool))
  }, [tool])

  const shownFamilies = useMemo(
    () => (skill === 'pro' ? FAMILIES : FAMILIES.filter((f) => f.amateur || f.id === 'studio')),
    [skill],
  )

  const tools = useMemo(() => {
    const all = toolsForSkill(skill)
    if (family === 'studio' || family === 'esquisse') return []
    return all.filter((t) => t.family === family)
  }, [skill, family])

  if (inspectorOpen) return null
  if (viewMode === 'visite') return null

  const hint = HINTS[tool]
  const showHint = !!hint && tool !== 'objects' && tool !== 'select'

  const pickFamily = (id: DockFamily) => {
    setFamily(id)
    if (id === 'studio') {
      if (skill !== 'pro') setSkill('pro')
      setRadialOpen(!radialOpen)
      return
    }
    setRadialOpen(false)
    if (id === 'esquisse') {
      setWorkspace('esquisse')
      setTool('wall')
      return
    }
    if (id === 'objets') {
      setTool('objects')
      return
    }
    if (id === 'editer') setTool('select')
    if (id === 'tracer') setTool('wall')
    if (id === 'ouvrage') setTool(skill === 'pro' ? 'door' : 'door')
  }

  return (
    <div className="absolute bottom-4 left-0 right-0 z-20 flex flex-col items-center gap-2 safe-bottom safe-x pointer-events-none">
      {cadNote && (
        <div className="pointer-events-auto chip text-xs max-w-[88vw] truncate">{cadNote}</div>
      )}

      {showHint && (
        <div className="pointer-events-auto px-3 py-1.5 rounded-full bg-[#0a1218]/80 border border-[#1a2a35]/80 text-[11px] text-[#9aafba] max-w-[88vw]">
          {hint}
        </div>
      )}

      {family === 'esquisse' && (
        <div className="pointer-events-auto px-3 py-2 rounded-2xl bg-[#0a1218]/94 border border-[#1a2a35] text-xs text-[#9aafba] max-w-[92vw]">
          Esquisse — trace rapide (murs). Workspace Esquisse active. Massez ensuite via Studio / Copilote.
          <div className="flex gap-1 mt-2">
            <button type="button" className="chip" data-active={tool === 'wall'} onClick={() => setTool('wall')}>
              Mur
            </button>
            <button type="button" className="chip" onClick={() => openStudioPanel('copilote')}>
              Copilote
            </button>
          </div>
        </div>
      )}

      {tool === 'stair' && (
        <div className="pointer-events-auto flex gap-1 p-1 rounded-2xl bg-[#0a1218]/92 border border-[#1a2a35]">
          {(['droit', 'quart', 'demi'] as StairMode[]).map((m) => (
            <button key={m} type="button" className="chip" data-active={stairMode === m} onClick={() => setStairMode(m)}>
              {labelForStairMode(m)}
            </button>
          ))}
        </div>
      )}

      {tool === 'roof' && (
        <div className="pointer-events-auto flex gap-1 p-1 rounded-2xl bg-[#0a1218]/92 border border-[#1a2a35]">
          {(['terrasse', '2pentes', 'croupe'] as RoofMode[]).map((m) => (
            <button key={m} type="button" className="chip" data-active={roofMode === m} onClick={() => setRoofMode(m)}>
              {labelForRoofMode(m)}
            </button>
          ))}
        </div>
      )}

      {(tool === 'slab' || tool === 'roof') && (
        <div className="pointer-events-auto flex gap-1 p-1 rounded-2xl bg-[#0a1218]/92 border border-[#1a2a35]">
          <button type="button" className="chip" data-active={polyDrawMode === 'polygon'} onClick={() => setPolyDrawMode('polygon')}>
            Polygone
          </button>
          <button type="button" className="chip" data-active={polyDrawMode === 'rect'} onClick={() => setPolyDrawMode('rect')}>
            Rectangle
          </button>
        </div>
      )}

      {(tool === 'objects' || family === 'objets') && (
        <div className="pointer-events-auto w-[min(94vw,26rem)] max-h-[32dvh] overflow-y-auto rounded-2xl bg-[#0a1218]/94 border border-[#1a2a35] backdrop-blur-md p-3">
          <div className="flex items-center justify-between mb-2 gap-2">
            <p className="text-xs text-[#7a8f9c] uppercase tracking-wide">Bibliotheque</p>
            <div className="flex gap-1">
              <button type="button" className="chip" onClick={() => rotatePlace()} disabled={!placeKind}>
                Rot 90
              </button>
              {placeKind && (
                <button type="button" className="chip" onClick={() => setPlaceKind(null)}>
                  Annuler
                </button>
              )}
            </div>
          </div>
          {FURNITURE_FAMILIES.map((fam) => (
            <div key={fam.id} className="mb-2.5">
              <p className="text-[11px] text-[#6ed0c3] mb-1 font-mono">{fam.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {fam.kinds.map((kind) => {
                  const preset = FURNITURE_PRESETS[kind]
                  return (
                    <button
                      key={kind}
                      type="button"
                      className="chip"
                      data-active={placeKind === kind}
                      onClick={() => {
                        setTool('objects')
                        setPlaceKind(kind)
                      }}
                    >
                      {preset?.label ?? kind}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {placeKind && (
            <p className="text-[11px] text-[#7a8f9c]">
              Touchez le plan ou le sol 3D. R = rotation (
              {Math.round(((placeRotation % (Math.PI * 2)) * 180) / Math.PI)}°).
            </p>
          )}
        </div>
      )}

      {tools.length > 0 && family !== 'objets' && (
        <div className="pointer-events-auto flex gap-1.5 p-2 rounded-2xl bg-[#0a1218]/92 border border-[#1a2a35] backdrop-blur-md overflow-x-auto max-w-[96vw]">
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip shrink-0 min-w-[3.25rem]"
              data-active={tool === t.id}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="pointer-events-auto flex gap-1 p-1.5 rounded-2xl bg-[#0a1218]/95 border border-[#1a2a35] backdrop-blur-md overflow-x-auto max-w-[96vw] shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
        {shownFamilies.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip shrink-0 text-[12px] px-3 min-h-[44px]"
            data-active={family === f.id || (f.id === 'studio' && radialOpen)}
            onClick={() => pickFamily(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}
