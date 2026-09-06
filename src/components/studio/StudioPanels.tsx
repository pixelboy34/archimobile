import { useMemo, useState } from 'react'
import { useProjectStore } from '../../lib/store/project-store'
import { MATERIALS, FURNITURE_FAMILIES, FURNITURE_PRESETS } from '../../lib/bim/catalog'
import type { FurnitureKind, LayerFlags } from '../../lib/bim/types'
import { analyzeStructure } from '../../lib/bim/structure'

function MateriauxPanel() {
  const selection = useProjectStore((s) => s.selection)
  const assign = useProjectStore((s) => s.assignMaterialToSelection)
  const canAssign =
    selection?.kind === 'wall' || selection?.kind === 'slab' || selection?.kind === 'railing'

  return (
    <div>
      <h3 className="font-display text-base mb-2">Materiaux</h3>
      <p className="text-xs text-[#7a8f9c] mb-3">
        {canAssign
          ? 'Touchez un materiau pour l assigner a la selection.'
          : 'Selectionnez un mur, une dalle ou un garde-corps.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {Object.values(MATERIALS).map((m) => (
          <button
            key={m.id}
            type="button"
            className="chip flex items-center gap-2 justify-start px-3 min-h-[48px]"
            disabled={!canAssign}
            onClick={() => assign(m.id)}
          >
            <span
              className="w-5 h-5 rounded-full border border-[#1a2a35] shrink-0"
              style={{ background: m.color }}
            />
            <span className="truncate text-left">{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function BibliothequePanel() {
  const setPlaceKind = useProjectStore((s) => s.setPlaceKind)
  const setTool = useProjectStore((s) => s.setTool)
  const placeKind = useProjectStore((s) => s.placeKind)
  const setInspectorOpen = useProjectStore((s) => s.setInspectorOpen)

  const pick = (kind: FurnitureKind) => {
    setTool('objects')
    setPlaceKind(kind)
    setInspectorOpen(false)
  }

  return (
    <div>
      <h3 className="font-display text-base mb-2">Bibliotheque</h3>
      <p className="text-xs text-[#7a8f9c] mb-3">
        Choisissez une famille puis placez en plan ou 3D (R = rotation).
      </p>
      {FURNITURE_FAMILIES.map((fam) => (
        <div key={fam.id} className="mb-3">
          <p className="text-[11px] uppercase tracking-wide text-[#7a8f9c] mb-1.5">{fam.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {fam.kinds.map((k) => (
              <button
                key={k}
                type="button"
                className="chip text-[12px] min-h-[44px]"
                data-active={placeKind === k}
                onClick={() => pick(k)}
              >
                {FURNITURE_PRESETS[k]?.label ?? k}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CalquesPanel() {
  const layers = useProjectStore((s) => s.layers)
  const setLayer = useProjectStore((s) => s.setLayer)
  const labels: { key: keyof LayerFlags; label: string }[] = [
    { key: 'walls', label: 'Murs' },
    { key: 'openings', label: 'Ouvertures' },
    { key: 'slabs', label: 'Dalles' },
    { key: 'furniture', label: 'Mobilier' },
    { key: 'columns', label: 'Piliers' },
    { key: 'stairs', label: 'Escaliers' },
    { key: 'roofs', label: 'Toitures' },
    { key: 'railings', label: 'Garde-corps' },
    { key: 'sketch', label: 'Esquisse (stub)' },
  ]
  return (
    <div>
      <h3 className="font-display text-base mb-2">Calques</h3>
      <p className="text-xs text-[#7a8f9c] mb-3">Visibilite 3D / plan. Esquisse = stub.</p>
      <div className="flex flex-col gap-1.5">
        {labels.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="chip w-full justify-between flex"
            data-active={layers[key]}
            onClick={() => setLayer(key, !layers[key])}
          >
            <span>{label}</span>
            <span className="font-mono text-[11px] text-[#6ed0c3]">
              {layers[key] ? 'ON' : 'OFF'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function GuidePanel() {
  return (
    <div>
      <h3 className="font-display text-base mb-2">Guide</h3>
      <ul className="text-sm text-[#a8bdc8] space-y-2 leading-relaxed">
        <li>
          <strong className="text-[#e8f0f4]">Tracer</strong> — Mur / Rectangle en plan ou 3D. Couper /
          Prolonger pour soigner les jonctions.
        </li>
        <li>
          <strong className="text-[#e8f0f4]">Params</strong> — Ouvrage | Etages | Site | Vue. Le dock
          reste sous la maquette (pas de plein ecran).
        </li>
        <li>
          <strong className="text-[#e8f0f4]">Massing</strong> — Etages : Largeur / Profondeur / Etages /
          HSP puis Generer (confirmation).
        </li>
        <li>
          <strong className="text-[#e8f0f4]">Studio</strong> — Materiaux, Bibliotheque, Structure,
          Copilote, 4D, Calques.
        </li>
        <li>
          <strong className="text-[#e8f0f4]">Orbit</strong> — Glisser pour tourner le batiment avec le
          doigt.
        </li>
      </ul>
    </div>
  )
}

function StructurePanel() {
  const project = useProjectStore((s) => (s.activeId ? s.projects[s.activeId] : null))
  const report = useMemo(() => (project ? analyzeStructure(project) : null), [project])
  if (!report) return null
  return (
    <div>
      <h3 className="font-display text-base mb-2">Structure</h3>
      <p className="text-xs text-[#7a8f9c] mb-3">
        Heuristiques locales — {report.stats.walls} murs · {report.stats.columns} piliers ·{' '}
        {report.stats.stories} niveaux · portee max {report.stats.maxSpanM.toFixed(1)} m
      </p>
      <ul className="space-y-2">
        {report.findings.map((f, i) => (
          <li key={i} className="panel p-3">
            <p className="text-[11px] uppercase tracking-wide text-[#6ed0c3] mb-1">
              {f.level === 'warn' ? 'Attention' : f.level === 'ok' ? 'OK' : 'Info'} · {f.label}
            </p>
            <p className="text-sm text-[#c5d4dc]">{f.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CopilotePanel() {
  const run = useProjectStore((s) => s.runCopilotPrompt)
  const [prompt, setPrompt] = useState('immeuble 12x18, 8 etages, HSP 3')
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div>
      <h3 className="font-display text-base mb-2">Copilote</h3>
      <p className="text-xs text-[#7a8f9c] mb-2">
        Massing local (sans reseau). Ex. « tour 15x20 R+12 HSP 3.2 ».
      </p>
      <textarea
        className="w-full rounded-xl bg-[#0a1218] border border-[#1a2a35] p-3 text-sm min-h-[88px] text-[#e8f0f4]"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button
        type="button"
        className="btn-accent w-full mt-2"
        onClick={() => setMsg(run(prompt))}
      >
        Generer massing
      </button>
      {msg && <p className="text-sm text-[#6ed0c3] mt-2 font-mono">{msg}</p>}
    </div>
  )
}

function Phase4DPanel() {
  const phase = useProjectStore((s) => s.phase4d)
  const setPhase = useProjectStore((s) => s.setPhase4d)
  const project = useProjectStore((s) => (s.activeId ? s.projects[s.activeId] : null))
  const n = Math.max(1, project?.stories.length ?? 1)
  const built = Math.max(1, Math.round(phase * n))
  return (
    <div>
      <h3 className="font-display text-base mb-2">4D — Phasage</h3>
      <p className="text-xs text-[#7a8f9c] mb-3">
        Scrubber de construction : niveaux 1–{built} / {n} visibles.
      </p>
      <div className="slider-row">
        <label>Phase</label>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={phase}
          onChange={(e) => setPhase(Number(e.target.value))}
        />
        <span className="val">{Math.round(phase * 100)}%</span>
      </div>
      <p className="text-sm text-[#a8bdc8]">
        Etages construits : {built} / {n}
      </p>
    </div>
  )
}

export default function StudioPanels() {
  const panel = useProjectStore((s) => s.studioPanel)
  if (!panel) return null
  switch (panel) {
    case 'materiaux':
      return <MateriauxPanel />
    case 'bibliotheque':
      return <BibliothequePanel />
    case 'calques':
      return <CalquesPanel />
    case 'guide':
      return <GuidePanel />
    case 'structure':
      return <StructurePanel />
    case 'copilote':
      return <CopilotePanel />
    case '4d':
      return <Phase4DPanel />
    default:
      return null
  }
}
