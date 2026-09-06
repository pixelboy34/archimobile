import { useMemo } from 'react'
import * as THREE from 'three'
import type { Project, Wall, Slab, Furniture, Column, Roof } from '../../lib/bim/types'
import { wallLength, wallAngle, wallCenter } from '../../lib/bim/types'
import { MATERIALS, FURNITURE_PRESETS } from '../../lib/bim/catalog'
import { detectQuality } from '../../lib/render/quality'

const boxGeo = new THREE.BoxGeometry(1, 1, 1)

function matFor(id?: string, fallback = 'beton') {
  const def = MATERIALS[id ?? fallback] ?? MATERIALS[fallback]
  return {
    color: def.color,
    roughness: def.roughness,
    metalness: def.metalness,
  }
}

function WallMesh({ wall, elevation }: { wall: Wall; elevation: number }) {
  const len = wallLength(wall)
  const angle = wallAngle(wall)
  const c = wallCenter(wall)
  const m = matFor(wall.materialId, wall.typology === 'curtain' ? 'rideau' : 'enduit')
  return (
    <mesh
      geometry={boxGeo}
      position={[c.x, elevation + wall.height / 2, c.y]}
      rotation={[0, -angle, 0]}
      scale={[len, wall.height, wall.thickness]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
    </mesh>
  )
}

function polygonCentroid(poly: { x: number; y: number }[]) {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  return { x: x / poly.length, y: y / poly.length }
}

function bbox(poly: { x: number; y: number }[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { w: maxX - minX, d: maxY - minY, cx: (minX + maxX) / 2, cz: (minY + maxY) / 2 }
}

function SlabMesh({ slab }: { slab: Slab }) {
  const b = bbox(slab.polygon)
  const kindMat =
    slab.kind === 'pool' ? 'eau' : slab.kind === 'terrace' ? 'beton' : slab.kind === 'ground' ? 'pierre' : 'beton'
  const m = matFor(slab.materialId, kindMat)
  return (
    <mesh
      geometry={boxGeo}
      position={[b.cx, slab.elevation - slab.thickness / 2, b.cz]}
      scale={[b.w, slab.thickness, b.d]}
      receiveShadow
      castShadow={slab.kind !== 'ground'}
    >
      <meshStandardMaterial
        color={m.color}
        roughness={m.roughness}
        metalness={m.metalness}
        transparent={slab.kind === 'pool'}
        opacity={slab.kind === 'pool' ? 0.75 : 1}
      />
    </mesh>
  )
}

function RoofMesh({ roof, elevation }: { roof: Roof; elevation: number }) {
  const b = bbox(roof.polygon)
  const m = matFor('tuile')
  return (
    <mesh
      geometry={boxGeo}
      position={[b.cx, elevation + roof.ridgeHeight / 2, b.cz]}
      scale={[b.w, Math.max(0.2, roof.ridgeHeight), b.d]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
    </mesh>
  )
}

function ColumnMesh({ col, elevation }: { col: Column; elevation: number }) {
  const m = matFor('beton')
  return (
    <mesh
      geometry={boxGeo}
      position={[col.position.x, elevation + col.height / 2, col.position.y]}
      scale={[col.width, col.height, col.depth]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
    </mesh>
  )
}

function FurnitureMesh({ item, elevation }: { item: Furniture; elevation: number }) {
  const preset = FURNITURE_PRESETS[item.kind]
  const color = preset?.color ?? '#666'
  const isCore = item.kind === 'elevator' || item.kind === 'staircore'
  return (
    <group position={[item.position.x, elevation, item.position.y]} rotation={[0, item.rotation, 0]}>
      <mesh
        geometry={boxGeo}
        position={[0, item.height / 2, 0]}
        scale={[item.width, item.height, item.depth]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={color}
          roughness={isCore ? 0.5 : 0.7}
          metalness={isCore ? 0.4 : 0.05}
        />
      </mesh>
      {item.kind === 'sofa' && (
        <mesh geometry={boxGeo} position={[0, item.height * 0.7, -item.depth * 0.35]} scale={[item.width, item.height * 0.6, item.depth * 0.25]} castShadow>
          <meshStandardMaterial color={color} roughness={0.7} metalness={0} />
        </mesh>
      )}
      {item.kind === 'tree' && (
        <>
          <mesh geometry={boxGeo} position={[0, item.height * 0.25, 0]} scale={[0.25, item.height * 0.5, 0.25]}>
            <meshStandardMaterial color="#5a3a1a" roughness={0.9} />
          </mesh>
          <mesh geometry={boxGeo} position={[0, item.height * 0.7, 0]} scale={[item.width, item.height * 0.5, item.depth]}>
            <meshStandardMaterial color="#2f5d2e" roughness={0.95} />
          </mesh>
        </>
      )}
    </group>
  )
}

type Props = {
  project: Project
  activeStoryId: string | null
}

export default function BuildingScene({ project, activeStoryId }: Props) {
  const quality = useMemo(() => detectQuality(), [])
  const storyMap = useMemo(() => {
    const m = new Map<string, (typeof project.stories)[0]>()
    for (const s of project.stories) m.set(s.id, s)
    return m
  }, [project.stories])

  const sunAngle = ((project.meta.lightHour - 6) / 12) * Math.PI
  const sunX = Math.cos(sunAngle) * 40
  const sunY = Math.sin(sunAngle) * 35 + 10
  const sunZ = 20

  const focusStory = activeStoryId ? storyMap.get(activeStoryId) : null

  return (
    <group>
      <ambientLight intensity={0.35} />
      <directionalLight
        castShadow={quality.shadows}
        intensity={1.35}
        position={[sunX, Math.max(8, sunY), sunZ]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={120}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0002}
      />
      <hemisphereLight args={['#b8d4e8', '#3a4a3a', 0.35]} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[quality.groundSize, quality.groundSize]} />
        <meshStandardMaterial color="#1a2a22" roughness={0.95} metalness={0} />
      </mesh>

      {/* Parcel hint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[project.meta.parcelWidth, project.meta.parcelDepth]} />
        <meshStandardMaterial color="#24352c" roughness={0.9} metalness={0} />
      </mesh>

      {project.slabs.map((s) => (
        <SlabMesh key={s.id} slab={s} />
      ))}

      {project.walls.map((w) => {
        const st = storyMap.get(w.storyId)
        if (!st) return null
        const dim = focusStory && focusStory.id !== w.storyId && Math.abs(focusStory.index - st.index) > 2
        return (
          <group key={w.id} visible={!dim || true}>
            <WallMesh wall={w} elevation={st.elevation} />
          </group>
        )
      })}

      {project.columns.map((c) => {
        const st = storyMap.get(c.storyId)
        if (!st) return null
        return <ColumnMesh key={c.id} col={c} elevation={st.elevation} />
      })}

      {project.furniture.map((f) => {
        const st = storyMap.get(f.storyId)
        if (!st) return null
        return <FurnitureMesh key={f.id} item={f} elevation={st.elevation} />
      })}

      {project.roofs.map((r) => {
        const st = storyMap.get(r.storyId)
        if (!st) return null
        return <RoofMesh key={r.id} roof={r} elevation={st.elevation + st.height} />
      })}
    </group>
  )
}
