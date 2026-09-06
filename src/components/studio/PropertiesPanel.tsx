import { useProjectStore } from '../../lib/store/project-store'
import { FURNITURE_PRESETS } from '../../lib/bim/catalog'

function roundStep(v: number, step: number) {
  return Math.round(v / step) * step
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
}) {
  const display = roundStep(value, step)
  return (
    <div className="slider-row">
      <label>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={display}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="val">
        {display}
        {unit ?? ''}
      </span>
    </div>
  )
}

export default function PropertiesPanel() {
  const tab = useProjectStore((s) => s.inspectorTab)
  const project = useProjectStore((s) => (s.activeId ? s.projects[s.activeId] : null))
  const selection = useProjectStore((s) => s.selection)
  const patchNow = useProjectStore((s) => s.patchNow)
  const commit = useProjectStore((s) => s.commit)
  const generateMassingAction = useProjectStore((s) => s.generateMassingAction)
  const massingDraft = useProjectStore((s) => s.massingDraft)
  const setMassingDraft = useProjectStore((s) => s.setMassingDraft)
  const viewMode = useProjectStore((s) => s.viewMode)
  const setView = useProjectStore((s) => s.setView)
  const skill = useProjectStore((s) => s.skill)
  const setInspectorOpen = useProjectStore((s) => s.setInspectorOpen)

  if (!project) return null

  if (tab === 'ouvrage') {
    const wall =
      selection?.kind === 'wall' ? project.walls.find((w) => w.id === selection.id) : null
    const furn =
      selection?.kind === 'furniture'
        ? project.furniture.find((f) => f.id === selection.id)
        : null

    return (
      <div>
        <h3 className="font-display text-base mb-3">Ouvrage</h3>
        {wall ? (
          <>
            <p className="text-xs text-[#7a8f9c] mb-2 font-mono">{wall.id}</p>
            <SliderRow
              label="Epaisseur"
              value={wall.thickness}
              min={0.1}
              max={0.6}
              step={0.01}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  walls: p.walls.map((w) => (w.id === wall.id ? { ...w, thickness: v } : w)),
                }))
              }
            />
            <SliderRow
              label="Hauteur"
              value={wall.height}
              min={2}
              max={6}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  walls: p.walls.map((w) => (w.id === wall.id ? { ...w, height: v } : w)),
                }))
              }
            />
            <p className="text-sm text-[#7a8f9c]">Typologie : {wall.typology}</p>
          </>
        ) : furn ? (
          <>
            <p className="text-xs text-[#7a8f9c] mb-1 font-mono">{furn.id}</p>
            <p className="text-sm mb-2">
              {FURNITURE_PRESETS[furn.kind]?.label ?? furn.kind}
            </p>
            <SliderRow
              label="Pos. X"
              value={furn.position.x}
              min={-40}
              max={40}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  furniture: p.furniture.map((f) =>
                    f.id === furn.id ? { ...f, position: { ...f.position, x: v } } : f,
                  ),
                }))
              }
            />
            <SliderRow
              label="Pos. Y"
              value={furn.position.y}
              min={-40}
              max={40}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  furniture: p.furniture.map((f) =>
                    f.id === furn.id ? { ...f, position: { ...f.position, y: v } } : f,
                  ),
                }))
              }
            />
            <SliderRow
              label="Rotation"
              value={((furn.rotation % (Math.PI * 2)) * 180) / Math.PI}
              min={0}
              max={360}
              step={5}
              unit=" deg"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  furniture: p.furniture.map((f) =>
                    f.id === furn.id ? { ...f, rotation: (v * Math.PI) / 180 } : f,
                  ),
                }))
              }
            />
            <button
              type="button"
              className="chip mt-2"
              onClick={() =>
                patchNow((p) => ({
                  ...p,
                  furniture: p.furniture.map((f) =>
                    f.id === furn.id
                      ? { ...f, rotation: (f.rotation + Math.PI / 2) % (Math.PI * 2) }
                      : f,
                  ),
                }))
              }
            >
              Rot 90
            </button>
            <button
              type="button"
              className="chip mt-2 ml-1"
              onClick={() =>
                commit((p) => ({
                  ...p,
                  furniture: p.furniture.filter((f) => f.id !== furn.id),
                }))
              }
            >
              Supprimer
            </button>
          </>
        ) : (
          <p className="text-sm text-[#7a8f9c]">
            Selectionnez un mur ou un objet en plan, ou reglages globaux dans Etages / Site.
          </p>
        )}
        <div className="mt-4">
          <p className="text-xs text-[#7a8f9c] uppercase tracking-wide mb-1">Projet</p>
          <p className="font-display text-lg">{project.meta.name}</p>
          <p className="text-sm text-[#7a8f9c]">
            {project.walls.length} murs · {project.stories.length} niveaux · {project.furniture.length}{' '}
            objets
          </p>
        </div>
      </div>
    )
  }

  if (tab === 'etages') {
    return (
      <div>
        <h3 className="font-display text-base mb-3">Etages / Massing</h3>
        <ul className="mb-4 space-y-1 max-h-28 overflow-y-auto">
          {project.stories.map((s) => (
            <li key={s.id} className="font-mono text-xs text-[#a8bdc8] flex justify-between">
              <span>{s.name}</span>
              <span>
                +{s.elevation.toFixed(1)} m / HSP {s.height.toFixed(2)} m
              </span>
            </li>
          ))}
        </ul>
        <SliderRow
          label="Largeur"
          value={massingDraft.width}
          min={6}
          max={60}
          step={0.5}
          unit=" m"
          onChange={(v) => setMassingDraft({ width: v })}
        />
        <SliderRow
          label="Profondeur"
          value={massingDraft.depth}
          min={6}
          max={60}
          step={0.5}
          unit=" m"
          onChange={(v) => setMassingDraft({ depth: v })}
        />
        <SliderRow
          label="Etages"
          value={massingDraft.floors}
          min={1}
          max={80}
          step={1}
          onChange={(v) => setMassingDraft({ floors: v })}
        />
        <SliderRow
          label="HSP"
          value={massingDraft.floorHeight}
          min={2.5}
          max={4.5}
          step={0.05}
          unit=" m"
          onChange={(v) => setMassingDraft({ floorHeight: v })}
        />
        <button type="button" className="btn-accent w-full mt-2" onClick={() => generateMassingAction()}>
          Generer massing
        </button>
        <p className="text-[11px] text-[#7a8f9c] mt-2">
          Remplace la geometrie courante (confirmation demandee). Max 80 niveaux.
        </p>
      </div>
    )
  }

  if (tab === 'site') {
    return (
      <div>
        <h3 className="font-display text-base mb-3">Site</h3>
        <SliderRow
          label="Nord"
          value={project.meta.north}
          min={0}
          max={360}
          step={1}
          unit=" deg"
          onChange={(v) =>
            patchNow((p) => ({ ...p, meta: { ...p.meta, north: v } }))
          }
        />
        <SliderRow
          label="Latitude"
          value={project.meta.latitude}
          min={-60}
          max={70}
          step={0.1}
          unit=" deg"
          onChange={(v) =>
            patchNow((p) => ({ ...p, meta: { ...p.meta, latitude: v } }))
          }
        />
        <SliderRow
          label="Heure solaire"
          value={project.meta.lightHour}
          min={6}
          max={20}
          step={0.25}
          unit=" h"
          onChange={(v) =>
            patchNow((p) => ({ ...p, meta: { ...p.meta, lightHour: v } }))
          }
        />
        <p className="text-sm text-[#7a8f9c] mt-2">
          {project.meta.city} · parcelle {project.meta.parcelWidth} x {project.meta.parcelDepth} m
        </p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="font-display text-base mb-3">Vue</h3>
      <div className="flex flex-wrap gap-2 mb-4">
        <button type="button" className="chip" data-active={viewMode === '3d'} onClick={() => setView('3d')}>
          3D
        </button>
        <button type="button" className="chip" data-active={viewMode === 'plan'} onClick={() => setView('plan')}>
          Plan
        </button>
        <button
          type="button"
          className="chip"
          data-active={viewMode === 'visite'}
          onClick={() => {
            setInspectorOpen(false)
            setView('visite')
          }}
        >
          Visite
        </button>
        {skill === 'pro' && (
          <>
            <button type="button" className="chip" data-active={viewMode === 'coupe'} onClick={() => setView('coupe')}>
              Coupe
            </button>
            <button type="button" className="chip" data-active={viewMode === 'ar'} onClick={() => setView('ar')}>
              AR
            </button>
          </>
        )}
      </div>
      {viewMode === 'visite' && (
        <p className="text-sm text-[#7a8f9c] mb-2">
          Marche a hauteur d oeil (~1,6 m) sur l etage actif. Collision simple contre les murs.
        </p>
      )}
      {(viewMode === 'coupe' || viewMode === 'ar') && (
        <p className="text-sm text-[#7a8f9c]">Vue {viewMode.toUpperCase()} — stub Expert (a venir).</p>
      )}
      <p className="text-xs text-[#7a8f9c]">
        Orbit maquette : glisser pour tourner le batiment avec le doigt. Pincer pour zoomer.
      </p>
    </div>
  )
}
