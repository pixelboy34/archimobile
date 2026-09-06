import { useProjectStore } from '../../lib/store/project-store'
import { FURNITURE_PRESETS } from '../../lib/bim/catalog'
import { downloadIfc } from '../../lib/bim/ifc-export'
import { downloadCsv, downloadDxf, downloadJson } from '../../lib/bim/livrables'
import type { WallTypology } from '../../lib/bim/types'
import { labelForStairMode, normalizeStair } from '../../lib/cad/stairs'
import { labelForRoofMode, normalizeRoof } from '../../lib/cad/roofs'
import { stairHasRailings, stairRailingHeight } from '../../lib/cad/railings'
import type { StairMode, RoofMode } from '../../lib/bim/types'

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
  const copyActiveStory = useProjectStore((s) => s.copyActiveStory)
  const repeatActiveStories = useProjectStore((s) => s.repeatActiveStories)
  const activeStoryId = useProjectStore((s) => s.activeStoryId)

  if (!project) return null

  if (tab === 'ouvrage') {
    const wall =
      selection?.kind === 'wall' ? project.walls.find((w) => w.id === selection.id) : null
    const furn =
      selection?.kind === 'furniture'
        ? project.furniture.find((f) => f.id === selection.id)
        : null
    const opening =
      selection?.kind === 'opening'
        ? project.openings.find((o) => o.id === selection.id)
        : null
    const slab =
      selection?.kind === 'slab' ? project.slabs.find((s) => s.id === selection.id) : null
    const column =
      selection?.kind === 'column'
        ? project.columns.find((c) => c.id === selection.id)
        : null
    const stair =
      selection?.kind === 'stair' ? project.stairs.find((s) => s.id === selection.id) : null
    const roof =
      selection?.kind === 'roof' ? project.roofs.find((r) => r.id === selection.id) : null
    const railing =
      selection?.kind === 'railing'
        ? (project.railings ?? []).find((r) => r.id === selection.id)
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
            <p className="text-xs text-[#7a8f9c] uppercase tracking-wide mb-1 mt-2">Typologie</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {([
                ['exterior', 'Exterieur'],
                ['interior', 'Interieur'],
                ['curtain', 'Rideau'],
                ['core', 'Noyau'],
              ] as [WallTypology, string][]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="chip text-[12px] min-h-[40px]"
                  data-active={wall.typology === id}
                  onClick={() =>
                    patchNow((p) => ({
                      ...p,
                      walls: p.walls.map((w) => (w.id === wall.id ? { ...w, typology: id } : w)),
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : opening ? (
          <>
            <p className="text-xs text-[#7a8f9c] mb-1 font-mono">{opening.id}</p>
            <p className="text-sm mb-2 capitalize">
              {opening.kind === 'door' ? 'Porte' : opening.kind === 'window' ? 'Fenetre' : 'Ouverture'}
            </p>
            <SliderRow
              label="Position t"
              value={opening.t}
              min={0.05}
              max={0.95}
              step={0.01}
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  openings: p.openings.map((o) => (o.id === opening.id ? { ...o, t: v } : o)),
                }))
              }
            />
            <SliderRow
              label="Largeur"
              value={opening.width}
              min={0.4}
              max={3.5}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  openings: p.openings.map((o) => (o.id === opening.id ? { ...o, width: v } : o)),
                }))
              }
            />
            <SliderRow
              label="Hauteur"
              value={opening.height}
              min={0.4}
              max={3.2}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  openings: p.openings.map((o) => (o.id === opening.id ? { ...o, height: v } : o)),
                }))
              }
            />
            <SliderRow
              label="Allège"
              value={opening.sill}
              min={0}
              max={2.2}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  openings: p.openings.map((o) => (o.id === opening.id ? { ...o, sill: v } : o)),
                }))
              }
            />
            <button
              type="button"
              className="chip mt-2"
              onClick={() =>
                commit((p) => ({
                  ...p,
                  openings: p.openings.filter((o) => o.id !== opening.id),
                }))
              }
            >
              Supprimer
            </button>
          </>
        ) : slab ? (
          <>
            <p className="text-xs text-[#7a8f9c] mb-1 font-mono">{slab.id}</p>
            <p className="text-sm mb-2">Dalle ({slab.kind})</p>
            <p className="text-xs text-[#7a8f9c] mb-2">
              Polygone · {slab.polygon.length} sommets
            </p>
            <SliderRow
              label="Epaisseur"
              value={slab.thickness}
              min={0.08}
              max={0.6}
              step={0.01}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  slabs: p.slabs.map((s) => (s.id === slab.id ? { ...s, thickness: v } : s)),
                }))
              }
            />
            <SliderRow
              label="Elevation"
              value={slab.elevation}
              min={-2}
              max={80}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  slabs: p.slabs.map((s) => (s.id === slab.id ? { ...s, elevation: v } : s)),
                }))
              }
            />
            <button
              type="button"
              className="chip mt-2"
              onClick={() =>
                commit((p) => ({
                  ...p,
                  slabs: p.slabs.filter((s) => s.id !== slab.id),
                }))
              }
            >
              Supprimer
            </button>
          </>
        ) : column ? (
          <>
            <p className="text-xs text-[#7a8f9c] mb-1 font-mono">{column.id}</p>
            <p className="text-sm mb-2">Pilier</p>
            <SliderRow
              label="Pos. X"
              value={column.position.x}
              min={-40}
              max={40}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  columns: p.columns.map((c) =>
                    c.id === column.id ? { ...c, position: { ...c.position, x: v } } : c,
                  ),
                }))
              }
            />
            <SliderRow
              label="Pos. Y"
              value={column.position.y}
              min={-40}
              max={40}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  columns: p.columns.map((c) =>
                    c.id === column.id ? { ...c, position: { ...c.position, y: v } } : c,
                  ),
                }))
              }
            />
            <SliderRow
              label="Section X"
              value={column.width}
              min={0.15}
              max={1.2}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  columns: p.columns.map((c) => (c.id === column.id ? { ...c, width: v } : c)),
                }))
              }
            />
            <SliderRow
              label="Section Y"
              value={column.depth}
              min={0.15}
              max={1.2}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  columns: p.columns.map((c) => (c.id === column.id ? { ...c, depth: v } : c)),
                }))
              }
            />
            <SliderRow
              label="Hauteur"
              value={column.height}
              min={1}
              max={6}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  columns: p.columns.map((c) => (c.id === column.id ? { ...c, height: v } : c)),
                }))
              }
            />
            <button
              type="button"
              className="chip mt-2"
              onClick={() =>
                commit((p) => ({
                  ...p,
                  columns: p.columns.filter((c) => c.id !== column.id),
                }))
              }
            >
              Supprimer
            </button>
          </>
        ) : stair ? (
          <>
            <p className="text-xs text-[#7a8f9c] mb-1 font-mono">{stair.id}</p>
            <p className="text-sm mb-2">
              Escalier · {labelForStairMode(normalizeStair(stair).mode ?? 'droit')}
            </p>
            <div className="flex flex-wrap gap-1 mb-2">
              {(['droit', 'quart', 'demi'] as StairMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  data-active={normalizeStair(stair).mode === m}
                  onClick={() =>
                    commit((p) => ({
                      ...p,
                      stairs: p.stairs.map((s) =>
                        s.id === stair.id
                          ? {
                              ...normalizeStair(s),
                              mode: m,
                            }
                          : s,
                      ),
                    }))
                  }
                >
                  {labelForStairMode(m)}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#7a8f9c] mb-2">
              Parcours · {normalizeStair(stair).path.length} points
            </p>
            <SliderRow
              label="Largeur"
              value={stair.width}
              min={0.6}
              max={2.5}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  stairs: p.stairs.map((s) => (s.id === stair.id ? { ...s, width: v } : s)),
                }))
              }
            />
            <SliderRow
              label="Marches"
              value={stair.rises}
              min={3}
              max={40}
              step={1}
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  stairs: p.stairs.map((s) => (s.id === stair.id ? { ...s, rises: v } : s)),
                }))
              }
            />
            <SliderRow
              label="Hauteur"
              value={stair.rise ?? (project.stories.find((st) => st.id === stair.storyId)?.height ?? 2.8)}
              min={1.5}
              max={4.5}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  stairs: p.stairs.map((s) => (s.id === stair.id ? { ...s, rise: v } : s)),
                }))
              }
            />
            <div className="flex items-center justify-between gap-2 mt-2 mb-1">
              <span className="text-xs text-[#a8bdc8]">Garde-corps</span>
              <button
                type="button"
                className="chip"
                data-active={stairHasRailings(stair)}
                onClick={() =>
                  commit((p) => ({
                    ...p,
                    stairs: p.stairs.map((s) =>
                      s.id === stair.id ? { ...s, railings: !stairHasRailings(stair) } : s,
                    ),
                  }))
                }
              >
                {stairHasRailings(stair) ? 'Actif' : 'Off'}
              </button>
            </div>
            {stairHasRailings(stair) && (
              <SliderRow
                label="Haut. GC"
                value={stairRailingHeight(stair)}
                min={0.7}
                max={1.4}
                step={0.05}
                unit=" m"
                onChange={(v) =>
                  patchNow((p) => ({
                    ...p,
                    stairs: p.stairs.map((s) =>
                      s.id === stair.id ? { ...s, railingHeight: v } : s,
                    ),
                  }))
                }
              />
            )}
            <button
              type="button"
              className="chip mt-2"
              onClick={() =>
                commit((p) => ({
                  ...p,
                  stairs: p.stairs.filter((s) => s.id !== stair.id),
                }))
              }
            >
              Supprimer
            </button>
          </>
        ) : roof ? (
          <>
            <p className="text-xs text-[#7a8f9c] mb-1 font-mono">{roof.id}</p>
            <p className="text-sm mb-2">
              Toiture · {labelForRoofMode(normalizeRoof(roof).mode)}
            </p>
            <div className="flex flex-wrap gap-1 mb-2">
              {(['terrasse', '2pentes', 'croupe'] as RoofMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  data-active={normalizeRoof(roof).mode === m}
                  onClick={() =>
                    commit((p) => ({
                      ...p,
                      roofs: p.roofs.map((r) =>
                        r.id === roof.id ? { ...normalizeRoof(r), mode: m } : r,
                      ),
                    }))
                  }
                >
                  {labelForRoofMode(m)}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#7a8f9c] mb-2">
              Polygone · {roof.polygon.length} sommets
            </p>
            {normalizeRoof(roof).mode === 'terrasse' ? (
              <SliderRow
                label="Epaisseur"
                value={roof.ridgeHeight}
                min={0.15}
                max={1.5}
                step={0.05}
                unit=" m"
                onChange={(v) =>
                  patchNow((p) => ({
                    ...p,
                    roofs: p.roofs.map((r) => (r.id === roof.id ? { ...r, ridgeHeight: v } : r)),
                  }))
                }
              />
            ) : (
              <SliderRow
                label="Pente"
                value={normalizeRoof(roof).pitchDeg}
                min={10}
                max={55}
                step={1}
                unit="°"
                onChange={(v) =>
                  patchNow((p) => ({
                    ...p,
                    roofs: p.roofs.map((r) => (r.id === roof.id ? { ...r, pitchDeg: v } : r)),
                  }))
                }
              />
            )}
            <SliderRow
              label="Debord"
              value={roof.overhang}
              min={0}
              max={1.5}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  roofs: p.roofs.map((r) => (r.id === roof.id ? { ...r, overhang: v } : r)),
                }))
              }
            />
            <button
              type="button"
              className="chip mt-2"
              onClick={() =>
                commit((p) => ({
                  ...p,
                  roofs: p.roofs.filter((r) => r.id !== roof.id),
                }))
              }
            >
              Supprimer
            </button>
          </>
        ) : railing ? (
          <>
            <p className="text-xs text-[#7a8f9c] mb-1 font-mono">{railing.id}</p>
            <p className="text-sm mb-2">Garde-corps</p>
            <p className="text-xs text-[#7a8f9c] mb-2">
              Parcours · {railing.path.length} points
            </p>
            <SliderRow
              label="Hauteur"
              value={railing.height}
              min={0.7}
              max={1.4}
              step={0.05}
              unit=" m"
              onChange={(v) =>
                patchNow((p) => ({
                  ...p,
                  railings: (p.railings ?? []).map((r) =>
                    r.id === railing.id ? { ...r, height: v } : r,
                  ),
                }))
              }
            />
            <button
              type="button"
              className="chip mt-2"
              onClick={() =>
                commit((p) => ({
                  ...p,
                  railings: (p.railings ?? []).filter((r) => r.id !== railing.id),
                }))
              }
            >
              Supprimer
            </button>
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
            Selectionnez un mur, une ouverture, une dalle, un pilier, un escalier, une toiture, un garde-corps ou un objet.
          </p>
        )}
        <div className="mt-4">
          <p className="text-xs text-[#7a8f9c] uppercase tracking-wide mb-1">Projet</p>
          <p className="font-display text-lg">{project.meta.name}</p>
          <p className="text-sm text-[#7a8f9c]">
            {project.walls.length} murs · {project.openings.length} ouvertures ·{' '}
            {project.slabs.length} dalles · {project.columns.length} piliers ·{' '}
            {project.stairs.length} escaliers · {project.stories.length} niveaux
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
        <div className="mt-4 pt-3 border-t border-[#1a2a35]">
          <p className="text-xs text-[#7a8f9c] uppercase tracking-wide mb-2">Dupliquer etage</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="chip"
              disabled={!activeStoryId || project.stories.length >= 80}
              onClick={() => copyActiveStory()}
            >
              Copier etage actif
            </button>
            <button
              type="button"
              className="chip"
              disabled={!activeStoryId || project.stories.length >= 80}
              onClick={() => {
                const n = window.prompt('Nombre de repetitions (1–80) ?', '3')
                if (!n) return
                repeatActiveStories(Number(n))
              }}
            >
              Repeter N fois
            </button>
          </div>
          <p className="text-[11px] text-[#7a8f9c] mt-2">
            Clone murs / ouvertures / dalles / objets vers le haut. Cap 80 niveaux.
          </p>
        </div>
      </div>
    )
  }

  if (tab === 'site') {
    const ces = project.meta.ces ?? 0.4
    const cos = project.meta.cos ?? 1.2
    const sismo = project.meta.sismo ?? '2'
    return (
      <div>
        <h3 className="font-display text-base mb-3">Site</h3>
        <p className="text-sm text-[#a8bdc8] mb-2">{project.meta.city}</p>
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
        <SliderRow
          label="Parcelle largeur"
          value={project.meta.parcelWidth}
          min={10}
          max={120}
          step={1}
          unit=" m"
          onChange={(v) =>
            patchNow((p) => ({ ...p, meta: { ...p.meta, parcelWidth: v } }))
          }
        />
        <SliderRow
          label="Parcelle profondeur"
          value={project.meta.parcelDepth}
          min={10}
          max={120}
          step={1}
          unit=" m"
          onChange={(v) =>
            patchNow((p) => ({ ...p, meta: { ...p.meta, parcelDepth: v } }))
          }
        />
        <SliderRow
          label="CES"
          value={ces}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(v) =>
            patchNow((p) => ({ ...p, meta: { ...p.meta, ces: v } }))
          }
        />
        <SliderRow
          label="COS"
          value={cos}
          min={0.1}
          max={8}
          step={0.05}
          onChange={(v) =>
            patchNow((p) => ({ ...p, meta: { ...p.meta, cos: v } }))
          }
        />
        <p className="text-xs text-[#7a8f9c] uppercase tracking-wide mb-1 mt-1">Zone sismique</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {['1', '2', '3', '4', '5'].map((z) => (
            <button
              key={z}
              type="button"
              className="chip min-h-[40px] px-3"
              data-active={sismo === z}
              onClick={() =>
                patchNow((p) => ({ ...p, meta: { ...p.meta, sismo: z } }))
              }
            >
              {z}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[#7a8f9c]">
          Parcelle {project.meta.parcelWidth} x {project.meta.parcelDepth} m · CES {ces.toFixed(2)} · COS{' '}
          {cos.toFixed(2)} · sismo {sismo}
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
      {viewMode === 'coupe' && (
        <p className="text-sm text-[#7a8f9c] mb-2">
          Coupe active : plan de coupe horizontal (hauteur) ou vertical (axe X). Reglez le curseur dans la barre Vue.
        </p>
      )}
      {viewMode === 'ar' && (
        <p className="text-sm text-[#7a8f9c] mb-2">
          AR : camera + maquette (Poser 1:50 / Cote), WebXR si disponible, USDZ Quick Look sur iOS.
        </p>
      )}
      <div className="mt-3 mb-3">
        <p className="text-xs text-[#7a8f9c] uppercase tracking-wide mb-2">Livrables</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-accent" onClick={() => downloadIfc(project)}>
            IFC4
          </button>
          <button type="button" className="chip" onClick={() => downloadJson(project)}>
            JSON
          </button>
          <button type="button" className="chip" onClick={() => downloadCsv(project)}>
            CSV
          </button>
          <button type="button" className="chip" onClick={() => downloadDxf(project, activeStoryId)}>
            DXF
          </button>
        </div>
        <p className="text-[11px] text-[#7a8f9c] mt-1">
          IFC4 sous-ensemble · JSON complet · CSV quantites · DXF lignes 2D (etage actif).
        </p>
      </div>
      <p className="text-xs text-[#7a8f9c]">
        Orbit maquette : glisser pour tourner le batiment avec le doigt. Pincer pour zoomer.
      </p>
    </div>
  )
}
