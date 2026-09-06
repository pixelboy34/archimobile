import { useEffect } from 'react'
import { useProjectStore } from '../../lib/store/project-store'
import type { ToolMode } from '../../lib/bim/types'
import { FURNITURE_FAMILIES, FURNITURE_PRESETS } from '../../lib/bim/catalog'

const BASE_TOOLS: { id: ToolMode; label: string }[] = [
  { id: 'select', label: 'Selection' },
  { id: 'wall', label: 'Mur' },
  { id: 'rect', label: 'Rectangle' },
  { id: 'trim', label: 'Couper' },
  { id: 'extend', label: 'Prolonger' },
  { id: 'objects', label: 'Objets' },
]

export default function ToolDock() {
  const tool = useProjectStore((s) => s.tool)
  const setTool = useProjectStore((s) => s.setTool)
  const inspectorOpen = useProjectStore((s) => s.inspectorOpen)
  const viewMode = useProjectStore((s) => s.viewMode)
  const placeKind = useProjectStore((s) => s.placeKind)
  const setPlaceKind = useProjectStore((s) => s.setPlaceKind)
  const placeRotation = useProjectStore((s) => s.placeRotation)
  const rotatePlace = useProjectStore((s) => s.rotatePlace)
  const cadNote = useProjectStore((s) => s.cadNote)
  const clearCadNote = useProjectStore((s) => s.clearCadNote)

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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, placeKind, rotatePlace, setPlaceKind])

  if (inspectorOpen) return null
  if (viewMode === 'visite') return null

  const shown = BASE_TOOLS


  return (
    <div className="absolute bottom-4 left-0 right-0 z-20 flex flex-col items-center gap-2 safe-bottom safe-x pointer-events-none">
      {cadNote && (
        <div className="pointer-events-auto chip text-xs max-w-[90vw] truncate bg-[#0a1218]/95 border-[#6ed0c3]/40">
          {cadNote}
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

      {(tool === 'trim' || tool === 'extend') && (
        <div className="pointer-events-auto chip text-xs bg-[#0a1218]/95">
          {tool === 'trim'
            ? 'Couper : selectionnez un mur, puis cliquez le point de coupe'
            : 'Prolonger : selectionnez un mur, puis cliquez le mur cible'}
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
