import { useProjectStore } from '../../lib/store/project-store'

export default function ViewBar() {
  const project = useProjectStore((s) => (s.activeId ? s.projects[s.activeId] : null))
  const activeStoryId = useProjectStore((s) => s.activeStoryId)
  const setActiveStory = useProjectStore((s) => s.setActiveStory)

  if (!project || project.stories.length <= 1) return null

  const idx = Math.max(
    0,
    project.stories.findIndex((s) => s.id === activeStoryId),
  )
  const story = project.stories[idx]
  const compact = project.stories.length > 5

  const go = (dir: -1 | 1) => {
    const next = Math.min(project.stories.length - 1, Math.max(0, idx + dir))
    setActiveStory(project.stories[next].id)
  }

  return (
    <div className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
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
  )
}
