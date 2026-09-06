import { useMemo, useEffect, memo } from 'react'
import * as THREE from 'three'
import { Sky } from '@react-three/drei'
import type { Project, Wall, Slab, Furniture, Column, Roof, Opening, Stair, Railing } from '../../lib/bim/types'
import { wallLength, wallAngle, wallCenter } from '../../lib/bim/types'
import { MATERIALS, FURNITURE_PRESETS } from '../../lib/bim/catalog'
import { detectQuality } from '../../lib/render/quality'
import { useProjectStore } from '../../lib/store/project-store'
import {
  plasterMap,
  concreteMap,
  woodMap,
  tileMap,
  grassMap,
  softShadowMap,
  gridOverlayMap,
} from '../../lib/render/materials'
import { wallSolidBoxes, openingsLocal } from '../../lib/bim/wall-openings'
import { buildStairGeometry, normalizeStair } from '../../lib/cad/stairs'
import {
  buildStairRailingRuns,
  buildPathRailingRun,
  RAILING_POST_SIZE,
  RAILING_RAIL_SIZE,
  type RailingRun,
} from '../../lib/cad/railings'
import { buildRoofGeometry, normalizeRoof, pitchedRidgeHeight } from '../../lib/cad/roofs'

const EMPTY_OPENINGS: Opening[] = []
const boxGeo = new THREE.BoxGeometry(1, 1, 1)

function mapFor(kind?: string, texSize = 256) {
  if (kind === 'plaster') return plasterMap(texSize)
  if (kind === 'concrete') return concreteMap(texSize)
  if (kind === 'wood') return woodMap(texSize)
  if (kind === 'tile') return tileMap(texSize)
  if (kind === 'grass') return grassMap(texSize)
  return null
}

function matFor(id?: string, fallback = 'beton', texSize = 256) {
  const def = MATERIALS[id ?? fallback] ?? MATERIALS[fallback]
  const map = mapFor(def.map, texSize)
  return {
    color: def.color,
    roughness: def.roughness,
    metalness: def.metalness,
    map,
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
            map={m.map}
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
                scale={[innerW, innerH, Math.max(0.018, wall.thickness * 0.18)]}
              >
                <meshPhysicalMaterial
                  color={glassMat.color}
                  roughness={0.05}
                  metalness={0.05}
                  transmission={visitMode ? 0.75 : 0.85}
                  thickness={0.08}
                  ior={1.45}
                  transparent
                  opacity={1}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                  envMapIntensity={1.2}
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
        <meshStandardMaterial color={m.color} map={m.map} roughness={m.roughness} metalness={m.metalness} />
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
      <meshPhysicalMaterial
        color={m.color}
        map={slab.kind === 'pool' ? undefined : m.map}
        roughness={slab.kind === 'pool' ? 0.08 : m.roughness}
        metalness={slab.kind === 'pool' ? 0.25 : m.metalness}
        transparent={slab.kind === 'pool'}
        opacity={slab.kind === 'pool' ? 0.72 : 1}
        transmission={slab.kind === 'pool' ? 0.35 : 0}
        thickness={slab.kind === 'pool' ? 0.4 : 0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function facesToGeometry(faces: { verts: { x: number; y: number; z: number }[] }[]) {
  const positions: number[] = []
  const normals: number[] = []
  const pushTri = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
  ) => {
    const abx = b.x - a.x
    const aby = b.y - a.y
    const abz = b.z - a.z
    const acx = c.x - a.x
    const acy = c.y - a.y
    const acz = c.z - a.z
    let nx = aby * acz - abz * acy
    let ny = abz * acx - abx * acz
    let nz = abx * acy - aby * acx
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl
    ny /= nl
    nz /= nl
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z)
      normals.push(nx, ny, nz)
    }
  }
  for (const f of faces) {
    const v = f.verts
    if (v.length === 3) pushTri(v[0]!, v[1]!, v[2]!)
    else if (v.length >= 4) {
      pushTri(v[0]!, v[1]!, v[2]!)
      pushTri(v[0]!, v[2]!, v[3]!)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return g
}

function RoofMesh({ roof, elevation }: { roof: Roof; elevation: number }) {
  const m = matFor('tuile')
  const nr = normalizeRoof(roof)
  const polyKey = nr.polygon.map((p) => `${p.x},${p.y}`).join(';')
  const geom = useMemo(
    () => buildRoofGeometry(nr),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nr.mode, nr.pitchDeg, nr.ridgeHeight, polyKey],
  )

  // Flat terrace: extruded prism
  const flatH = Math.max(0.15, pitchedRidgeHeight(nr))
  const flatPoly = nr.mode === 'terrasse' ? nr.polygon : nr.polygon.slice(0, 0)
  const flatGeo = usePolygonExtrude(flatPoly, flatH)

  const pitchedGeo = useMemo(() => {
    if (nr.mode === 'terrasse' || geom.faces.length === 0) return null
    return facesToGeometry(geom.faces)
  }, [geom, nr.mode])

  useEffect(() => {
    return () => {
      pitchedGeo?.dispose()
    }
  }, [pitchedGeo])

  if (nr.mode === 'terrasse') {
    if (!flatGeo) {
      const b = bbox(nr.polygon)
      if (b.w < 0.05 || b.d < 0.05) return null
      return (
        <mesh
          geometry={boxGeo}
          position={[b.cx, elevation + flatH / 2, b.cz]}
          scale={[b.w, flatH, b.d]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={m.color} map={m.map} roughness={m.roughness} metalness={m.metalness} />
        </mesh>
      )
    }
    return (
      <mesh geometry={flatGeo} position={[0, elevation + flatH, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={m.color} map={m.map} roughness={m.roughness} metalness={m.metalness} side={THREE.DoubleSide} />
      </mesh>
    )
  }

  if (!pitchedGeo) return null
  return (
    <mesh geometry={pitchedGeo} position={[0, elevation, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={m.color} map={m.map} roughness={m.roughness} metalness={m.metalness} side={THREE.DoubleSide} />
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

function RailingRunMesh({
  run,
  baseElevation,
  materialId = 'acier',
}: {
  run: RailingRun
  baseElevation: number
  materialId?: string
}) {
  const m = matFor(materialId, 'acier')
  const samples = run.samples
  if (samples.length < 2) return null
  const posts = []
  const rails = []
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!
    const y0 = baseElevation + s.elev
    posts.push(
      <mesh
        key={`p-${i}`}
        geometry={boxGeo}
        position={[s.x, y0 + run.height / 2, s.y]}
        scale={[RAILING_POST_SIZE, run.height, RAILING_POST_SIZE]}
        castShadow
      >
        <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
      </mesh>,
    )
    if (i < samples.length - 1) {
      const n = samples[i + 1]!
      const dx = n.x - s.x
      const dz = n.y - s.y
      const L = Math.hypot(dx, dz)
      if (L < 1e-4) continue
      const angle = Math.atan2(dz, dx)
      const midX = (s.x + n.x) / 2
      const midZ = (s.y + n.y) / 2
      const elevA = s.elev
      const elevB = n.elev
      const midElev = (elevA + elevB) / 2
      const pitch = Math.atan2(elevB - elevA, L)
      // top rail
      rails.push(
        <mesh
          key={`rt-${i}`}
          geometry={boxGeo}
          position={[midX, baseElevation + midElev + run.height, midZ]}
          rotation={[0, -angle, pitch]}
          scale={[L, RAILING_RAIL_SIZE, RAILING_RAIL_SIZE]}
          castShadow
        >
          <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
        </mesh>,
      )
      // mid rail
      rails.push(
        <mesh
          key={`rm-${i}`}
          geometry={boxGeo}
          position={[midX, baseElevation + midElev + run.height * 0.5, midZ]}
          rotation={[0, -angle, pitch]}
          scale={[L, RAILING_RAIL_SIZE * 0.85, RAILING_RAIL_SIZE * 0.85]}
          castShadow
        >
          <meshStandardMaterial color={m.color} roughness={m.roughness} metalness={m.metalness} />
        </mesh>,
      )
    }
  }
  return (
    <group>
      {posts}
      {rails}
    </group>
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
  const railRuns = useMemo(
    () => buildStairRailingRuns(stair, storyHeight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathKey, s.width, s.rises, s.rise, stair.railings, stair.railingHeight, storyHeight],
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
      {railRuns.map((run, i) => (
        <RailingRunMesh key={`rail-${i}`} run={run} baseElevation={elevation} materialId="acier" />
      ))}
    </group>
  )
}

function StandaloneRailingMesh({ railing, elevation }: { railing: Railing; elevation: number }) {
  const run = useMemo(() => buildPathRailingRun(railing), [railing])
  if (!run) return null
  return (
    <RailingRunMesh
      run={run}
      baseElevation={elevation}
      materialId={railing.materialId ?? 'acier'}
    />
  )
}

function FurnitureMesh({ item, elevation }: { item: Furniture; elevation: number }) {
  const preset = FURNITURE_PRESETS[item.kind]
  const color = preset?.color ?? '#666'
  const isCore = item.kind === 'elevator' || item.kind === 'staircore'
  const wood = woodMap(256)
  const w = item.width
  const d = item.depth
  const h = item.height

  return (
    <group position={[item.position.x, elevation, item.position.y]} rotation={[0, item.rotation, 0]}>
      {item.kind === 'sofa' && (
        <>
          <mesh geometry={boxGeo} position={[0, h * 0.28, 0]} scale={[w, h * 0.45, d]} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.72} metalness={0} />
          </mesh>
          <mesh geometry={boxGeo} position={[0, h * 0.72, -d * 0.38]} scale={[w, h * 0.7, d * 0.22]} castShadow>
            <meshStandardMaterial color={color} roughness={0.7} metalness={0} />
          </mesh>
          <mesh geometry={boxGeo} position={[-w * 0.42, h * 0.55, 0]} scale={[w * 0.12, h * 0.55, d * 0.9]} castShadow>
            <meshStandardMaterial color={color} roughness={0.7} metalness={0} />
          </mesh>
          <mesh geometry={boxGeo} position={[w * 0.42, h * 0.55, 0]} scale={[w * 0.12, h * 0.55, d * 0.9]} castShadow>
            <meshStandardMaterial color={color} roughness={0.7} metalness={0} />
          </mesh>
        </>
      )}
      {item.kind === 'table' && (
        <>
          <mesh geometry={boxGeo} position={[0, h * 0.92, 0]} scale={[w, h * 0.08, d]} castShadow receiveShadow>
            <meshStandardMaterial color={color} map={wood} roughness={0.5} metalness={0} />
          </mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} geometry={boxGeo} position={[sx * w * 0.4, h * 0.42, sz * d * 0.38]} scale={[0.07, h * 0.84, 0.07]} castShadow>
              <meshStandardMaterial color="#4a3420" roughness={0.65} />
            </mesh>
          ))}
        </>
      )}
      {item.kind === 'bed' && (
        <>
          <mesh geometry={boxGeo} position={[0, h * 0.35, 0]} scale={[w, h * 0.45, d]} castShadow receiveShadow>
            <meshStandardMaterial color="#5a6574" roughness={0.75} />
          </mesh>
          <mesh geometry={boxGeo} position={[0, h * 0.72, 0]} scale={[w * 0.95, h * 0.28, d * 0.92]} castShadow>
            <meshStandardMaterial color="#d7dde6" roughness={0.85} />
          </mesh>
          <mesh geometry={boxGeo} position={[0, h * 0.85, -d * 0.38]} scale={[w * 0.9, h * 0.35, d * 0.18]} castShadow>
            <meshStandardMaterial color="#eef2f7" roughness={0.8} />
          </mesh>
        </>
      )}
      {item.kind === 'chair' && (
        <>
          <mesh geometry={boxGeo} position={[0, h * 0.42, 0]} scale={[w, 0.06, d]} castShadow>
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh geometry={boxGeo} position={[0, h * 0.72, -d * 0.4]} scale={[w, h * 0.5, 0.05]} castShadow>
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} geometry={boxGeo} position={[sx * w * 0.35, h * 0.2, sz * d * 0.35]} scale={[0.04, h * 0.4, 0.04]} castShadow>
              <meshStandardMaterial color={color} roughness={0.55} />
            </mesh>
          ))}
        </>
      )}
      {item.kind === 'kitchen' && (
        <>
          <mesh geometry={boxGeo} position={[0, h * 0.45, 0]} scale={[w, h * 0.9, d]} castShadow receiveShadow>
            <meshStandardMaterial color="#e8edf2" roughness={0.45} metalness={0.1} />
          </mesh>
          <mesh geometry={boxGeo} position={[0, h * 0.92, 0]} scale={[w * 1.02, 0.04, d * 1.05]} castShadow>
            <meshStandardMaterial color="#c5ccd4" roughness={0.35} metalness={0.35} />
          </mesh>
        </>
      )}
      {item.kind === 'desk' && (
        <>
          <mesh geometry={boxGeo} position={[0, h * 0.92, 0]} scale={[w, 0.05, d]} castShadow>
            <meshStandardMaterial color={color} map={wood} roughness={0.5} />
          </mesh>
          <mesh geometry={boxGeo} position={[-w * 0.42, h * 0.45, 0]} scale={[0.06, h * 0.9, d * 0.9]} castShadow>
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
          <mesh geometry={boxGeo} position={[w * 0.42, h * 0.45, 0]} scale={[0.06, h * 0.9, d * 0.9]} castShadow>
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
        </>
      )}
      {item.kind === 'tree' && (
        <>
          <mesh geometry={boxGeo} position={[0, h * 0.28, 0]} scale={[0.22, h * 0.55, 0.22]} castShadow>
            <meshStandardMaterial color="#5a3a1a" map={wood} roughness={0.9} />
          </mesh>
          <mesh geometry={boxGeo} position={[0, h * 0.72, 0]} scale={[w * 0.85, h * 0.45, d * 0.85]} castShadow>
            <meshStandardMaterial color="#2f5d2e" roughness={0.95} />
          </mesh>
          <mesh geometry={boxGeo} position={[0.25, h * 0.88, 0.15]} scale={[w * 0.55, h * 0.28, d * 0.55]} castShadow>
            <meshStandardMaterial color="#3a6e38" roughness={0.95} />
          </mesh>
        </>
      )}
      {item.kind === 'car' && (
        <>
          <mesh geometry={boxGeo} position={[0, h * 0.35, 0]} scale={[w, h * 0.45, d]} castShadow>
            <meshStandardMaterial color={color} roughness={0.35} metalness={0.55} />
          </mesh>
          <mesh geometry={boxGeo} position={[0, h * 0.7, -d * 0.05]} scale={[w * 0.7, h * 0.35, d * 0.7]} castShadow>
            <meshStandardMaterial color="#9ec4d8" roughness={0.15} metalness={0.2} transparent opacity={0.65} />
          </mesh>
        </>
      )}
      {(isCore || !['sofa', 'table', 'bed', 'chair', 'kitchen', 'desk', 'tree', 'car'].includes(item.kind)) && (
        <mesh geometry={boxGeo} position={[0, h / 2, 0]} scale={[w, h, d]} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={isCore ? 0.45 : 0.7} metalness={isCore ? 0.45 : 0.05} />
        </mesh>
      )}
    </group>
  )
}

const FurnitureMeshMemo = memo(FurnitureMesh)

type Props = {
  project: Project
  activeStoryId: string | null
  visiting?: boolean
}

export default function BuildingScene({ project, activeStoryId, visiting = false }: Props) {
  const quality = useMemo(() => detectQuality(), [])
  const layers = useProjectStore((s) => s.layers)
  const phase4d = useProjectStore((s) => s.phase4d)
  const storyVisible = (storyIndex: number, total: number) => {
    if (total <= 0) return true
    const built = Math.max(1, Math.round(phase4d * total))
    return storyIndex < built
  }
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
  const ambientI = visiting ? 0.62 : 0.28
  const hemiI = visiting ? 0.58 : 0.42
  const sunI = visiting ? 1.2 : 1.55
  const grass = useMemo(() => {
    const t = grassMap(quality.texSize)
    t.repeat.set(quality.groundSize / 8, quality.groundSize / 8)
    return t
  }, [quality.texSize, quality.groundSize])
  const grid = useMemo(() => {
    const t = gridOverlayMap(512)
    t.repeat.set(quality.groundSize / 20, quality.groundSize / 20)
    return t
  }, [quality.groundSize])
  const blob = useMemo(() => softShadowMap(256), [])
  const footprint = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const w of project.walls) {
      minX = Math.min(minX, w.a.x, w.b.x)
      maxX = Math.max(maxX, w.a.x, w.b.x)
      minZ = Math.min(minZ, w.a.y, w.b.y)
      maxZ = Math.max(maxZ, w.a.y, w.b.y)
    }
    if (!Number.isFinite(minX)) return { cx: 0, cz: 0, sx: 18, sz: 18 }
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      sx: Math.max(8, (maxX - minX) * 1.35),
      sz: Math.max(8, (maxZ - minZ) * 1.35),
    }
  }, [project.walls])

  return (
    <group>
      <Sky
        distance={450000}
        sunPosition={[sunX, Math.max(12, sunY), sunZ]}
        inclination={0.52}
        azimuth={0.22}
        mieCoefficient={0.004}
        mieDirectionalG={0.85}
        rayleigh={1.1}
        turbidity={4.5}
      />
      <ambientLight intensity={ambientI} color="#e8f2f6" />
      <directionalLight
        castShadow={quality.shadows}
        intensity={sunI}
        position={[sunX, Math.max(10, sunY), sunZ]}
        color="#fff2df"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={140}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.00015}
        shadow-normalBias={0.03}
      />
      <directionalLight intensity={0.28} position={[-sunX * 0.4, 18, -sunZ * 0.5]} color="#a8c8e8" />
      <hemisphereLight args={['#c8dff0', '#3d4a34', hemiI]} />
      {visiting && (
        <pointLight
          intensity={0.9}
          distance={30}
          decay={2}
          color="#d8efe8"
          position={[0, (focusStory?.elevation ?? 0) + 2.25, 0]}
        />
      )}

      {/* Landscape ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[quality.groundSize, quality.groundSize]} />
        <meshStandardMaterial color="#3a5236" map={grass} roughness={0.96} metalness={0} />
      </mesh>

      {/* Subtle grid overlay (non-shadow) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[quality.groundSize, quality.groundSize]} />
        <meshBasicMaterial map={grid} transparent opacity={0.55} depthWrite={false} />
      </mesh>

      {/* Parcel lawn */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[project.meta.parcelWidth, project.meta.parcelDepth]} />
        <meshStandardMaterial color="#2f4630" roughness={0.92} metalness={0} />
      </mesh>

      {/* Soft contact shadow blob — ground only, avoids wall artifacts */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[footprint.cx, 0.02, footprint.cz]}>
        <planeGeometry args={[footprint.sx, footprint.sz]} />
        <meshBasicMaterial map={blob} transparent opacity={0.85} depthWrite={false} />
      </mesh>

      {layers.slabs &&
        project.slabs.map((s) => {
          const st = storyMap.get(s.storyId)
          if (!st || !storyVisible(st.index, project.stories.length)) return null
          return <SlabMesh key={s.id} slab={s} />
        })}

      {layers.walls &&
        project.walls.map((w) => {
          const st = storyMap.get(w.storyId)
          if (!st || !storyVisible(st.index, project.stories.length)) return null
          return (
            <group key={w.id}>
              <WallMesh
                wall={w}
                openings={layers.openings ? openingsByWall.get(w.id) ?? EMPTY_OPENINGS : EMPTY_OPENINGS}
                elevation={st.elevation}
                visitMode={visiting}
              />
            </group>
          )
        })}

      {layers.columns &&
        project.columns.map((c) => {
          const st = storyMap.get(c.storyId)
          if (!st || !storyVisible(st.index, project.stories.length)) return null
          return <ColumnMesh key={c.id} col={c} elevation={st.elevation} />
        })}

      {layers.stairs &&
        project.stairs.map((s) => {
          const st = storyMap.get(s.storyId)
          if (!st || !storyVisible(st.index, project.stories.length)) return null
          return (
            <StairMesh
              key={s.id}
              stair={s}
              elevation={st.elevation}
              storyHeight={st.height}
            />
          )
        })}

      {layers.furniture &&
        project.furniture.map((f) => {
          const st = storyMap.get(f.storyId)
          if (!st || !storyVisible(st.index, project.stories.length)) return null
          return <FurnitureMeshMemo key={f.id} item={f} elevation={st.elevation} />
        })}

      {layers.roofs &&
        project.roofs.map((r) => {
          const st = storyMap.get(r.storyId)
          if (!st || !storyVisible(st.index, project.stories.length)) return null
          return <RoofMesh key={r.id} roof={r} elevation={st.elevation + st.height} />
        })}

      {layers.railings &&
        (project.railings ?? []).map((r) => {
          const st = storyMap.get(r.storyId)
          if (!st || !storyVisible(st.index, project.stories.length)) return null
          return <StandaloneRailingMesh key={r.id} railing={r} elevation={st.elevation} />
        })}
    </group>
  )
}

