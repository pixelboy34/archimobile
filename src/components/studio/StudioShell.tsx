import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '../../lib/store/project-store'
import Viewport3D from './Viewport3D'
import Plan2D from './Plan2D'
import InspectorDock from './InspectorDock'
import PropertiesPanel from './PropertiesPanel'
import ToolDock from './ToolDock'
import ViewBar from './ViewBar'
import { VisitHud } from './VisitControls'
import ArView from './ArView'
import { downloadIfc } from '../../lib/bim/ifc-export'

export default function StudioShell() {
  const navigate = useNavigate()
  const project = useProjectStore((s) => (s.activeId ? s.projects[s.activeId] : null))
  const viewMode = useProjectStore((s) => s.viewMode)
  const setView = useProjectStore((s) => s.setView)
  const skill = useProjectStore((s) => s.skill)
  const setSkill = useProjectStore((s) => s.setSkill)
  const inspectorOpen = useProjectStore((s) => s.inspectorOpen)
  const setInspectorOpen = useProjectStore((s) => s.setInspectorOpen)
  const activeStoryId = useProjectStore((s) => s.activeStoryId)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)

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
        <div className="pointer-events-auto flex items-center gap-2 px-3 pt-2 pb-2">
          <button type="button" className="chip" onClick={() => navigate('/')}>
            Retour
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm tracking-wide truncate">FORMA</p>
            <p className="font-mono text-[10px] text-[#7a8f9c] truncate">{project.meta.name}</p>
          </div>
          {!visiting && !showAr && (
            <button
              type="button"
              className="chip"
              data-active={inspectorOpen}
              onClick={() => setInspectorOpen(!inspectorOpen)}
            >
              Params
            </button>
          )}
          <button
            type="button"
            className="chip"
            title="Exporter IFC4 (sous-ensemble)"
            onClick={() => downloadIfc(project)}
          >
            IFC
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => setSkill(skill === 'simple' ? 'pro' : 'simple')}
          >
            {skill === 'simple' ? 'Amateur' : 'Expert'}
          </button>
        </div>

        <div className="pointer-events-auto flex gap-1 px-3 pb-2 overflow-x-auto">
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
          {!visiting && !showAr && (
            <>
              <button type="button" className="chip" onClick={() => undo()}>
                Annuler
              </button>
              <button type="button" className="chip" onClick={() => redo()}>
                Retablir
              </button>
            </>
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
