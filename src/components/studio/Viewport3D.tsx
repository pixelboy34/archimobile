import { Suspense, useMemo, useEffect, useCallback, useState } from 'react'
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Project, Vec2 } from '../../lib/bim/types'
import { detectQuality } from '../../lib/render/quality'
import BuildingScene from './BuildingScene'
import OrbitRig from './OrbitRig'
import VisitControls from './VisitControls'
import { useProjectStore } from '../../lib/store/project-store'
import { nearestWallHit } from '../../lib/cad/ops'
import { pointsNeededForMode } from '../../lib/cad/stairs'

function InvalidateOnUpdate({ stamp }: { stamp: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    invalidate()
  }, [stamp, invalidate])
  return null
}

/** Global clipping plane for Coupe mode + translucent section helper + edges. */
function CoupeClip({
  enabled,
  axis,
  cut,
}: {
  enabled: boolean
  axis: 'horizontal' | 'vertical'
  cut: number
}) {
  const { gl, invalidate } = useThree()

  useEffect(() => {
    gl.localClippingEnabled = enabled
    if (!enabled) {
      gl.clippingPlanes = []
      invalidate()
      return
    }
    const plane =
      axis === 'horizontal'
        ? new THREE.Plane(new THREE.Vector3(0, -1, 0), cut)
        : new THREE.Plane(new THREE.Vector3(-1, 0, 0), cut)
    gl.clippingPlanes = [plane]
    invalidate()
    return () => {
      gl.clippingPlanes = []
      gl.localClippingEnabled = false
    }
  }, [enabled, axis, cut, gl, invalidate])

  const edgeH = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(80, 80)), [])
  const edgeV = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(80, 40)), [])

  if (!enabled) return null

  if (axis === 'horizontal') {
    return (
      <group position={[0, cut, 0]} renderOrder={10}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[80, 80]} />
          <meshBasicMaterial
            color="#6ed0c3"
            transparent
            opacity={0.2}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[38.5, 40, 64]} />
          <meshBasicMaterial color="#6ed0c3" toneMapped={false} transparent opacity={0.95} />
        </mesh>
        <lineSegments geometry={edgeH} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <lineBasicMaterial color="#9eefe4" toneMapped={false} />
        </lineSegments>
        <mesh position={[0, 0.015, 0]}>
          <boxGeometry args={[80, 0.04, 0.08]} />
          <meshBasicMaterial color="#6ed0c3" transparent opacity={0.55} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.015, 0]}>
          <boxGeometry args={[0.08, 0.04, 80]} />
          <meshBasicMaterial color="#6ed0c3" transparent opacity={0.55} toneMapped={false} />
        </mesh>
      </group>
    )
  }

  return (
    <group position={[cut, 12, 0]} renderOrder={10}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[80, 40]} />
        <meshBasicMaterial
          color="#6ed0c3"
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <lineSegments geometry={edgeV} rotation={[0, Math.PI / 2, 0]} position={[0.02, 0, 0]}>
        <lineBasicMaterial color="#9eefe4" toneMapped={false} />
      </lineSegments>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[0.03, 0, 0]}>
        <boxGeometry args={[80, 0.08, 0.06]} />
        <meshBasicMaterial color="#6ed0c3" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[0.03, 0, 0]}>
        <boxGeometry args={[0.08, 40, 0.06]} />
        <meshBasicMaterial color="#6ed0c3" transparent opacity={0.55} toneMapped={false} />
      </mesh>
    </group>
  )
}

function PlaceSurface({
  enabled,
  elevation,
  onPlace,
}: {
  enabled: boolean
  elevation: number
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
      position={[0, elevation + 0.02, 0]}
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
  coupe?: boolean
}

export default function Viewport3D({
  project,
  activeStoryId,
  visiting = false,
  coupe = false,
}: Props) {
  const quality = useMemo(() => detectQuality(), [])
  const tool = useProjectStore((s) => s.tool)
  const placeKind = useProjectStore((s) => s.placeKind)
  const addFurnitureAt = useProjectStore((s) => s.addFurnitureAt)
  const addOpeningAtWall = useProjectStore((s) => s.addOpeningAtWall)
  const addSlab = useProjectStore((s) => s.addSlab)
  const addSlabPolygon = useProjectStore((s) => s.addSlabPolygon)
  const addColumn = useProjectStore((s) => s.addColumn)
  const addStairPath = useProjectStore((s) => s.addStairPath)
  const addRoof = useProjectStore((s) => s.addRoof)
  const addRoofPolygon = useProjectStore((s) => s.addRoofPolygon)
  const stairMode = useProjectStore((s) => s.stairMode)
  const polyDrawMode = useProjectStore((s) => s.polyDrawMode)
  const coupeAxis = useProjectStore((s) => s.coupeAxis)
  const coupeCut = useProjectStore((s) => s.coupeCut)

  const [draft, setDraft] = useState<Vec2 | null>(null)
  const [polyDraft, setPolyDraft] = useState<Vec2[]>([])
  const lastClickAt = useState(() => ({ t: 0 }))[0]

  useEffect(() => {
    setDraft(null)
    setPolyDraft([])
  }, [tool, stairMode, polyDrawMode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(null)
        setPolyDraft([])
      }
      if (e.key === 'Enter') {
        if ((tool === 'slab' || tool === 'roof') && polyDrawMode === 'polygon' && polyDraft.length >= 3) {
          e.preventDefault()
          if (tool === 'slab') addSlabPolygon(polyDraft)
          else addRoofPolygon(polyDraft)
          setPolyDraft([])
        }
        if (tool === 'stair' && polyDraft.length >= (stairMode === 'droit' ? 2 : 3)) {
          e.preventDefault()
          addStairPath(polyDraft, stairMode)
          setPolyDraft([])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, polyDrawMode, polyDraft, stairMode, addSlabPolygon, addRoofPolygon, addStairPath])

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
    if (coupe && coupeAxis === 'horizontal') return coupeCut
    if (!story) return 1.5
    return story.elevation + story.height * 0.4
  }, [story, coupe, coupeAxis, coupeCut])

  const placingObjects = tool === 'objects' && !!placeKind && !visiting && !coupe
  const placingPoint =
    !visiting &&
    !coupe &&
    (tool === 'column' ||
      tool === 'door' ||
      tool === 'window' ||
      tool === 'slab' ||
      tool === 'stair' ||
      tool === 'roof' ||
      placingObjects)
  const orbitOff = placingPoint

  const snap = (x: number, z: number): Vec2 => ({
    x: Math.round(x * 20) / 20,
    y: Math.round(z * 20) / 20,
  })

  const onPlace = useCallback(
    (x: number, z: number) => {
      const p = snap(x, z)
      if (tool === 'objects' && placeKind) {
        addFurnitureAt(p)
        return
      }
      if (tool === 'door' || tool === 'window') {
        const hit = nearestWallHit(p, walls, 0.85)
        if (hit) addOpeningAtWall(hit.wall.id, hit.t, tool === 'door' ? 'door' : 'window')
        return
      }
      if (tool === 'column') {
        addColumn(p)
        return
      }
      if (tool === 'slab' || tool === 'roof') {
        if (polyDrawMode === 'rect') {
          if (!draft) {
            setDraft(p)
            setPolyDraft([])
            return
          }
          if (tool === 'slab') addSlab(draft, p)
          else addRoof(draft, p)
          setDraft(null)
          return
        }
        const now = Date.now()
        const isDouble = now - lastClickAt.t < 320 && polyDraft.length >= 2
        lastClickAt.t = now
        if (isDouble) {
          const pts = polyDraft.length >= 3 ? polyDraft : [...polyDraft, p]
          if (pts.length >= 3) {
            if (tool === 'slab') addSlabPolygon(pts)
            else addRoofPolygon(pts)
          }
          setPolyDraft([])
          return
        }
        setPolyDraft((prev) => [...prev, p])
        return
      }
      if (tool === 'stair') {
        const needed = pointsNeededForMode(stairMode)
        const next = [...polyDraft, p]
        if (next.length >= needed) {
          addStairPath(next, stairMode)
          setPolyDraft([])
          return
        }
        setPolyDraft(next)
      }
    },
    [
      tool,
      placeKind,
      walls,
      draft,
      polyDraft,
      polyDrawMode,
      stairMode,
      lastClickAt,
      addFurnitureAt,
      addOpeningAtWall,
      addColumn,
      addSlab,
      addSlabPolygon,
      addRoof,
      addRoofPolygon,
      addStairPath,
    ],
  )

  const stamp =
    project.updatedAt +
    (coupe ? coupeCut * 1000 + (coupeAxis === 'vertical' ? 7 : 0) : 0)

  return (
    <Canvas
      frameloop={visiting ? 'always' : 'demand'}
      shadows={quality.shadows}
      dpr={[1, quality.dpr]}
      camera={{
        position: visiting ? [0, elevation + 1.6, 4] : coupe ? [28, 18, 28] : [22, 16, 22],
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
        gl.localClippingEnabled = false
      }}
    >
      <Suspense fallback={null}>
        <InvalidateOnUpdate stamp={stamp} />
        <CoupeClip enabled={coupe} axis={coupeAxis} cut={coupeCut} />
        {!visiting && <OrbitRig target={[0, targetY, 0]} enabled={!orbitOff} />}
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
        <PlaceSurface enabled={!!placingPoint} elevation={elevation} onPlace={onPlace} />
        {draft && (
          <mesh position={[draft.x, elevation + 0.05, draft.y]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshBasicMaterial color="#6ed0c3" />
          </mesh>
        )}
        {polyDraft.map((pt, i) => (
          <mesh key={`pd-${i}`} position={[pt.x, elevation + 0.05, pt.y]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshBasicMaterial color="#6ed0c3" />
          </mesh>
        ))}
        <BuildingScene project={project} activeStoryId={activeStoryId} visiting={visiting} />
      </Suspense>
    </Canvas>
  )
}
