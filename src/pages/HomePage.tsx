import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../lib/store/project-store'

export default function HomePage() {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const setActive = useProjectStore((s) => s.setActive)
  const newSketch = useProjectStore((s) => s.newSketch)
  const duplicateProject = useProjectStore((s) => s.duplicateProject)

  const list = Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt)

  const open = (id: string) => {
    setActive(id)
    navigate(`/studio/${id}`)
  }

  return (
    <div className="min-h-full overflow-y-auto bg-[#04080c] safe-top safe-bottom safe-x">
      <header className="px-5 pt-6 pb-4">
        <p className="font-mono text-[11px] tracking-[0.2em] text-[#6ed0c3] uppercase">Studio BIM</p>
        <h1 className="font-display text-4xl font-700 mt-1 tracking-tight">FORMA</h1>
        <p className="text-[#7a8f9c] mt-2 text-sm max-w-sm">
          Architecture mobile — massing, plan, 3D PBR. Sans compte.
        </p>
      </header>

      <div className="px-5 mb-4">
        <button
          type="button"
          className="btn-accent w-full"
          onClick={() => {
            const id = newSketch()
            open(id)
          }}
        >
          Nouvelle esquisse
        </button>
      </div>

      <section className="px-5 pb-10">
        <h2 className="font-display text-lg mb-3 text-[#e8f0f4]">Projets</h2>
        <div className="grid gap-3">
          {list.map((p) => (
            <article
              key={p.id}
              className="panel p-4 active:scale-[0.99] transition-transform"
              onClick={() => open(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && open(p.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl">{p.meta.name}</h3>
                  <p className="text-sm text-[#7a8f9c] mt-0.5">
                    {p.meta.city} · {p.stories.length} niveau{p.stories.length > 1 ? 'x' : ''} ·{' '}
                    {p.walls.length} murs
                  </p>
                </div>
                <span className="font-mono text-[10px] text-[#6ed0c3] border border-[#1a2a35] rounded-full px-2 py-1">
                  {p.meta.typology}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="chip text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    open(p.id)
                  }}
                >
                  Ouvrir
                </button>
                <button
                  type="button"
                  className="chip text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    const nid = duplicateProject(p.id)
                    if (nid) open(nid)
                  }}
                >
                  Dupliquer
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
