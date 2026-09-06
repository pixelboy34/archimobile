import { useRef, useCallback, type ReactNode } from 'react'
import { useProjectStore } from '../../lib/store/project-store'
import StudioPanels from './StudioPanels'

type Props = { children: ReactNode }

const PANEL_TITLES: Record<string, string> = {
  materiaux: 'Materiaux',
  bibliotheque: 'Bibliotheque',
  structure: 'Structure',
  copilote: 'Copilote',
  '4d': '4D',
  calques: 'Calques',
  guide: 'Guide',
}

export default function InspectorDock({ children }: Props) {
  const open = useProjectStore((s) => s.inspectorOpen)
  const height = useProjectStore((s) => s.dockHeight)
  const setDockHeight = useProjectStore((s) => s.setDockHeight)
  const tab = useProjectStore((s) => s.inspectorTab)
  const setTab = useProjectStore((s) => s.setInspectorTab)
  const studioPanel = useProjectStore((s) => s.studioPanel)
  const setStudioPanel = useProjectStore((s) => s.setStudioPanel)
  const setInspectorOpen = useProjectStore((s) => s.setInspectorOpen)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(46)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true
      startY.current = e.clientY
      startH.current = height
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [height],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      const dy = startY.current - e.clientY
      const vh = window.innerHeight || 800
      const next = startH.current + (dy / vh) * 100
      setDockHeight(next)
    },
    [setDockHeight],
  )

  const onPointerUp = () => {
    dragging.current = false
  }

  if (!open) return null

  const tabs = [
    { id: 'ouvrage' as const, label: 'Ouvrage' },
    { id: 'etages' as const, label: 'Etages' },
    { id: 'site' as const, label: 'Site' },
    { id: 'vue' as const, label: 'Vue' },
  ]

  const studioMode = !!studioPanel

  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-30 safe-bottom safe-x flex flex-col"
      style={{ height: `${studioMode ? Math.min(46, height) : height}dvh` }}
    >
      <div
        className="h-5 flex items-center justify-center cursor-ns-resize shrink-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="w-10 h-1 rounded-full bg-[#2a3c48]" />
      </div>
      <div className="flex-1 mx-2 mb-2 panel overflow-hidden flex flex-col bg-[#0a1218]/90 backdrop-blur-md">
        {studioMode ? (
          <div className="flex items-center gap-2 p-2 border-b border-[#1a2a35]">
            <p className="font-display text-sm flex-1 truncate text-[#6ed0c3]">
              {PANEL_TITLES[studioPanel!] ?? 'Studio'}
            </p>
            <button
              type="button"
              className="chip min-h-[40px] min-w-0 px-3 text-xs"
              onClick={() => setStudioPanel(null)}
            >
              Params
            </button>
            <button
              type="button"
              className="chip min-h-[40px] min-w-0 px-3 text-xs"
              onClick={() => setInspectorOpen(false)}
            >
              Fermer
            </button>
          </div>
        ) : (
          <div className="flex gap-1 p-2 border-b border-[#1a2a35] overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip shrink-0"
                data-active={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-3">
          {studioMode ? <StudioPanels /> : children}
        </div>
      </div>
    </div>
  )
}
