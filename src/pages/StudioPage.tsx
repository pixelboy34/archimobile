import { useEffect } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useProjectStore } from '../lib/store/project-store'
import StudioShell from '../components/studio/StudioShell'

export default function StudioPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const projects = useProjectStore((s) => s.projects)
  const setActive = useProjectStore((s) => s.setActive)
  const activeId = useProjectStore((s) => s.activeId)

  useEffect(() => {
    if (projectId && projects[projectId] && activeId !== projectId) {
      setActive(projectId)
    }
  }, [projectId, projects, activeId, setActive])

  if (!projectId || !projects[projectId]) {
    return <Navigate to="/" replace />
  }

  return <StudioShell />
}
