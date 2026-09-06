import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../lib/store/project-store'

const SUBTITLES: Record<string, string> = {
  'villa-calanque': 'Villa mediterraneenne — piscine, terrasse, toiture 2 pentes',
  'tour-horizon': 'Immeuble 8 niveaux — facade vitrée, lobby, noyau',
  'atelier-voltaire': 'Atelier urbain — volume ouvert, lumiere nord',
  'maison-patio': 'Maison autour d un patio — plan carre',
  'pavillon-lac': 'Pavillon lacustre — compact, vue panorama',
}

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
      <header className="px-5 pt-8 pb-5">
        <p className="font-mono text-[11px] tracking-[0.22em] text-[#6ed0c3] uppercase">FORMA</p>
        <h1 className="font-display text-4xl mt-2 tracking-tight">Projets</h1>
        <p className="text-[#7a8f9c] mt-2 text-sm max-w-md leading-relaxed">
          Studio BIM mobile — massing, plan, 3D. Sans compte.
        </p>
      </header>

      <div className="px-5 mb-6">
        <button
          type="button"
          className="btn-accent w-full text-base"
          onClick={() => {
            const id = newSketch()
            open(id)
          }}
        >
          Nouvelle esquisse
        </button>
      </div>

      <section className="px-5 pb-12">
        <div className="grid gap-4">
          {list.map((p) => {
            const sub = SUBTITLES[p.id] ?? `${p.meta.city} · ${p.stories.length} niveau${p.stories.length > 1 ? 'x' : ''}`
            return (
              <article
                key={p.id}
                className="panel project-card p-5 active:scale-[0.995] transition-transform cursor-pointer"
                onClick={() => open(p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && open(p.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-2xl tracking-tight truncate">{p.meta.name}</h3>
                    <p className="text-sm text-[#8aa0ac] mt-1.5 leading-snug">{sub}</p>
                    <p className="font-mono text-[11px] text-[#5a7080] mt-2">
                      {p.meta.city} · {p.walls.length} murs · {p.openings.length} ouvertures
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-[#6ed0c3]/90 border border-[#1a2a35] rounded-full px-2.5 py-1 uppercase tracking-wide">
                    {p.meta.typology}
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="btn-accent flex-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      open(p.id)
                    }}
                  >
                    Ouvrir
                  </button>
                  <button
                    type="button"
                    className="chip"
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
            )
          })}
        </div>
      </section>
    </div>
  )
}
