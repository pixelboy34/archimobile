import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OBJECT_MESH } from "@/lib/bim/catalog";
import { MATERIAL_CATALOG, resolveMaterial } from "@/lib/bim/materials";
import { createStyledMaterial, syncMaterial } from "@/lib/render/world-material";
import {
  boundsOf,
  lerp,
  polygonCentroid,
  wallAngle,
  wallNormalOffset,
  wallSolidSegments,
} from "@/lib/bim/geometry";
import { storyDistance, type RenderQuality } from "@/lib/render/quality";
import { furniturePhase, visibleAt } from "@/lib/bim/construction";
import { isBearingWall } from "@/lib/bim/structure";
import type {
  Furniture,
  MaterialId,
  MaterialStyles,
  Opening,
  Project,
  Roof,
  Stair,
  Wall,
} from "@/lib/bim/types";

type MatMap = Record<MaterialId, THREE.Material>;

const labelCache = new Map<string, THREE.CanvasTexture>();

function labelTexture(text: string) {
  const hit = labelCache.get(text);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = "rgba(12,12,11,0.72)";
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(8, 10, 240, 44, 8);
    ctx.fill();
  } else {
    ctx.fillRect(8, 10, 240, 44);
  }
  ctx.fillStyle = "#e8e4d9";
  ctx.font = "600 22px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 22), 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(text, t);
  return t;
}

const skipRaycast = () => {};
const dummy = new THREE.Object3D();

function pickMat(mats: MatMap, id: MaterialId | undefined): THREE.Material {
  return (id && mats[id]) || mats.plaster || Object.values(mats)[0]!;
}

function useSharedResources(
  lambert: boolean,
  overrides: MaterialStyles | undefined,
  texSize: number,
) {
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const cyl = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 20), []);
  const sph = useMemo(() => new THREE.SphereGeometry(0.5, 18, 14), []);
  const styleKey = JSON.stringify(overrides ?? {});
  const mats = useMemo(() => {
    const out = {} as MatMap;
    for (const id of Object.keys(MATERIAL_CATALOG) as MaterialId[]) {
      out[id] = createStyledMaterial(resolveMaterial(id, overrides), lambert, texSize);
    }
    return out;
  }, [lambert, texSize]);
  useLayoutEffect(() => {
    for (const id of Object.keys(MATERIAL_CATALOG) as MaterialId[]) {
      syncMaterial(mats[id]!, resolveMaterial(id, overrides), texSize);
    }
  }, [mats, styleKey, texSize, overrides]);
  const select = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color: "#6ed0c3",
        emissive: "#6ed0c3",
        emissiveIntensity: 0.38,
      }),
    [],
  );
  useEffect(
    () => () => {
      box.dispose();
      cyl.dispose();
      sph.dispose();
      select.dispose();
      for (const m of Object.values(mats)) m.dispose();
    },
    [box, cyl, sph, mats, select],
  );
  return { box, cyl, sph, mats, select };
}

function storyElev(project: Project, storyId: string): number {
  return project.stories.find((s) => s.id === storyId)?.elevation ?? 0;
}

function glazingLook(glazing: Opening["glazing"]): { color: string; opacity: number; layers: number } {
  if (glazing === "single") return { color: "#b7dceb", opacity: 0.32, layers: 1 };
  if (glazing === "triple") return { color: "#5f8fa8", opacity: 0.58, layers: 3 };
  return { color: "#86b6c8", opacity: 0.45, layers: 2 };
}

function WallGroup({
  wall,
  openings,
  elev,
  selected,
  onSelect,
  box,
  mats,
  selectMat,
  shadows,
  structureMode,
  structMat,
  ghostMat,
}: {
  wall: Wall;
  openings: Opening[];
  elev: number;
  selected: boolean;
  onSelect: (id: string) => void;
  box: THREE.BoxGeometry;
  mats: MatMap;
  selectMat: THREE.Material;
  shadows: boolean;
  structureMode?: boolean;
  structMat: THREE.Material;
  ghostMat: THREE.Material;
}) {
  const segs = wallSolidSegments(wall, openings);
  const angle = wallAngle(wall);
  const bearing = isBearingWall(wall);
  const material = selected
    ? selectMat
    : structureMode
      ? bearing
        ? structMat
        : ghostMat
      : pickMat(mats, wall.materialId);
  const base = wall.baseOffset ?? 0;
  const n = wallNormalOffset(wall);
  const unitN = { x: Math.sin(angle), y: -Math.cos(angle) };
  const insM = Math.max(0, (wall.insulationMm ?? 0) / 1000);
  const fire = wall.fireRating && wall.fireRating !== "none";
  return (
    <group>
      {segs.map((seg, i) => {
        const mid = lerp(seg.a, seg.b, 0.5);
        const cx = mid.x + n.x;
        const cz = mid.y + n.y;
        return (
          <group key={`${wall.id}-${i}`}>
            <mesh
              geometry={box}
              material={material}
              position={[cx, elev + base + wall.height / 2, cz]}
              rotation={[0, -angle, 0]}
              scale={[seg.length, wall.height, wall.thickness]}
              castShadow={shadows}
              receiveShadow={shadows}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(wall.id);
              }}
            />
            {insM > 0.004 && (
              <mesh
                geometry={box}
                position={[
                  cx - unitN.x * (wall.thickness / 2 + insM / 2),
                  elev + base + wall.height / 2,
                  cz - unitN.y * (wall.thickness / 2 + insM / 2),
                ]}
                rotation={[0, -angle, 0]}
                scale={[seg.length * 0.98, wall.height * 0.96, Math.max(0.02, insM)]}
                raycast={skipRaycast}
                castShadow={false}
              >
                <meshLambertMaterial color="#d8c48a" transparent opacity={0.55} depthWrite={false} />
              </mesh>
            )}
            {(wall.role === "exterior" || wall.role === "party") && !structureMode && !selected && (
              <mesh
                geometry={box}
                position={[
                  cx + unitN.x * (wall.thickness / 2 + 0.012),
                  elev + base + wall.height / 2,
                  cz + unitN.y * (wall.thickness / 2 + 0.012),
                ]}
                rotation={[0, -angle, 0]}
                scale={[seg.length * 0.995, wall.height * 0.98, 0.024]}
                raycast={skipRaycast}
                castShadow={false}
              >
                <meshLambertMaterial
                  color={wall.role === "exterior" ? "#6ed0c3" : "#c4a06a"}
                  transparent
                  opacity={wall.role === "exterior" ? 0.28 : 0.22}
                  depthWrite={false}
                />
              </mesh>
            )}

            {bearing && !structureMode && !selected && (
              <mesh
                geometry={box}
                position={[cx, elev + base + wall.height - 0.05, cz]}
                rotation={[0, -angle, 0]}
                scale={[seg.length, 0.09, wall.thickness + 0.03]}
                raycast={skipRaycast}
              >
                <meshLambertMaterial color="#a67c5d" emissive="#3a2218" emissiveIntensity={0.18} />
              </mesh>
            )}
            {fire && (
              <mesh
                geometry={box}
                position={[cx, elev + base + wall.height - 0.02, cz]}
                rotation={[0, -angle, 0]}
                scale={[seg.length, 0.035, wall.thickness + 0.05]}
                raycast={skipRaycast}
              >
                <meshLambertMaterial color="#c45c4a" emissive="#4a1810" emissiveIntensity={0.22} />
              </mesh>
            )}
          </group>
        );
      })}
      {openings
        .filter((o) => o.wallId === wall.id)
        .map((o) => {
          const p = lerp(wall.a, wall.b, o.t);
          const y = elev + base + o.sill + o.height / 2;
          const frame = o.frame ?? 0.06;
          const frameMat = pickMat(mats, o.kind === "door" ? "darkwood" : "metal");
          const fillMat = pickMat(
            mats,
            o.kind === "window" || o.variant === "french" ? "glass" : "darkwood",
          );
          const leaves = o.variant === "double" || o.width > 1.45 ? 2 : 1;
          const win = o.kind === "window" || o.variant === "french";
          const glaze = glazingLook(o.glazing);
          const swingDir = o.swing === "right" ? 1 : -1;
          return (
            <group key={o.id} position={[p.x + n.x, 0, p.y + n.y]} rotation={[0, -angle, 0]}>
              <mesh
                geometry={box}
                material={frameMat}
                position={[0, y, 0]}
                scale={[o.width + frame * 2, o.height + frame * 2, wall.thickness + 0.04]}
                castShadow={shadows}
                raycast={skipRaycast}
              />
              {win
                ? Array.from({ length: leaves }, (_, i) => (
                    <mesh
                      key={i}
                      geometry={box}
                      position={[
                        leaves === 1 ? 0 : i === 0 ? -o.width * 0.25 : o.width * 0.25,
                        y,
                        wall.thickness * 0.08,
                      ]}
                      scale={[
                        o.width / leaves - 0.03,
                        o.height - 0.02,
                        wall.thickness * 0.22,
                      ]}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(o.id);
                      }}
                    >
                      <meshLambertMaterial
                        color={glaze.color}
                        transparent
                        opacity={glaze.opacity}
                        depthWrite={false}
                      />
                    </mesh>
                  ))
                : Array.from({ length: leaves }, (_, i) => (
                    <mesh
                      key={i}
                      geometry={box}
                      material={fillMat}
                      position={[
                        leaves === 1 ? 0 : i === 0 ? -o.width * 0.25 : o.width * 0.25,
                        y,
                        wall.thickness * 0.08,
                      ]}
                      scale={[
                        o.width / leaves - 0.03,
                        o.height - 0.02,
                        wall.thickness * 0.18,
                      ]}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(o.id);
                      }}
                    />
                  ))}
              {win &&
                Array.from({ length: Math.max(0, glaze.layers - 1) }, (_, li) => (
                  <mesh
                    key={`pane-${li}`}
                    geometry={box}
                    position={[0, y, wall.thickness * (0.02 + li * 0.05)]}
                    scale={[o.width * 0.92, o.height * 0.9, 0.012]}
                    raycast={skipRaycast}
                  >
                    <meshLambertMaterial
                      color={glaze.color}
                      transparent
                      opacity={0.18 + li * 0.08}
                      depthWrite={false}
                    />
                  </mesh>
                ))}
              {!win && (
                <group
                  position={[swingDir * (-o.width / 2), y, wall.thickness * 0.2]}
                  rotation={[0, swingDir * 0.95, 0]}
                >
                  <mesh
                    geometry={box}
                    material={fillMat}
                    position={[swingDir * (o.width / 2 - 0.01), 0, 0]}
                    scale={[o.width - 0.04, o.height - 0.04, 0.045]}
                    castShadow={shadows}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(o.id);
                    }}
                  />
                </group>
              )}
              {win && (
                <>
                <mesh
                  geometry={box}
                  material={frameMat}
                  position={[0, y, wall.thickness * 0.12]}
                  scale={[0.03, o.height, wall.thickness * 0.28]}
                  raycast={skipRaycast}
                />
                <mesh
                  geometry={box}
                  material={frameMat}
                  position={[0, y, wall.thickness * 0.12]}
                  scale={[o.width, 0.03, wall.thickness * 0.28]}
                  raycast={skipRaycast}
                />
                </>
              )}
              <mesh
                geometry={box}
                material={frameMat}
                position={[0, elev + base + o.sill - 0.03, wall.thickness * 0.35]}
                scale={[o.width + frame * 2.4, 0.05, 0.12]}
                raycast={skipRaycast}
              />
              {o.shutter && (
                <mesh
                  geometry={box}
                  material={pickMat(mats, "darkwood")}
                  position={[o.width * 0.58, y, wall.thickness * 0.75]}
                  scale={[0.08, o.height, 0.04]}
                  raycast={skipRaycast}
                />
              )}
            </group>
          );
        })}
    </group>
  );
}

function SlabMesh({
  id,
  polygon,
  thickness,
  y,
  material,
  outdoor,
  shadows,
  onSelect,
}: {
  id: string;
  polygon: { x: number; y: number }[];
  thickness: number;
  y: number;
  material: THREE.Material;
  outdoor?: boolean;
  shadows: boolean;
  onSelect: (id: string) => void;
}) {
  const geom = useMemo(() => {
    if (polygon.length < 3) return new THREE.BoxGeometry(1, thickness, 1);
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0]!.x, polygon[0]!.y);
    for (let i = 1; i < polygon.length; i++) shape.lineTo(polygon[i]!.x, polygon[i]!.y);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y - thickness, 0);
    return g;
  }, [polygon, thickness, y]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh
      geometry={geom}
      material={material}
      receiveShadow={shadows}
      castShadow={shadows && !outdoor}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
    />
  );
}

function GableRoofMesh({
  roof,
  elev,
  box,
  material,
  shadows,
  onSelect,
}: {
  roof: Roof;
  elev: number;
  box: THREE.BoxGeometry;
  material: THREE.Material;
  shadows: boolean;
  onSelect: (id: string) => void;
}) {
  const b = boundsOf(roof.polygon);
  const w = b.max.x - b.min.x + roof.overhang * 2;
  const d = b.max.y - b.min.y + roof.overhang * 2;
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.y + b.max.y) / 2;
  const alongX = w >= d;
  const half = (alongX ? d : w) / 2;
  const rise = Math.tan((roof.pitch * Math.PI) / 180) * half;
  const hypot = Math.hypot(half, rise);
  const pitch = Math.atan2(rise, half);
  const len = alongX ? w : d;
  const shadow = {
    castShadow: shadows,
    receiveShadow: shadows,
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(roof.id);
    },
  };

  if (roof.kind === "flat") {
    return (
      <mesh
        geometry={box}
        material={material}
        position={[cx, elev + roof.thickness / 2, cz]}
        scale={[w, roof.thickness, d]}
        {...shadow}
      />
    );
  }

  if (roof.kind === "shed") {
    const hypotS = Math.hypot(alongX ? d : w, rise);
    return (
      <mesh
        geometry={box}
        material={material}
        position={[cx, elev + rise / 2, cz]}
        rotation={alongX ? [pitch / 2, 0, 0] : [0, 0, -pitch / 2]}
        scale={alongX ? [w, roof.thickness, hypotS] : [hypotS, roof.thickness, d]}
        {...shadow}
      />
    );
  }

  if (roof.kind === "hip") {
    return (
      <group position={[cx, elev, cz]}>
        <mesh
          geometry={box}
          material={material}
          position={[0, rise / 2, 0]}
          scale={[w * 0.55, roof.thickness, d * 0.55]}
          {...shadow}
        />
        <mesh
          geometry={box}
          material={material}
          position={alongX ? [0, rise / 2, -half / 2] : [-half / 2, rise / 2, 0]}
          rotation={alongX ? [pitch, 0, 0] : [0, 0, -pitch]}
          scale={alongX ? [len * 0.85, roof.thickness, hypot] : [hypot, roof.thickness, len * 0.85]}
          {...shadow}
        />
        <mesh
          geometry={box}
          material={material}
          position={alongX ? [0, rise / 2, half / 2] : [half / 2, rise / 2, 0]}
          rotation={alongX ? [-pitch, 0, 0] : [0, 0, pitch]}
          scale={alongX ? [len * 0.85, roof.thickness, hypot] : [hypot, roof.thickness, len * 0.85]}
          {...shadow}
        />
      </group>
    );
  }

  return (
    <group position={[cx, elev, cz]}>
      <mesh
        geometry={box}
        material={material}
        position={alongX ? [0, rise / 2, -half / 2] : [-half / 2, rise / 2, 0]}
        rotation={alongX ? [pitch, 0, 0] : [0, 0, -pitch]}
        scale={alongX ? [len, roof.thickness, hypot] : [hypot, roof.thickness, len]}
        {...shadow}
      />
      <mesh
        geometry={box}
        material={material}
        position={alongX ? [0, rise / 2, half / 2] : [half / 2, rise / 2, 0]}
        rotation={alongX ? [-pitch, 0, 0] : [0, 0, pitch]}
        scale={alongX ? [len, roof.thickness, hypot] : [hypot, roof.thickness, len]}
        {...shadow}
      />
    </group>
  );
}

function FurnitureMesh({
  item,
  elev,
  selected,
  onSelect,
  box,
  cyl,
  sph,
  mats,
  selectMat,
  shadows,
  simple = false,
}: {
  item: Furniture;
  elev: number;
  selected: boolean;
  onSelect: (id: string) => void;
  box: THREE.BoxGeometry;
  cyl: THREE.CylinderGeometry;
  sph: THREE.SphereGeometry;
  mats: MatMap;
  selectMat: THREE.Material;
  shadows: boolean;
  simple?: boolean;
}) {
  const pick = {
    castShadow: shadows,
    receiveShadow: shadows,
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(item.id);
    },
  };
  const deco = { castShadow: shadows, receiveShadow: shadows, raycast: skipRaycast };
  const def = OBJECT_MESH[item.kind] ?? { style: "box" as const, mat: "wood" as const };
  const body = selected ? selectMat : pickMat(mats, def.mat);
  if (simple) {
    const { w, d, h } = item;
    return (
      <group position={[item.position.x, elev, item.position.y]} rotation={[0, item.rotation, 0]}>
        <mesh geometry={box} material={body} position={[0, h / 2, 0]} scale={[w, h, d]} {...pick} />
      </group>
    );
  }
  const wood = selected ? selectMat : pickMat(mats, "wood");
  const dark = pickMat(mats, "darkwood");
  const white = selected ? selectMat : pickMat(mats, "white");
  const glass = pickMat(mats, "glass");
  const veg = pickMat(mats, "vegetation");
  const stone = pickMat(mats, "stone");
  const metal = pickMat(mats, "metal");
  const k = def.style;
  const { w, d, h } = item;
  const leg = (x: number, z: number, hh = h * 0.92, t = 0.05) => (
    <mesh geometry={box} material={wood} position={[x, hh / 2, z]} scale={[t, hh, t]} {...deco} />
  );
  return (
    <group position={[item.position.x, elev, item.position.y]} rotation={[0, item.rotation, 0]}>
      {k === "sofa" && (
        <>
          <mesh geometry={box} material={body} position={[0, h * 0.32, 0]} scale={[w * 0.92, h * 0.42, d * 0.88]} {...pick} />
          <mesh geometry={box} material={body} position={[0, h * 0.72, -d * 0.36]} scale={[w, h * 0.72, 0.16]} {...deco} />
          <mesh geometry={box} material={body} position={[-w * 0.46, h * 0.48, 0]} scale={[0.12, h * 0.55, d]} {...deco} />
          <mesh geometry={box} material={body} position={[w * 0.46, h * 0.48, 0]} scale={[0.12, h * 0.55, d]} {...deco} />
          <mesh geometry={box} material={white} position={[-w * 0.2, h * 0.56, d * 0.05]} scale={[w * 0.38, 0.08, d * 0.5]} {...deco} />
          <mesh geometry={box} material={white} position={[w * 0.2, h * 0.56, d * 0.05]} scale={[w * 0.38, 0.08, d * 0.5]} {...deco} />
        </>
      )}
      {k === "chair" && (
        <>
          <mesh geometry={box} material={wood} position={[0, 0.46, 0]} scale={[w, 0.05, d]} {...pick} />
          <mesh geometry={box} material={wood} position={[0, 0.78, -d * 0.42]} scale={[w, 0.7, 0.05]} {...deco} />
          {leg(-w * 0.38, -d * 0.38, 0.44)}
          {leg(w * 0.38, -d * 0.38, 0.44)}
          {leg(-w * 0.38, d * 0.38, 0.44)}
          {leg(w * 0.38, d * 0.38, 0.44)}
        </>
      )}
      {k === "table" && (
        <>
          <mesh geometry={box} material={wood} position={[0, h, 0]} scale={[w, 0.05, d]} {...pick} />
          {leg(-w * 0.42, -d * 0.4, h)}
          {leg(w * 0.42, -d * 0.4, h)}
          {leg(-w * 0.42, d * 0.4, h)}
          {leg(w * 0.42, d * 0.4, h)}
        </>
      )}
      {k === "bed" && (
        <>
          <mesh geometry={box} material={dark} position={[0, 0.12, 0]} scale={[w + 0.1, 0.18, d + 0.1]} {...pick} />
          <mesh geometry={box} material={white} position={[0, 0.32, 0.05]} scale={[w, 0.22, d * 0.92]} {...deco} />
          <mesh geometry={box} material={body} position={[0, 0.72, -d * 0.46]} scale={[w + 0.08, 0.9, 0.08]} {...deco} />
          <mesh geometry={box} material={white} position={[-w * 0.22, 0.5, -d * 0.32]} scale={[0.38, 0.12, 0.28]} {...deco} />
          <mesh geometry={box} material={white} position={[w * 0.22, 0.5, -d * 0.32]} scale={[0.38, 0.12, 0.28]} {...deco} />
        </>
      )}
      {k === "cabinet" && (
        <>
          <mesh geometry={box} material={body} position={[0, h / 2, 0]} scale={[w, h, d]} {...pick} />
          <mesh geometry={box} material={dark} position={[0, h * 0.52, d * 0.48]} scale={[0.01, h * 0.7, 0.02]} {...deco} />
          <mesh geometry={box} material={stone} position={[0, h + 0.015, 0]} scale={[w + 0.04, 0.03, d + 0.04]} {...deco} />
        </>
      )}
      {k === "appliance" && (
        <>
          <mesh geometry={box} material={metal} position={[0, h / 2, 0]} scale={[w, h, d]} {...pick} />
          <mesh geometry={box} material={glass} position={[0, h * 0.62, d * 0.48]} scale={[w * 0.72, h * 0.38, 0.02]} {...deco} />
        </>
      )}
      {k === "box" && (
        <mesh geometry={box} material={body} position={[0, h / 2, 0]} scale={[w, h, d]} {...pick} />
      )}
      {k === "sanitary" && item.kind === "shower" && (
        <>
          <mesh geometry={box} material={stone} position={[0, 0.03, 0]} scale={[w, 0.06, d]} {...pick} />
          <mesh geometry={box} material={glass} position={[0, h / 2, -d / 2]} scale={[w, h, 0.03]} {...deco} />
          <mesh geometry={box} material={metal} position={[w * 0.35, h * 0.7, 0]} scale={[0.04, h * 0.4, 0.04]} {...deco} />
        </>
      )}
      {k === "sanitary" && item.kind !== "shower" && (
        <>
          <mesh
            geometry={item.kind === "toilet" ? cyl : box}
            material={white}
            position={[0, Math.min(h, 0.42) / 2 + (item.kind === "basin" ? 0.72 : 0), 0]}
            scale={item.kind === "toilet" ? [w, Math.min(h, 0.42), d] : [w, Math.min(h, 0.42), d]}
            {...pick}
          />
          {item.kind === "basin" && (
            <mesh geometry={box} material={dark} position={[0, 0.4, 0]} scale={[0.08, 0.8, 0.08]} {...deco} />
          )}
        </>
      )}
      {k === "lamp" && (
        <>
          <mesh geometry={cyl} material={dark} position={[0, h * 0.4, 0]} scale={[0.08, h * 0.8, 0.08]} {...pick} />
          <mesh geometry={cyl} material={white} position={[0, h * 0.88, 0]} scale={[0.38, 0.22, 0.38]} {...deco} />
        </>
      )}
      {k === "screen" && (
        <>
          <mesh geometry={box} material={metal} position={[0, h * 0.12, 0]} scale={[w * 0.35, 0.06, d * 1.4]} {...pick} />
          <mesh geometry={box} material={metal} position={[0, h * 0.45, 0]} scale={[0.06, h * 0.55, 0.06]} {...deco} />
          <mesh geometry={box} material={pickMat(mats, "metal")} position={[0, h * 0.85, 0]} scale={[w, h * 0.62, Math.max(d, 0.05)]} {...deco} />
          <mesh geometry={box} material={glass} position={[0, h * 0.85, d * 0.4]} scale={[w * 0.92, h * 0.54, 0.02]} {...deco} />
        </>
      )}
      {k === "plant" && (
        <>
          <mesh geometry={cyl} material={stone} position={[0, 0.18, 0]} scale={[0.32, 0.36, 0.32]} {...pick} />
          <mesh geometry={sph} material={veg} position={[0, 0.85, 0]} scale={[0.7, 0.9, 0.7]} {...deco} />
          <mesh geometry={sph} material={veg} position={[0.18, 1.05, 0.1]} scale={[0.45, 0.5, 0.45]} {...deco} />
        </>
      )}
      {k === "tree" && (
        <>
          <mesh geometry={cyl} material={dark} position={[0, 1.15, 0]} scale={[0.32, 2.3, 0.32]} {...pick} />
          <mesh geometry={sph} material={veg} position={[0, 3.15, 0]} scale={[w, 2.6, d]} {...deco} />
          <mesh geometry={sph} material={veg} position={[w * 0.18, 3.55, d * 0.1]} scale={[w * 0.7, 1.8, d * 0.7]} {...deco} />
        </>
      )}
      {k === "hedge" && (
        <mesh geometry={box} material={veg} position={[0, h / 2, 0]} scale={[w, h, d]} {...pick} />
      )}
      {k === "fence" && (
        <>
          <mesh geometry={box} material={body} position={[0, h * 0.45, 0]} scale={[w, 0.06, 0.04]} {...pick} />
          <mesh geometry={box} material={body} position={[0, h * 0.75, 0]} scale={[w, 0.06, 0.04]} {...deco} />
          {[-0.4, 0, 0.4].map((t) => (
            <mesh key={t} geometry={box} material={body} position={[w * t, h / 2, 0]} scale={[0.06, h, 0.06]} {...deco} />
          ))}
        </>
      )}
      {k === "pergola" && (
        <>
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh
                key={`${sx}${sz}`}
                geometry={box}
                material={wood}
                position={[(sx * w) / 2 - sx * 0.08, h / 2, (sz * d) / 2 - sz * 0.08]}
                scale={[0.12, h, 0.12]}
                {...(sx === -1 && sz === -1 ? pick : deco)}
              />
            )),
          )}
          <mesh geometry={box} material={wood} position={[0, h, 0]} scale={[w, 0.08, d]} {...deco} />
          <mesh geometry={box} material={wood} position={[0, h + 0.06, 0]} scale={[w * 0.2, 0.04, d]} {...deco} />
        </>
      )}
      {k === "vehicle" && (
        <>
          <mesh geometry={box} material={metal} position={[0, 0.42, 0]} scale={[w, 0.5, d]} {...pick} />
          <mesh geometry={box} material={glass} position={[w * 0.08, 0.92, 0]} scale={[w * 0.5, 0.4, d * 0.86]} {...deco} />
          {[
            [-w * 0.32, -d * 0.4],
            [w * 0.32, -d * 0.4],
            [-w * 0.32, d * 0.4],
            [w * 0.32, d * 0.4],
          ].map(([x, z], i) => (
            <mesh key={i} geometry={cyl} material={dark} position={[x, 0.18, z]} rotation={[Math.PI / 2, 0, 0]} scale={[0.36, 0.16, 0.36]} {...deco} />
          ))}
        </>
      )}
      {k === "pool" && (
        <>
          <mesh geometry={box} material={stone} position={[0, 0.12, 0]} scale={[w + 0.35, 0.24, d + 0.35]} {...pick} />
          <mesh geometry={box} material={pickMat(mats, "water")} position={[0, 0.2, 0]} scale={[w, 0.08, d]} {...deco} />
        </>
      )}
      {k === "people" && (
        <>
          <mesh geometry={box} material={pickMat(mats, "lime")} position={[0, 0.55, 0]} scale={[0.32, 0.85, 0.2]} {...pick} />
          <mesh geometry={sph} material={pickMat(mats, "lime")} position={[0, 1.18, 0]} scale={[0.28, 0.32, 0.28]} {...deco} />
          <mesh geometry={box} material={pickMat(mats, "plaster")} position={[0, 0.18, 0]} scale={[0.3, 0.36, 0.18]} {...deco} />
        </>
      )}
      {k === "rug" && (
        <mesh geometry={box} material={body} position={[0, 0.015, 0]} scale={[w, 0.03, d]} {...pick} />
      )}
      {k === "fire" && (
        <>
          <mesh geometry={box} material={stone} position={[0, h / 2, 0]} scale={[w, h, d]} {...pick} />
          <mesh geometry={box} material={dark} position={[0, h * 0.32, d * 0.22]} scale={[w * 0.5, h * 0.42, 0.08]} {...deco} />
          <mesh geometry={box} material={pickMat(mats, "terracotta")} position={[0, h * 0.22, d * 0.18]} scale={[w * 0.32, 0.12, 0.06]} {...deco} />
        </>
      )}
      {k === "post" && (
        <>
          <mesh geometry={cyl} material={metal} position={[0, h / 2, 0]} scale={[0.1, h, 0.1]} {...pick} />
          <mesh geometry={sph} material={white} position={[0, h, 0]} scale={[0.32, 0.32, 0.32]} {...deco} />
        </>
      )}
      {k === "panel" && (
        <mesh geometry={box} material={body} position={[0, Math.max(h / 2, 0.06), 0]} scale={[w, Math.max(h, 0.06), d]} {...pick} />
      )}
    </group>
  );
}

function StairMesh({
  stair,
  elev,
  box,
  material,
  shadows,
  onSelect,
}: {
  stair: Stair;
  elev: number;
  box: THREE.BoxGeometry;
  material: THREE.Material;
  shadows: boolean;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = Math.max(1, stair.steps);
  useLayoutEffect(() => {
    const inst = ref.current;
    if (!inst) return;
    const tread = stair.run / count;
    const rise = stair.rise / count;
    const fx = Math.cos(stair.direction);
    const fz = Math.sin(stair.direction);
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        stair.origin.x + fx * (i + 0.5) * tread,
        elev + (i + 0.5) * rise,
        stair.origin.y + fz * (i + 0.5) * tread,
      );
      dummy.rotation.set(0, -stair.direction, 0);
      dummy.scale.set(stair.width, rise, tread);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
  }, [stair, elev, count]);
  const fx = Math.cos(stair.direction);
  const fz = Math.sin(stair.direction);
  return (
    <group>
      <instancedMesh
        ref={ref}
        args={[box, material, count]}
        castShadow={shadows}
        receiveShadow={shadows}
        frustumCulled
        onClick={(e) => {
          e.stopPropagation();
          onSelect(stair.id);
        }}
      />
      {stair.railing && (
        <mesh
          geometry={box}
          material={material}
          position={[
            stair.origin.x + fx * (stair.run / 2) + fz * (stair.width / 2 + 0.04),
            elev + stair.rise / 2 + 0.45,
            stair.origin.y + fz * (stair.run / 2) - fx * (stair.width / 2 + 0.04),
          ]}
          rotation={[0, -stair.direction, Math.atan2(stair.rise, stair.run)]}
          scale={[0.04, 0.04, Math.hypot(stair.run, stair.rise)]}
          raycast={skipRaycast}
        />
      )}
    </group>
  );
}

export function BuildingScene({
  project,
  selectedIds,
  onSelect,
  clipY,
  showClip,
  quality,
  phase = 7,
  storyFilter = null,
  labelStory = null,
  showStructure = false,
}: {
  project: Project;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  clipY: number;
  showClip: boolean;
  quality: RenderQuality;
  phase?: number;
  storyFilter?: string | null;
  labelStory?: string | null;
  showStructure?: boolean;
}) {
  const { box, cyl, sph, mats, select } = useSharedResources(
    quality.lambert,
    project.materials,
    quality.texSize,
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const structMat = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color: "#8d6750",
        emissive: "#2c1810",
        emissiveIntensity: 0.16,
      }),
    [],
  );
  const ghostMat = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color: "#5c5a55",
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    [],
  );
  const massingMat = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color: "#6a7874",
        transparent: true,
        opacity: 0.55,
        depthWrite: true,
      }),
    [],
  );
  useEffect(() => () => {
    structMat.dispose();
    ghostMat.dispose();
    massingMat.dispose();
  }, [structMat, ghostMat, massingMat]);
  const maxH = Math.max(...project.stories.map((s) => s.elevation + s.height), 3);
  const cut = showClip ? clipY * maxH : 999;
  const shadows = quality.shadows;
  const isolate = Boolean(storyFilter);
  const activeId = storyFilter ?? labelStory ?? project.stories[0]?.id ?? null;
  const windowR = quality.storyWindow ?? (quality.mobile ? 1 : 2);
  const windowing = !isolate && project.stories.length >= 6;

  const storyLod = useMemo(() => {
    const map = new Map<string, "full" | "shell" | "massing">();
    for (const st of project.stories) {
      if (isolate) {
        map.set(st.id, st.id === storyFilter ? "full" : "massing");
        continue;
      }
      if (!windowing) {
        map.set(st.id, "full");
        continue;
      }
      const d = storyDistance(project.stories, st.id, activeId);
      if (d <= windowR) map.set(st.id, "full");
      else if (d <= windowR + 2) map.set(st.id, "shell");
      else map.set(st.id, "massing");
    }
    return map;
  }, [project.stories, isolate, storyFilter, windowing, activeId, windowR]);

  const keep = (sid: string) => !storyFilter || sid === storyFilter;
  const lodOf = (sid: string) => storyLod.get(sid) ?? "full";
  const castFor = (sid: string) => shadows && lodOf(sid) === "full";

  const massingBoxes = useMemo(() => {
    // Isolate = that story only (no far massing). Windowing = far floors as cheap boxes.
    if (!windowing || isolate) return [] as { id: string; cx: number; cz: number; sx: number; sy: number; sz: number; y: number }[];
    const out: { id: string; cx: number; cz: number; sx: number; sy: number; sz: number; y: number }[] = [];
    for (const st of project.stories) {
      if (lodOf(st.id) !== "massing") continue;
      const polys = [
        ...project.slabs.filter((s) => s.storyId === st.id).map((s) => s.polygon),
        ...project.rooms.filter((r) => r.storyId === st.id).map((r) => r.polygon),
      ];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const poly of polys) {
        for (const p of poly) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
      if (!Number.isFinite(minX)) {
        const walls = project.walls.filter((w) => w.storyId === st.id);
        for (const w of walls) {
          minX = Math.min(minX, w.a.x, w.b.x);
          minY = Math.min(minY, w.a.y, w.b.y);
          maxX = Math.max(maxX, w.a.x, w.b.x);
          maxY = Math.max(maxY, w.a.y, w.b.y);
        }
      }
      if (!Number.isFinite(minX)) continue;
      const sx = Math.max(1, maxX - minX);
      const sz = Math.max(1, maxY - minY);
      out.push({
        id: st.id,
        cx: (minX + maxX) / 2,
        cz: (minY + maxY) / 2,
        sx,
        sy: st.height,
        sz,
        y: st.elevation + st.height / 2,
      });
    }
    return out;
  }, [project, windowing, isolate, storyFilter, storyLod]);

  return (
    <group>
      {massingBoxes.map((m) => (
        <mesh
          key={`mass-${m.id}`}
          geometry={box}
          material={massingMat}
          position={[m.cx, m.y, m.cz]}
          scale={[m.sx, m.sy, m.sz]}
          castShadow={false}
          receiveShadow={shadows}
          raycast={skipRaycast}
        />
      ))}
      {project.slabs.map((s) => {
        if (!keep(s.storyId)) return null;
        const lod = lodOf(s.storyId);
        if (lod === "massing") return null;
        const elev = storyElev(project, s.storyId);
        if (!visibleAt(phase, s.outdoor ? 0 : elev < 0.4 ? 1 : 4)) return null;
        if (elev > cut) return null;
        return (
          <SlabMesh
            key={s.id}
            id={s.id}
            polygon={s.polygon}
            thickness={s.thickness}
            y={elev}
            material={pickMat(mats, s.materialId)}
            outdoor={s.outdoor}
            shadows={castFor(s.storyId)}
            onSelect={onSelect}
          />
        );
      })}
      {project.walls.map((w) => {
        if (!keep(w.storyId) || !visibleAt(phase, 3)) return null;
        const lod = lodOf(w.storyId);
        if (lod === "massing") return null;
        const elev = storyElev(project, w.storyId);
        if (elev > cut) return null;
        const wall = elev + w.height > cut ? { ...w, height: Math.max(0.1, cut - elev) } : w;
        const showOpenings = lod === "full" && visibleAt(phase, 6);
        return (
          <WallGroup
            key={w.id}
            wall={wall}
            openings={showOpenings ? project.openings : []}
            elev={elev}
            selected={selected.has(w.id)}
            onSelect={onSelect}
            box={box}
            mats={mats}
            selectMat={select}
            shadows={castFor(w.storyId)}
            structureMode={showStructure}
            structMat={structMat}
            ghostMat={ghostMat}
          />
        );
      })}
      {project.columns.map((c) => {
        if (!keep(c.storyId) || !visibleAt(phase, 2)) return null;
        const lod = lodOf(c.storyId);
        if (lod === "massing") return null;
        const elev = storyElev(project, c.storyId);
        if (elev > cut) return null;
        const mat = selected.has(c.id)
          ? select
          : showStructure
            ? structMat
            : pickMat(mats, c.materialId);
        const rot = c.rotation ?? 0;
        const round = c.shape === "round";
        const sh = castFor(c.storyId);
        return round ? (
          <mesh
            key={c.id}
            material={mat}
            position={[c.position.x, elev + c.height / 2, c.position.y]}
            rotation={[0, -rot, 0]}
            castShadow={sh}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(c.id);
            }}
          >
            <cylinderGeometry args={[c.width / 2, c.width / 2, c.height, lod === "shell" ? 10 : 24]} />
          </mesh>
        ) : (
          <mesh
            key={c.id}
            geometry={box}
            material={mat}
            position={[c.position.x, elev + c.height / 2, c.position.y]}
            rotation={[0, -rot, 0]}
            scale={[c.width, c.height, c.depth]}
            castShadow={sh}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(c.id);
            }}
          />
        );
      })}
      {project.stairs.map((st) => {
        if (!keep(st.storyId) || !visibleAt(phase, 2)) return null;
        const lod = lodOf(st.storyId);
        if (lod !== "full") return null;
        const elev = storyElev(project, st.storyId);
        if (elev > cut) return null;
        return (
          <StairMesh
            key={st.id}
            stair={st}
            elev={elev}
            box={box}
            material={pickMat(mats, st.materialId ?? "stone")}
            shadows={castFor(st.storyId)}
            onSelect={onSelect}
          />
        );
      })}
      {project.furniture.map((f) => {
        if (showStructure) return null;
        if (!keep(f.storyId) || !visibleAt(phase, furniturePhase(f))) return null;
        const lod = lodOf(f.storyId);
        if (lod === "massing") return null;
        if (lod === "shell") return null;
        const elev = storyElev(project, f.storyId);
        if (elev > cut) return null;
        const dist = storyDistance(project.stories, f.storyId, activeId);
        const simple = quality.simpleProps && dist > 1;
        return (
          <FurnitureMesh
            key={f.id}
            item={f}
            elev={elev}
            selected={selected.has(f.id)}
            onSelect={onSelect}
            box={box}
            cyl={cyl}
            sph={sph}
            mats={mats}
            selectMat={select}
            shadows={castFor(f.storyId)}
            simple={simple}
          />
        );
      })}
      {!showClip &&
        project.roofs.map((r) => {
          if (!keep(r.storyId) || !visibleAt(phase, 5)) return null;
          const lod = lodOf(r.storyId);
          if (lod === "massing") return null;
          const story = project.stories.find((s) => s.id === r.storyId);
          const elev = (story?.elevation ?? 0) + (story?.height ?? 2.8);
          return (
            <GableRoofMesh
              key={r.id}
              roof={r}
              elev={elev}
              box={box}
              material={pickMat(mats, r.materialId)}
              shadows={castFor(r.storyId)}
              onSelect={onSelect}
            />
          );
        })}
      {project.rooms.map((r) => {
        if (!keep(r.storyId)) return null;
        const lod = lodOf(r.storyId);
        if (lod === "massing") return null;
        const c = polygonCentroid(r.polygon);
        const b = boundsOf(r.polygon);
        const elev = storyElev(project, r.storyId);
        if (elev > cut) return null;
        const showLabels =
          quality.labels &&
          lod === "full" &&
          (!labelStory || r.storyId === labelStory) &&
          (!windowing || storyDistance(project.stories, r.storyId, activeId) <= 1);
        return (
          <group key={r.id}>
            {lod === "full" && r.floorFinish && r.function !== "terrace" && r.function !== "patio" && (
              <mesh
                geometry={box}
                material={pickMat(mats, r.floorFinish)}
                position={[c.x, elev + 0.025, c.y]}
                scale={[
                  Math.max(0.8, b.max.x - b.min.x - 0.4),
                  0.03,
                  Math.max(0.8, b.max.y - b.min.y - 0.4),
                ]}
                receiveShadow={castFor(r.storyId)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(r.id);
                }}
              />
            )}
            {selected.has(r.id) && (
            <mesh
              geometry={box}
              position={[c.x, elev + 0.05, c.y]}
              scale={[
                Math.max(0.9, b.max.x - b.min.x - 0.35),
                0.05,
                Math.max(0.9, b.max.y - b.min.y - 0.35),
              ]}
              raycast={skipRaycast}
            >
              <meshBasicMaterial
                transparent
                opacity={0.2}
                color="#7a9e96"
                depthWrite={false}
              />
            </mesh>
            )}
            {showLabels && (
              <sprite position={[c.x, elev + 1.35, c.y]} scale={[2.4, 0.6, 1]} raycast={skipRaycast}>
                <spriteMaterial map={labelTexture(r.name)} transparent depthWrite={false} />
              </sprite>
            )}
            {lod === "full" && r.function === "patio" && (
              <mesh
                geometry={box}
                material={pickMat(mats, "vegetation")}
                position={[c.x, elev + 0.02, c.y]}
                scale={[
                  Math.max(2.2, b.max.x - b.min.x - 0.2),
                  0.04,
                  Math.max(2.2, b.max.y - b.min.y - 0.2),
                ]}
                receiveShadow={castFor(r.storyId)}
                raycast={skipRaycast}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

export function Ground({
  size,
  shadows,
  plot,
  cx = 0,
  cz = 0,
}: {
  size: number;
  shadows: boolean;
  plot?: number;
  cx?: number;
  cz?: number;
}) {
  const grass = useMemo(
    () => createStyledMaterial(resolveMaterial("vegetation"), false, 192),
    [],
  );
  const earth = useMemo(
    () => createStyledMaterial(resolveMaterial("concrete"), false, 192),
    [],
  );
  useEffect(
    () => () => {
      grass.dispose();
      earth.dispose();
    },
    [grass, earth],
  );
  const parcel = Math.max(18, plot ?? size * 0.45);
  return (
    <group position={[cx, 0, cz]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        material={grass}
        receiveShadow={shadows}
        raycast={skipRaycast}
      >
        <planeGeometry args={[size, size, 1, 1]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        material={earth}
        receiveShadow={shadows}
        raycast={skipRaycast}
      >
        <planeGeometry args={[Math.max(14, parcel * 0.42), Math.max(14, parcel * 0.42), 1, 1]} />
      </mesh>
      {(
        [
          [0, parcel / 2, parcel, 0.12],
          [0, -parcel / 2, parcel, 0.12],
          [parcel / 2, 0, 0.12, parcel],
          [-parcel / 2, 0, 0.12, parcel],
        ] as const
      ).map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, 0.04, z]} raycast={skipRaycast} castShadow={shadows} receiveShadow={shadows}>
          <boxGeometry args={[sx, 0.08, sz]} />
          <meshStandardMaterial color="#6e7a76" roughness={0.88} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

export function sunPosition(
  hour: number,
  radius = 46,
  north = 0,
  latitude = 45,
  month = 6,
): [number, number, number] {
  const t = Math.min(1, Math.max(0, (hour - 6) / 14));
  const decl = 23.4 * Math.sin(((month - 3.2) / 12) * Math.PI * 2);
  const azimuth = Math.PI * (0.12 + t * 0.76) + (north * Math.PI) / 180;
  const latK = Math.cos(((latitude - decl * 0.45) * Math.PI) / 180);
  const peak = 0.22 + 0.62 * Math.max(0.08, latK);
  const elev = Math.sin(t * Math.PI) * peak + 0.04;
  const y = Math.max(0.35, Math.sin(elev) * radius);
  return [
    Math.cos(azimuth) * Math.cos(elev) * radius,
    y,
    Math.sin(azimuth) * Math.cos(elev) * radius,
  ];
}
