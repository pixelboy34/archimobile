import { Suspense, useMemo, useEffect, useCallback } from 'react'
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber'
import type { Project } from '../../lib/bim/types'
import { detectQuality } from '../../lib/render/quality'
import BuildingScene from './BuildingScene'
import OrbitRig from './OrbitRig'
import VisitControls from './VisitControls'
import { useProjectStore } from '../../lib/store/project-store'

function InvalidateOnUpdate({ stamp }: { stamp: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    invalidate()
  }, [stamp, invalidate])
  return null
}

function GroundClick({
  enabled,
  onPlace,
}: {
  enabled: boolean
  onPlace: (x: number, z: number) => void
}) {
  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!enabled) return
      e.stopPropagation()
      onPlace(e.point.x, e.point.z)
    },
    [enabled, onPlace],
  )
  if (!enabled) return null
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.02, 0]}
      onPointerDown={onPointerDown}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

type Props = {
  project: Project
  activeStoryId: string | null
  visiting?: boolean
}

export default function Viewport3D({ project, activeStoryId, visiting = false }: Props) {
  const quality = useMemo(() => detectQuality(), [])
  const tool = useProjectStore((s) => s.tool)
  const placeKind = useProjectStore((s) => s.placeKind)
  const addFurnitureAt = useProjectStore((s) => s.addFurnitureAt)

  const story = useMemo(() => {
    if (!activeStoryId) return project.stories[0]
    return project.stories.find((s) => s.id === activeStoryId) ?? project.stories[0]
  }, [project.stories, activeStoryId])

  const elevation = story?.elevation ?? 0
  const storyHeight = story?.height ?? 2.8
  const walls = useMemo(
    () => project.walls.filter((w) => w.storyId === story?.id),
    [project.walls, story?.id],
  )
  const furniture = useMemo(
    () => project.furniture.filter((f) => f.storyId === story?.id),
    [project.furniture, story?.id],
  )
  const rooms = useMemo(
    () => project.rooms.filter((r) => r.storyId === story?.id),
    [project.rooms, story?.id],
  )

  const targetY = useMemo(() => {
    if (!story) return 1.5
    return story.elevation + story.height * 0.4
  }, [story])

  const placing = tool === 'objects' && !!placeKind && !visiting

  const onPlace = useCallback(
    (x: number, z: number) => {
      addFurnitureAt({ x: Math.round(x * 20) / 20, y: Math.round(z * 20) / 20 })
    },
    [addFurnitureAt],
  )

  return (
    <Canvas
      frameloop={visiting ? 'always' : 'demand'}
      shadows={quality.shadows}
      dpr={[1, quality.dpr]}
      camera={{
        position: visiting ? [0, elevation + 1.6, 4] : [22, 16, 22],
        fov: visiting ? 70 : 42,
        near: 0.05,
        far: 400,
      }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: 4,
        toneMappingExposure: 1.05,
      }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      onCreated={({ gl }) => {
        gl.setClearColor('#04080c')
        gl.shadowMap.enabled = quality.shadows
        gl.shadowMap.type = 2
      }}
    >
      <Suspense fallback={null}>
        <InvalidateOnUpdate stamp={project.updatedAt} />
        {!visiting && <OrbitRig target={[0, targetY, 0]} enabled={!placing} />}
        {visiting && (
          <VisitControls
            walls={walls}
            furniture={furniture}
            rooms={rooms}
            elevation={elevation}
            storyHeight={storyHeight}
            enabled={visiting}
            storyKey={story?.id ?? 'none'}
          />
        )}
        <GroundClick enabled={placing} onPlace={onPlace} />
        <BuildingScene project={project} activeStoryId={activeStoryId} />
      </Suspense>
    </Canvas>
  )
}
