import { useMemo, useEffect } from 'react'
import * as THREE from 'three'
import type { Project, Wall, Slab, Furniture, Column, Roof, Opening, Stair } from '../../lib/bim/types'
import { wallLength, wallAngle, wallCenter } from '../../lib/bim/types'
import { MATERIALS, FURNITURE_PRESETS } from '../../lib/bim/catalog'
import { detectQuality } from '../../lib/render/quality'
import { wallSolidBoxes, openingsLocal } from '../../lib/bim/wall-openings'
import { buildStairGeometry, normalizeStair } from '../../lib/cad/stairs'

const EMPTY_OPENINGS: Opening[] = []
const boxGeo = new THREE.BoxGeometry(1, 1, 1)

function matFor(id?: string, fallback = 'beton') {
  const def = MATERIALS[id ?? fallback] ?? MATERIALS[fallback]
  return {
    color: def.color,
    roughness: def.roughness,
    metalness: def.metalness,
  }
}

function WallMesh({
  wall,
  openings,
  elevation,
  visitMode = false,
}: {
  wall: Wall
  openings: Opening[]
  elevation: number
  visitMode?: boolean
}) {
  const len = wallLength(wall)
  const angle = wallAngle(wall)
  const c = wallCenter(wall)
  const m = matFor(wall.materialId, wall.typology === 'curtain' ? 'rideau' : 'enduit')
  const solids = useMemo(() => wallSolidBoxes(wall, openings), [wall, openings])
  const locals = useMemo(() => openingsLocal(wall, openings), [wall, openings])

  if (len < 0.01) return null

  const frameMat = MATERIALS.bois
  const metalMat = MATERIALS.acier
  const glassMat = MATERIALS.verre

  return (
    <group position={[c.x, elevation, c.y]} rotation={[0, -angle, 0]}>
      {solids.map((seg, i) => (
        <mesh
          key={`seg-${i}`}
          geometry={boxGeo}
          position={[seg.x, seg.y, 0]}
          scale={[seg.w, seg.h, wall.thickness]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={m.color}
            roughness={m.roughness}
            metalness={m.metalness}
            side={visitMode ? THREE.DoubleSide : THREE.FrontSide}
            emissive={visitMode ? '#1a3030' : '#000000'}
            emissiveIntensity={visitMode ? 0.12 : 0}
          />
        </mesh>
      ))}

      {locals.map((op) => {
        const midY = op.sill + op.height / 2
        const frame = Math.min(0.07, op.width * 0.12, op.height * 0.08)
        const depth = wall.thickness + 0.03
        const isDoor = op.kind === 'door'
        const isWindow = op.kind === 'window'
        const fColor = isDoor ? frameMat.color : metalMat.color
        const fRough = isDoor ? frameMat.roughness : metalMat.roughness
        const fMetal = isDoor ? frameMat.metalness : metalMat.metalness
        const innerW = Math.max(0.05, op.width - frame * 2)
        const innerH = Math.max(0.05, op.height - frame * 2)

        return (
          <group key={op.id} position={[op.x, 0, 0]}>
            {/* jambs */}
            <mesh
              geometry={boxGeo}
              position={[-op.width / 2 + frame / 2, midY, 0]}
              scale={[frame, op.height, depth]}
              castShadow
            >
              <meshStandardMaterial color={fColor} roughness={fRough} metalness={fMetal} />
            </mesh>
            <mesh
              geometry={boxGeo}
              position={[op.width / 2 - frame / 2, midY, 0]}
              scale={[frame, op.height, depth]}
              castShadow
            >
              <meshStandardMaterial color={fColor} roughness={fRough} metalness={fMetal} />
            </mesh>
            {/* head */}
            <mesh
              geometry={boxGeo}
              position={[0, op.sill + op.height - frame / 2, 0]}
              scale={[op.width, frame, depth]}
              castShadow
            >
              <meshStandardMaterial color={fColor} roughness={fRough} metalness={fMetal} />
            </mesh>
            {/* sill bar (windows / generic openings) */}
            {!isDoor && (
              <mesh
                geometry={boxGeo}
                position={[0, op.sill + frame / 2, 0]}
                scale={[op.width, frame, depth]}
                castShadow
              >
                <meshStandardMaterial color={fColor} roughness={fRough} metalness={fMetal} />
              </mesh>
            )}
            {/* glass pane */}
            {isWindow && (
              <mesh
                geometry={boxGeo}
                position={[0, midY, 0]}
                scale={[innerW, innerH, Math.max(0.02, wall.thickness * 0.25)]}
              >
                <meshStandardMaterial
                  color={glassMat.color}
                  roughness={glassMat.roughness}
                  metalness={glassMat.metalness}
                  transparent
                  opacity={visitMode ? 0.35 : 0.55}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            )}
            {/* lightly ajar door leaf — stays clear of the opening center for visite */}
            {isDoor && (
              <mesh
                geometry={boxGeo}
                position={[op.width / 2 - 0.03, midY, wall.thickness / 2 + 0.22]}
                rotation={[0, -0.55, 0]}
                scale={[op.width * 0.72, innerH, 0.04]}
                castShadow
              >
                <meshStandardMaterial
                  color={frameMat.color}
                  roughness={frameMat.roughness}
                  metalness={0}
                />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}


function bbox(poly: { x: number; y: number }[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { w: maxX - minX, d: maxY - minY, cx: (minX + maxX) / 2, cz: (minY + maxY) / 2 }
}

/** Extrude plan polygon (XZ) into a vertical prism of given thickness. */
function usePolygonExtrude(poly: { x: number; y: number }[], thickness: number) {
  const geo = useMemo(() => {
    if (!poly || poly.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(poly[0]!.x, poly[0]!.y)
    for (let i = 1; i < poly.length; i++) {
      shape.lineTo(poly[i]!.x, poly[i]!.y)
    }
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.02, thickness),
      bevelEnabled: false,
      steps: 1,
    })
    // Shape XY + extrude +Z → rotateX(+90°) so shape Y → world Z, depth → -Y
    g.rotateX(Math.PI / 2)
    g.computeVertexNormals()
    return g
  }, [poly, thickness])

  useEffect(() => {
    return () => {
      geo?.dispose()
    }
  }, [geo])

  return geo
}

function SlabMesh({ slab }: { slab: Slab }) {
  const kindMat =
    slab.kind === 'pool' ? 'eau' : slab.kind === 'terrace' ? 'beton' : slab.kind === 'ground' ? 'pierre' : 'beton'
  const m = matFor(slab.materialId, kindMat)
  const geo = usePolygonExtrude(slab.polygon, slab.thickness)
  if (!geo) {
    // Fallback bbox box if degenerate
    const b = bbox(slab.polygon)
    if (b.w < 0.05 || b.d < 0.05) return null
    return (
      <mesh
        geometry={boxGeo}
        position={[b.cx, slab.elevation - slab.thickness / 2, b.cz]}
        scale={[b.w, slab.thickness, b.d]}
        receiveShadow
        castShadow={slab.kind !== 'ground'}
      >
        <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
      </mesh>
    )
  }
  return (
    <mesh
      geometry={geo}
      position={[0, slab.elevation, 0]}
      receiveShadow
      castShadow={slab.kind !== 'ground'}
    >
      <meshStandardMaterial
        color={m.color}
        roughness={m.roughness}
        metalness={m.metalness}
        transparent={slab.kind === 'pool'}
        opacity={slab.kind === 'pool' ? 0.75 : 1}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function RoofMesh({ roof, elevation }: { roof: Roof; elevation: number }) {
  const m = matFor('tuile')
  const h = Math.max(0.2, roof.ridgeHeight)
  const geo = usePolygonExtrude(roof.polygon, h)
  if (!geo) {
    const b = bbox(roof.polygon)
    if (b.w < 0.05 || b.d < 0.05) return null
    return (
      <mesh
        geometry={boxGeo}
        position={[b.cx, elevation + h / 2, b.cz]}
        scale={[b.w, h, b.d]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
      </mesh>
    )
  }
  // Roof geo extends downward from elevation+h
  return (
    <mesh geometry={geo} position={[0, elevation + h, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} side={THREE.DoubleSide} />
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


function FlightMesh({
  a,
  b,
  width,
  rises,
  startElev,
  endElev,
  baseElevation,
}: {
  a: { x: number; y: number }
  b: { x: number; y: number }
  width: number
  rises: number
  startElev: number
  endElev: number
  baseElevation: number
}) {
  const dx = b.x - a.x
  const dz = b.y - a.y
  const len = Math.hypot(dx, dz)
  if (len < 0.05 || rises < 1) return null
  const angle = Math.atan2(dz, dx)
  const totalH = Math.max(0.05, endElev - startElev)
  const riseH = totalH / rises
  const tread = len / rises
  const m = matFor('beton')
  const steps = []
  for (let i = 0; i < rises; i++) {
    const along = tread * (i + 0.5)
    const y = startElev + riseH * (i + 0.5)
    steps.push(
      <mesh
        key={i}
        geometry={boxGeo}
        position={[along - len / 2, y, 0]}
        scale={[Math.max(0.08, tread * 0.95), riseH, width]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
      </mesh>,
    )
  }
  return (
    <group
      position={[(a.x + b.x) / 2, baseElevation, (a.y + b.y) / 2]}
      rotation={[0, -angle, 0]}
    >
      {steps}
      <mesh
        geometry={boxGeo}
        position={[0, startElev + totalH / 2, width / 2 + 0.03]}
        scale={[len, Math.max(0.08, totalH * 0.12), 0.06]}
        castShadow
      >
        <meshStandardMaterial color="#7a848c" roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh
        geometry={boxGeo}
        position={[0, startElev + totalH / 2, -width / 2 - 0.03]}
        scale={[len, Math.max(0.08, totalH * 0.12), 0.06]}
        castShadow
      >
        <meshStandardMaterial color="#7a848c" roughness={0.7} metalness={0.15} />
      </mesh>
    </group>
  )
}

function LandingMesh({
  polygon,
  elevation,
  thickness,
  baseElevation,
}: {
  polygon: { x: number; y: number }[]
  elevation: number
  thickness: number
  baseElevation: number
}) {
  const geo = usePolygonExtrude(polygon, thickness)
  const m = matFor('beton')
  if (!geo) {
    const b = bbox(polygon)
    if (b.w < 0.05 || b.d < 0.05) return null
    return (
      <mesh
        geometry={boxGeo}
        position={[b.cx, baseElevation + elevation - thickness / 2, b.cz]}
        scale={[b.w, thickness, b.d]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
      </mesh>
    )
  }
  return (
    <mesh geometry={geo} position={[0, baseElevation + elevation, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} side={THREE.DoubleSide} />
    </mesh>
  )
}

function StairMesh({ stair, elevation, storyHeight }: { stair: Stair; elevation: number; storyHeight: number }) {
  const s = normalizeStair(stair)
  const pathKey = s.path.map((p) => `${p.x},${p.y}`).join(';')
  const geom = useMemo(
    () => buildStairGeometry(s, storyHeight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathKey, s.width, s.rises, s.rise, s.mode, storyHeight],
  )
  if (geom.flights.length === 0) return null
  return (
    <group>
      {geom.flights.map((f, i) => (
        <FlightMesh
          key={`f-${i}`}
          a={f.a}
          b={f.b}
          width={s.width}
          rises={f.rises}
          startElev={f.startElev}
          endElev={f.endElev}
          baseElevation={elevation}
        />
      ))}
      {geom.landings.map((l, i) => (
        <LandingMesh
          key={`l-${i}`}
          polygon={l.polygon}
          elevation={l.elevation}
          thickness={l.thickness}
          baseElevation={elevation}
        />
      ))}
    </group>
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
        <mesh
          geometry={boxGeo}
          position={[0, item.height * 0.7, -item.depth * 0.35]}
          scale={[item.width, item.height * 0.6, item.depth * 0.25]}
          castShadow
        >
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
  visiting?: boolean
}

export default function BuildingScene({ project, activeStoryId, visiting = false }: Props) {
  const quality = useMemo(() => detectQuality(), [])
  const storyMap = useMemo(() => {
    const m = new Map<string, (typeof project.stories)[0]>()
    for (const s of project.stories) m.set(s.id, s)
    return m
  }, [project.stories])

  const openingsByWall = useMemo(() => {
    const map = new Map<string, Opening[]>()
    for (const o of project.openings) {
      const list = map.get(o.wallId)
      if (list) list.push(o)
      else map.set(o.wallId, [o])
    }
    return map
  }, [project.openings])

  const sunAngle = ((project.meta.lightHour - 6) / 12) * Math.PI
  const sunX = Math.cos(sunAngle) * 40
  const sunY = Math.sin(sunAngle) * 35 + 10
  const sunZ = 20

  const focusStory = activeStoryId ? storyMap.get(activeStoryId) : null

  // Visite: fill interiors (solid walls block sun) without dropping PBR quality
  const ambientI = visiting ? 0.72 : 0.35
  const hemiI = visiting ? 0.55 : 0.35
  const sunI = visiting ? 1.15 : 1.35

  return (
    <group>
      <ambientLight intensity={ambientI} />
      <directionalLight
        castShadow={quality.shadows}
        intensity={sunI}
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
      <hemisphereLight args={['#b8d4e8', '#3a4a3a', hemiI]} />
      {visiting && (
        <pointLight
          intensity={0.85}
          distance={28}
          decay={2}
          color="#cfe8e4"
          position={[0, (focusStory?.elevation ?? 0) + 2.2, 0]}
        />
      )}

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
            <WallMesh
              wall={w}
              openings={openingsByWall.get(w.id) ?? EMPTY_OPENINGS}
              elevation={st.elevation}
              visitMode={visiting}
            />
          </group>
        )
      })}

      {project.columns.map((c) => {
        const st = storyMap.get(c.storyId)
        if (!st) return null
        return <ColumnMesh key={c.id} col={c} elevation={st.elevation} />
      })}

      {project.stairs.map((s) => {
        const st = storyMap.get(s.storyId)
        if (!st) return null
        return (
          <StairMesh
            key={s.id}
            stair={s}
            elevation={st.elevation}
            storyHeight={st.height}
          />
        )
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

