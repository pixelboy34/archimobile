import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../../lib/store/project-store'
import type { WorkspaceMode } from '../../lib/bim/types'
import Viewport3D from './Viewport3D'
import Plan2D from './Plan2D'
import InspectorDock from './InspectorDock'
import PropertiesPanel from './PropertiesPanel'
import ToolDock from './ToolDock'
import ViewBar from './ViewBar'
import { VisitHud } from './VisitControls'
import ArView from './ArView'
import StudioRadial from './StudioRadial'
import { downloadIfc } from '../../lib/bim/ifc-export'

const WORKSPACES: { id: WorkspaceMode; label: string }[] = [
  { id: 'esquisse', label: 'Esquisse' },
  { id: 'modele', label: 'Modele' },
  { id: 'releve', label: 'Releve' },
]

export default function StudioShell() {
  const navigate = useNavigate()
  const project = useProjectStore((s) => (s.activeId ? s.projects[s.activeId] : null))
  const viewMode = useProjectStore((s) => s.viewMode)
  const setView = useProjectStore((s) => s.setView)
  const skill = useProjectStore((s) => s.skill)
  const setSkill = useProjectStore((s) => s.setSkill)
  const inspectorOpen = useProjectStore((s) => s.inspectorOpen)
  const setInspectorOpen = useProjectStore((s) => s.setInspectorOpen)
  const setStudioPanel = useProjectStore((s) => s.setStudioPanel)
  const studioPanel = useProjectStore((s) => s.studioPanel)
  const activeStoryId = useProjectStore((s) => s.activeStoryId)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const workspace = useProjectStore((s) => s.workspace)
  const setWorkspace = useProjectStore((s) => s.setWorkspace)
  const setRadialOpen = useProjectStore((s) => s.setRadialOpen)

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center text-[#7a8f9c]">
        Projet introuvable
      </div>
    )
  }

  const visiting = viewMode === 'visite'
  const coupe = viewMode === 'coupe'
  const showAr = viewMode === 'ar'
  const show3d = viewMode === '3d' || coupe || visiting
  const expert = skill === 'pro'

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#04080c]">
      {show3d && (
        <Viewport3D
          project={project}
          activeStoryId={activeStoryId}
          visiting={visiting}
          coupe={coupe}
        />
      )}
      {viewMode === 'plan' && <Plan2D project={project} storyId={activeStoryId} />}
      {showAr && <ArView project={project} />}
      {visiting && <VisitHud />}

      <header className="absolute top-0 left-0 right-0 z-30 safe-top safe-x pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 px-3 pt-2 pb-1.5">
          <button type="button" className="chip" onClick={() => navigate('/')}>
            Retour
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm tracking-wide truncate text-[#e8f0f4]">
              {project.meta.name}
            </p>
            <p className="font-mono text-[10px] text-[#7a8f9c] truncate">
              {project.meta.city}
            </p>
          </div>
          <StudioRadial />
          <button
            type="button"
            className="chip expert-toggle"
            data-active={expert}
            title={expert ? 'Mode Expert actif' : 'Passer en mode Expert'}
            onClick={() => setSkill(expert ? 'simple' : 'pro')}
          >
            {expert ? 'Expert' : 'Amateur'}
          </button>
          {!visiting && !showAr && (
            <button
              type="button"
              className="chip"
              data-active={inspectorOpen && !studioPanel}
              onClick={() => {
                if (inspectorOpen && !studioPanel) {
                  setInspectorOpen(false)
                } else {
                  setStudioPanel(null)
                  setRadialOpen(false)
                  setInspectorOpen(true)
                }
              }}
            >
              Params
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 px-3 pb-1.5 overflow-x-auto">
          <div className="flex gap-1 p-1 rounded-2xl bg-[#0a1218]/75 border border-[#1a2a35]/90 backdrop-blur-md shrink-0">
            {WORKSPACES.map((w) => (
              <button
                key={w.id}
                type="button"
                className="chip min-h-[40px] text-[12px] px-3"
                data-active={workspace === w.id}
                onClick={() => setWorkspace(w.id)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 px-3 pb-2">
          <div className="flex gap-1 p-1 rounded-2xl bg-[#0a1218]/75 border border-[#1a2a35]/90 backdrop-blur-md">
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
            {expert && (
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
          {!visiting && !showAr && (
            <div className="flex gap-1 ml-auto">
              <button type="button" className="chip px-3" onClick={() => undo()} title="Annuler">
                Annuler
              </button>
              <button type="button" className="chip px-3" onClick={() => redo()} title="Retablir">
                Retablir
              </button>
              {expert && (
                <button
                  type="button"
                  className="chip px-3"
                  title="Exporter IFC4"
                  onClick={() => downloadIfc(project)}
                >
                  IFC
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {!showAr && <ViewBar />}
      {!visiting && !showAr && <ToolDock />}

      {!visiting && !showAr && (
        <InspectorDock>
          <PropertiesPanel />
        </InspectorDock>
      )}
    </div>
  )
}
