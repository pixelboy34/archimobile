import { useEffect } from 'react'
import { useProjectStore } from '../../lib/store/project-store'
import type { ToolMode, SkillLevel, StairMode, RoofMode } from '../../lib/bim/types'
import { labelForStairMode } from '../../lib/cad/stairs'
import { labelForRoofMode } from '../../lib/cad/roofs'
import { FURNITURE_FAMILIES, FURNITURE_PRESETS } from '../../lib/bim/catalog'

type ToolDef = { id: ToolMode; label: string; group: 'trace' | 'ouvrage' | 'cad'; amateur?: boolean }

const ALL_TOOLS: ToolDef[] = [
  { id: 'select', label: 'Selection', group: 'trace', amateur: true },
  { id: 'wall', label: 'Mur', group: 'trace', amateur: true },
  { id: 'rect', label: 'Rectangle', group: 'trace', amateur: true },
  { id: 'door', label: 'Porte', group: 'ouvrage', amateur: true },
  { id: 'window', label: 'Fenetre', group: 'ouvrage', amateur: true },
  { id: 'slab', label: 'Dalle', group: 'ouvrage' },
  { id: 'column', label: 'Pilier', group: 'ouvrage' },
  { id: 'stair', label: 'Escalier', group: 'ouvrage' },
  { id: 'railing', label: 'Garde-corps', group: 'ouvrage' },
  { id: 'roof', label: 'Toiture', group: 'ouvrage' },
  { id: 'trim', label: 'Couper', group: 'cad' },
  { id: 'extend', label: 'Prolonger', group: 'cad' },
  { id: 'objects', label: 'Objets', group: 'trace', amateur: true },
]

function toolsForSkill(skill: SkillLevel): ToolDef[] {
  if (skill === 'pro') return ALL_TOOLS
  return ALL_TOOLS.filter((t) => t.amateur)
}

const HINTS: Partial<Record<ToolMode, string>> = {
  door: 'Porte : cliquez un mur (plan ou 3D) pour creer une ouverture',
  window: 'Fenetre : cliquez un mur (plan ou 3D) pour creer une ouverture',
  slab: 'Dalle : polygone (clics + Terminer / Entree) ou mode Rectangle ; Maj = rectangle',
  column: 'Pilier : cliquez pour placer un poteau sur l etage actif',
  stair: 'Escalier : choisissez Droit / Quart / Demi puis cliquez le parcours (depart → angles → arrivee) ; garde-corps auto',
  railing: 'Garde-corps : cliquez une polyligne le long d un bord (double-clic ou Terminer)',
  roof: 'Toiture : Terrasse / 2 pentes / Croupe — polygone ou rectangle ; pente dans Ouvrage',
  trim: 'Couper : selectionnez un mur, puis cliquez le point de coupe',
  extend: 'Prolonger : selectionnez un mur, puis cliquez le mur cible',
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

  useEffect(() => {
    if (!cadNote) return
    const t = window.setTimeout(() => clearCadNote(), 3200)
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

  // If skill drops to amateur while on a pro-only tool, fall back
  useEffect(() => {
    if (skill === 'simple') {
      const allowed = new Set(toolsForSkill('simple').map((t) => t.id))
      if (!allowed.has(tool)) setTool('select')
    }
  }, [skill, tool, setTool])

  if (inspectorOpen) return null
  if (viewMode === 'visite') return null

  const shown = toolsForSkill(skill)
  const hint = HINTS[tool]

  return (
    <div className="absolute bottom-4 left-0 right-0 z-20 flex flex-col items-center gap-2 safe-bottom safe-x pointer-events-none">
      {cadNote && (
        <div className="pointer-events-auto chip text-xs max-w-[90vw] truncate bg-[#0a1218]/95 border-[#6ed0c3]/40">
          {cadNote}
        </div>
      )}

      {hint && tool !== 'objects' && (
        <div className="pointer-events-auto chip text-xs bg-[#0a1218]/95 max-w-[92vw]">
          {hint}
        </div>
      )}

      {tool === 'stair' && (
        <div className="pointer-events-auto flex gap-1 p-1 rounded-2xl bg-[#0a1218]/95 border border-[#1a2a35]">
          {(['droit', 'quart', 'demi'] as StairMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              data-active={stairMode === m}
              onClick={() => setStairMode(m)}
            >
              {labelForStairMode(m)}
            </button>
          ))}
        </div>
      )}

      {tool === 'roof' && (
        <div className="pointer-events-auto flex gap-1 p-1 rounded-2xl bg-[#0a1218]/95 border border-[#1a2a35]">
          {(['terrasse', '2pentes', 'croupe'] as RoofMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              data-active={roofMode === m}
              onClick={() => setRoofMode(m)}
            >
              {labelForRoofMode(m)}
            </button>
          ))}
        </div>
      )}

      {(tool === 'slab' || tool === 'roof') && (
        <div className="pointer-events-auto flex gap-1 p-1 rounded-2xl bg-[#0a1218]/95 border border-[#1a2a35]">
          <button
            type="button"
            className="chip"
            data-active={polyDrawMode === 'polygon'}
            onClick={() => setPolyDrawMode('polygon')}
          >
            Polygone
          </button>
          <button
            type="button"
            className="chip"
            data-active={polyDrawMode === 'rect'}
            onClick={() => setPolyDrawMode('rect')}
          >
            Rectangle
          </button>
        </div>
      )}

      {tool === 'objects' && (
        <div className="pointer-events-auto w-[min(96vw,28rem)] max-h-[40dvh] overflow-y-auto rounded-2xl bg-[#0a1218]/95 border border-[#1a2a35] backdrop-blur-md p-3">
          <div className="flex items-center justify-between mb-2 gap-2">
            <p className="text-xs text-[#7a8f9c] uppercase tracking-wide">Bibliotheque</p>
            <div className="flex gap-1">
              <button type="button" className="chip" onClick={() => rotatePlace()} disabled={!placeKind}>
                Rot 90 ({Math.round(((placeRotation % (Math.PI * 2)) * 180) / Math.PI)}°)
              </button>
              {placeKind && (
                <button type="button" className="chip" onClick={() => setPlaceKind(null)}>
                  Annuler
                </button>
              )}
            </div>
          </div>
          {FURNITURE_FAMILIES.map((fam) => (
            <div key={fam.id} className="mb-3">
              <p className="text-[11px] text-[#6ed0c3] mb-1 font-mono">{fam.label}</p>
              <div className="flex flex-wrap gap-1">
                {fam.kinds.map((kind) => {
                  const preset = FURNITURE_PRESETS[kind]
                  return (
                    <button
                      key={kind}
                      type="button"
                      className="chip"
                      data-active={placeKind === kind}
                      onClick={() => setPlaceKind(kind)}
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
              Touchez le plan ou le sol 3D pour placer. R = rotation 90°.
            </p>
          )}
        </div>
      )}

      <div className="pointer-events-auto flex gap-1 p-1.5 rounded-2xl bg-[#0a1218]/90 border border-[#1a2a35] backdrop-blur-md overflow-x-auto max-w-[96vw]">
        {shown.map((t) => (
          <button
            key={t.id}
            type="button"
            className="chip shrink-0"
            data-active={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
