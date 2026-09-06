import { useProjectStore } from '../../lib/store/project-store'
import type { StudioPanelId, ToolMode } from '../../lib/bim/types'

type RadialItem =
  | { kind: 'panel'; id: StudioPanelId; label: string }
  | { kind: 'tool'; id: ToolMode; label: string }

const ITEMS: RadialItem[] = [
  { kind: 'panel', id: 'materiaux', label: 'Materiaux' },
  { kind: 'panel', id: 'bibliotheque', label: 'Bibliotheque' },
  { kind: 'panel', id: 'structure', label: 'Structure' },
  { kind: 'panel', id: 'copilote', label: 'Copilote' },
  { kind: 'panel', id: '4d', label: '4D' },
  { kind: 'panel', id: 'calques', label: 'Calques' },
  { kind: 'panel', id: 'guide', label: 'Guide' },
  { kind: 'tool', id: 'door', label: 'Porte' },
  { kind: 'tool', id: 'window', label: 'Fenetre' },
  { kind: 'tool', id: 'slab', label: 'Dalle' },
  { kind: 'tool', id: 'column', label: 'Pilier' },
  { kind: 'tool', id: 'stair', label: 'Escalier' },
  { kind: 'tool', id: 'roof', label: 'Toiture' },
]

/** Expert Studio radial — fills InspectorDock / sets tool, never fullscreen. */
export default function StudioRadial() {
  const skill = useProjectStore((s) => s.skill)
  const radialOpen = useProjectStore((s) => s.radialOpen)
  const setRadialOpen = useProjectStore((s) => s.setRadialOpen)
  const openStudioPanel = useProjectStore((s) => s.openStudioPanel)
  const studioPanel = useProjectStore((s) => s.studioPanel)
  const setSkill = useProjectStore((s) => s.setSkill)
  const setTool = useProjectStore((s) => s.setTool)
  const setInspectorOpen = useProjectStore((s) => s.setInspectorOpen)

  const expert = skill === 'pro'

  const toggle = () => {
    if (!expert) {
      setSkill('pro')
      setRadialOpen(true)
      return
    }
    setRadialOpen(!radialOpen)
  }

  const onItem = (item: RadialItem) => {
    if (item.kind === 'panel') {
      openStudioPanel(item.id)
      return
    }
    setTool(item.id)
    setRadialOpen(false)
    setInspectorOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="chip"
        data-active={radialOpen || !!studioPanel}
        onClick={toggle}
        title="Studio — outils Expert"
      >
        Studio
      </button>
      {radialOpen && (
        <div
          className="absolute right-0 top-full mt-2 z-40 w-[min(94vw,320px)] panel p-2 grid grid-cols-2 gap-1.5 shadow-xl max-h-[50dvh] overflow-y-auto"
          role="menu"
        >
          {ITEMS.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              role="menuitem"
              className="chip w-full justify-center text-[12px] min-h-[44px]"
              data-active={item.kind === 'panel' && studioPanel === item.id}
              onClick={() => onItem(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
