import { useProjectStore } from '../../lib/store/project-store'

function roundStep(v: number, step: number) {
  return Math.round(v / step) * step
}

export default function ViewBar() {
  const project = useProjectStore((s) => (s.activeId ? s.projects[s.activeId] : null))
  const activeStoryId = useProjectStore((s) => s.activeStoryId)
  const setActiveStory = useProjectStore((s) => s.setActiveStory)
  const viewMode = useProjectStore((s) => s.viewMode)
  const coupeAxis = useProjectStore((s) => s.coupeAxis)
  const coupeCut = useProjectStore((s) => s.coupeCut)
  const setCoupeAxis = useProjectStore((s) => s.setCoupeAxis)
  const setCoupeCut = useProjectStore((s) => s.setCoupeCut)
  const syncCoupeToStory = useProjectStore((s) => s.syncCoupeToStory)

  if (!project) return null

  const idx = Math.max(
    0,
    project.stories.findIndex((s) => s.id === activeStoryId),
  )
  const story = project.stories[idx] ?? project.stories[0]
  const compact = project.stories.length > 5
  const showStories = project.stories.length > 1
  const coupe = viewMode === 'coupe'

  const go = (dir: -1 | 1) => {
    const next = Math.min(project.stories.length - 1, Math.max(0, idx + dir))
    setActiveStory(project.stories[next].id)
  }

  const maxElev =
    project.stories.reduce((m, s) => Math.max(m, s.elevation + s.height), 4) + 1
  const cutMin = coupeAxis === 'horizontal' ? -1 : -40
  const cutMax = coupeAxis === 'horizontal' ? maxElev : 40
  const cutStep = coupeAxis === 'horizontal' ? 0.05 : 0.1
  const cutDisplay = roundStep(coupeCut, cutStep)

  return (
    <div className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 max-w-[96vw]">
      {showStories && (
        <div className="flex items-center gap-2">
          <button type="button" className="chip px-3" onClick={() => go(-1)} disabled={idx === 0}>
            ‹
          </button>
          <div className="chip font-mono text-xs min-w-[7rem] justify-center flex items-center">
            {compact ? `${story?.name ?? ''} · ${idx + 1}/${project.stories.length}` : story?.name}
          </div>
          <button
            type="button"
            className="chip px-3"
            onClick={() => go(1)}
            disabled={idx >= project.stories.length - 1}
          >
            ›
          </button>
        </div>
      )}

      {coupe && (
        <div className="pointer-events-auto flex flex-col gap-2 w-[min(92vw,22rem)] rounded-2xl bg-[#0a1218]/92 border border-[#1a2a35] backdrop-blur-md px-3 py-2">
          <div className="flex gap-1">
            <button
              type="button"
              className="chip flex-1"
              data-active={coupeAxis === 'horizontal'}
              onClick={() => {
                setCoupeAxis('horizontal')
                syncCoupeToStory()
              }}
            >
              Horizontale
            </button>
            <button
              type="button"
              className="chip flex-1"
              data-active={coupeAxis === 'vertical'}
              onClick={() => {
                setCoupeAxis('vertical')
                setCoupeCut(0)
              }}
            >
              Verticale
            </button>
          </div>
          <div className="slider-row mb-0">
            <label>{coupeAxis === 'horizontal' ? 'Hauteur de coupe' : 'Position X'}</label>
            <input
              type="range"
              min={cutMin}
              max={cutMax}
              step={cutStep}
              value={cutDisplay}
              onChange={(e) => setCoupeCut(Number(e.target.value))}
            />
            <span className="val">
              {cutDisplay.toFixed(2)} m
            </span>
          </div>
          <p className="text-[10px] text-[#7a8f9c]">
            Geometrie au-dela du plan masquee. Inspecteur reste actif.
          </p>
        </div>
      )}
    </div>
  )
}
