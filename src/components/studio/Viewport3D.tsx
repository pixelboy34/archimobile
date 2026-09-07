import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import { BuildingScene, Ground, sunPosition } from "./BuildingScene";
import { OrbitRig } from "./OrbitRig";
import { SelectionGizmo } from "./SelectionGizmo";
import { WalkController } from "./WalkController";
import { PhysicsRig } from "./PhysicsRig";
import { PLAYER_HALF, PLAYER_RADIUS } from "@/lib/physics/rapier-world";
import { dist, findWallAt, projectBounds, polygonArea, polygonCentroid, wallAngle } from "@/lib/bim/geometry";
import { detectQuality, tallBoost, type RenderQuality } from "@/lib/render/quality";
import {
  interiorOn,
  skyColor,
  sunColor,
  type Lighting,
} from "@/lib/render/lighting";
import { useStudio } from "@/lib/store/project-store";
import type { Project, Vec2, ViewMode } from "@/lib/bim/types";

const noopRaycast = () => {};

function NorthMark({
  cx,
  cz,
  elev,
  north,
  span,
}: {
  cx: number;
  cz: number;
  elev: number;
  north: number;
  span: number;
}) {
  const rad = (north * Math.PI) / 180;
  const d = Math.max(6, span * 0.42);
  return (
    <group position={[cx, elev + 0.05, cz]} rotation={[0, rad, 0]} raycast={noopRaycast}>
      <mesh position={[0, 0, d]} rotation={[Math.PI / 2, 0, 0]} raycast={noopRaycast}>
        <coneGeometry args={[0.22, 0.7, 3]} />
        <meshBasicMaterial color="#7a9e96" />
      </mesh>
    </group>
  );
}
const OUTDOOR = new Set(["terrace", "patio", "garage"]);

function AdaptiveGpu({ mobile }: { mobile: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.autoUpdate = gl.shadowMap.enabled;
    if (mobile) gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [gl, mobile]);
  return null;
}

function CamLens({ fov, far }: { fov: number; far: number }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if ("fov" in camera) {
      (camera as THREE.PerspectiveCamera).fov = fov;
      camera.far = far;
      camera.near = 0.15;
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, fov, far, invalidate]);
  return null;
}

function BootFrame() {
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    invalidate();
  }, [invalidate, size.width, size.height]);
  return null;
}

function Invalidate({ tick }: { tick: string }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate, tick]);
  return null;
}

function LightRig({
  lighting,
  shadows,
  type,
  mobile,
}: {
  lighting: Lighting;
  shadows: boolean;
  type: THREE.ShadowMapType;
  mobile: boolean;
}) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    gl.shadowMap.enabled = shadows;
    gl.shadowMap.type = type;
    gl.shadowMap.needsUpdate = true;
    gl.shadowMap.autoUpdate = shadows;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = lighting.exposure;
    invalidate();
  }, [gl, invalidate, shadows, type, lighting.exposure, mobile]);
  return null;
}

function InteriorLights({
  project,
  gain,
  cap,
  preferStoryId,
}: {
  project: Project;
  gain: number;
  cap: number;
  preferStoryId?: string | null;
}) {
  const lights = useMemo(() => {
    if (cap <= 0) return [];
    const rooms = project.rooms
      .filter((r) => !OUTDOOR.has(r.function) && r.polygon.length >= 3)
      .map((r) => ({
        id: r.id,
        storyId: r.storyId,
        c: polygonCentroid(r.polygon),
        area: polygonArea(r.polygon),
        elev: (project.stories.find((s) => s.id === r.storyId)?.elevation ?? 0) +
          (project.stories.find((s) => s.id === r.storyId)?.height ?? 2.8) - 0.22,
      }))
      .sort((a, b) => {
        const ap = preferStoryId && a.storyId === preferStoryId ? 1 : 0;
        const bp = preferStoryId && b.storyId === preferStoryId ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return b.area - a.area;
      })
      .slice(0, cap);
    return rooms;
  }, [project, cap, preferStoryId]);
  return (
    <>
      {lights.map((l) => (
        <pointLight
          key={l.id}
          position={[l.c.x, l.elev, l.c.y]}
          intensity={1.4 * gain}
          distance={Math.max(4.5, Math.sqrt(l.area) * 1.6)}
          decay={2}
          color="#ffd7a8"
        />
      ))}
    </>
  );
}

function Placement({
  elev,
  enabled,
  target,
  north,
  span,
}: {
  elev: number;
  enabled: boolean;
  target: [number, number, number];
  north: number;
  span: number;
}) {
  const { camera, invalidate } = useThree();
  const placeAt = useStudio((s) => s.placeAt);

  const planePoint = (ndcX: number, ndcY: number): Vec2 | null => {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elev);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, y: hit.z };
  };

  return (
    <OrbitRig
      target={target}
      north={north}
      span={span}
      minDistance={Math.max(2.2, span * 0.05)}
      maxDistance={Math.max(240, span * 10)}
      onTap={
        enabled
          ? (x, y) => {
              const p = planePoint(x, y);
              if (p) placeAt(p);
              invalidate();
            }
          : undefined
      }
    />
  );
}

function DraftGhost({
  elev,
  height,
  project,
  storyId,
}: {
  elev: number;
  height: number;
  project: Project;
  storyId: string;
}) {
  const draft = useStudio((s) => s.draft);
  const tool = useStudio((s) => s.tool);
  const measure = useStudio((s) => s.measure);
  const { camera, gl, invalidate } = useThree();
  const hover = useRef<Vec2 | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      if (!draft && tool !== "measure" && tool !== "window" && tool !== "door") return;
      const r = el.getBoundingClientRect();
      const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ndcY = -(((e.clientY - r.top) / r.height) * 2 - 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elev);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, hit)) {
        hover.current = { x: hit.x, y: hit.z };
        bump((n) => n + 1);
        invalidate();
      }
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [camera, gl, invalidate, draft, tool, elev]);

  const b = hover.current;
  return (
    <group>
      {draft && b && (tool === "wall" || tool === "measure") && (
        <mesh
          position={[(draft.x + b.x) / 2, elev + (tool === "wall" ? height : 0.04) / 2, (draft.y + b.y) / 2]}
          rotation={[0, -Math.atan2(b.y - draft.y, b.x - draft.x), 0]}
          raycast={noopRaycast}
        >
          <boxGeometry
            args={[Math.max(0.05, dist(draft, b)), tool === "wall" ? height : 0.04, tool === "wall" ? 0.22 : 0.08]}
          />
          <meshLambertMaterial color="#7a9e96" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
      {measure && (
        <mesh
          position={[
            (measure.a.x + measure.b.x) / 2,
            elev + 1.1,
            (measure.a.y + measure.b.y) / 2,
          ]}
          rotation={[0, -Math.atan2(measure.b.y - measure.a.y, measure.b.x - measure.a.x), 0]}
          raycast={noopRaycast}
        >
          <boxGeometry args={[Math.max(0.05, dist(measure.a, measure.b)), 0.05, 0.05]} />
          <meshBasicMaterial color="#e8e4d9" />
        </mesh>
      )}
      {b && (tool === "window" || tool === "door") && (() => {
        const hit = findWallAt(project, storyId, b, 0.6);
        if (!hit) return null;
        const wall = hit.wall;
        const px = wall.a.x + (wall.b.x - wall.a.x) * hit.t;
        const pz = wall.a.y + (wall.b.y - wall.a.y) * hit.t;
        const ow = tool === "door" ? 0.9 : 1.4;
        const oh = tool === "door" ? 2.1 : 1.35;
        const sill = tool === "door" ? 0 : 0.9;
        const ang = wallAngle(wall);
        return (
          <mesh
            position={[px, elev + sill + oh / 2, pz]}
            rotation={[0, -ang, 0]}
            raycast={noopRaycast}
          >
            <boxGeometry args={[ow, oh, Math.max(0.12, wall.thickness + 0.04)]} />
            <meshLambertMaterial color="#6ed0c3" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        );
      })()}
    </group>
  );
}

export function Viewport3D({
  project,
  selectedIds,
  onSelect,
  view,
  sunHour: _sunHour,
  clipY,
}: {
  project: Project;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  view: ViewMode;
  sunHour: number;
  clipY: number;
}) {
  const lighting = useStudio((s) => s.lighting);
  const tool = useStudio((s) => s.tool);
  const buildPhase = useStudio((s) => s.buildPhase);
  const draft = useStudio((s) => s.draft);
  const storyId = useStudio((s) => s.storyId);
  const showGrid = useStudio((s) => s.grid);
  const isolateStory = useStudio((s) => s.isolateStory);
  const showStructure = useStudio((s) => s.showStructure);
  const physicsOn = useStudio((s) => s.physics);
  const orthoCam = useStudio((s) => s.nav.orthoCam);
  const fov = useStudio((s) => s.nav.fov);
  const gizmoMode = useStudio((s) => s.gizmoMode);
  const [baseQuality] = useState<RenderQuality>(() => detectQuality());
  const quality = useMemo(
    () => tallBoost(baseQuality, project.stories.length),
    [baseQuality, project.stories.length],
  );
  const b = projectBounds(project);
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.y + b.max.y) / 2;
  const horiz = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 8);
  const tall = Math.max(...project.stories.map((s) => s.elevation + s.height), 8);
  const span = Math.max(horiz, tall * 0.55);
  const camDist = Math.max(14, Math.max(horiz, tall) * 1.05);
  const hour = lighting.sunHour;
  const sun = useMemo(
    () =>
      sunPosition(
        hour,
        quality.mobile ? 40 : 52,
        project.meta.north,
        project.meta.latitude,
        lighting.month,
      ),
    [hour, quality.mobile, project.meta.north, project.meta.latitude, lighting.month],
  );
  const walking = view === "visite";
  const clipping = view === "coupe";
  const sky = skyColor(hour);
  const sunCol = sunColor(hour);
  const shadows = lighting.shadows && quality.shadows;
  const mapSize = quality.shadowMap;
  const shadowType = THREE.PCFSoftShadowMap;
  const half = Math.max(12, span * (quality.mobile ? 0.7 : 0.9));
  const night = hour < 7 || hour >= 19.5;
  const sunI = lighting.sunIntensity * (night ? 0.18 : 1);
  const showInterior = interiorOn(lighting) && quality.interiorLights > 0;
  const story = project.stories.find((s) => s.id === (storyId ?? project.stories[0]?.id));
  const elev = story?.elevation ?? 0;
  const storyH = story?.height ?? 2.8;
  const walkStart: [number, number, number] = physicsOn
    ? [cx, elev + PLAYER_HALF + PLAYER_RADIUS, cz]
    : [cx, elev + 1.65, cz];
  const drawing = !walking && tool !== "select";
  const sceneQuality = useMemo(
    () => ({ ...quality, shadows }),
    [quality, shadows],
  );
  const ambient = lighting.ambient;
  const lens = fov || (quality.mobile ? 58 : 48);
  const camFar = Math.max(180, horiz * 8, tall * 14);
  const plotSide = Math.sqrt(Math.max(220, project.meta.plotM2 ?? span * span));
  const site = Math.min(420, Math.max(quality.ground, plotSide * 2.4, span * 4.2, 80));

  return (
    <Canvas
      className="studio-canvas h-full w-full"
      shadows={shadows}
      dpr={quality.dpr}
      frameloop={walking ? "always" : "demand"}
      performance={{ min: 0.85, max: 1, debounce: 200 }}
      gl={{
        antialias: quality.antialias,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
        preserveDrawingBuffer: !quality.mobile,
        precision: quality.precision,
      }}
      camera={{
        position: [cx + camDist * 0.62, camDist * 0.48, cz + camDist * 0.62],
        fov: lens,
        near: 0.15,
        far: camFar,
      }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = shadows;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        gl.shadowMap.autoUpdate = shadows;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = lighting.exposure || 1;
        gl.setClearColor(sky, 1);
      }}
      onPointerMissed={() => {
        if (tool === "select") onSelect(null);
      }}
    >
      <BootFrame />
      <CamLens fov={lens} far={camFar} />
      {orthoCam && !walking && (
        <OrthographicCamera
          makeDefault
          position={[cx + camDist * 0.62, camDist * 0.48, cz + camDist * 0.62]}
          zoom={Math.max(12, 280 / span)}
          near={0.1}
          far={camFar}
        />
      )}
      <AdaptiveGpu mobile={quality.mobile} />
      <Invalidate
        tick={`${project.updatedAt}|${selectedIds.join(",")}|${hour}|${clipY}|${view}|${lighting.month}|${lighting.sunIntensity}|${lighting.fill}|${lighting.ambient}|${lighting.hemi}|${lighting.exposure}|${shadows}|${lighting.shadowSoftness}|${lighting.interior}|${lighting.interiorGain}|${buildPhase}|${tool}|${draft ? "d" : ""}|${showGrid ? "g" : ""}|${isolateStory ? storyId : "all"}|${showStructure ? "st" : ""}|${orthoCam ? "o" : ""}|${fov}|${gizmoMode}`}
      />
      <LightRig lighting={lighting} shadows={shadows} type={shadowType} mobile={quality.mobile} />
      <color attach="background" args={[sky]} />
      {quality.fog && <fog attach="fog" args={[sky, Math.max(36, span * 2.0), Math.max(110, span * 5.5)]} />}
      <hemisphereLight args={[night ? "#9aa4b8" : "#f2f0ea", "#4a4a40", lighting.hemi]} />
      <ambientLight intensity={ambient} />
      <directionalLight
        position={sun}
        intensity={sunI}
        castShadow={shadows}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-near={2}
        shadow-camera-far={Math.max(60, span * 3.2)}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02 + lighting.shadowSoftness * 0.04}
        color={sunCol}
      />
      <directionalLight
          position={[-sun[0] * 0.35, Math.max(6, sun[1] * 0.45), -sun[2] * 0.35]}
          intensity={lighting.fill}
          color={night ? "#7a88a8" : "#c5d0dc"}
        />
      {showInterior && (
        <InteriorLights
          project={project}
          gain={lighting.interiorGain}
          cap={quality.interiorLights}
          preferStoryId={storyId ?? project.stories[0]?.id ?? null}
        />
      )}
      <mesh position={sun} raycast={noopRaycast}>
          <sphereGeometry args={[1.35, 14, 14]} />
          <meshBasicMaterial color={sunCol} />
        </mesh>
      <mesh raycast={noopRaycast}>
        <sphereGeometry args={[camFar * 0.48, 28, 18]} />
        <meshBasicMaterial color={sky} side={THREE.BackSide} />
      </mesh>
      <BuildingScene
        project={project}
        selectedIds={selectedIds}
        onSelect={(id) => {
          if (tool === "select") onSelect(id);
        }}
        clipY={clipY}
        showClip={clipping}
        quality={sceneQuality}
        phase={buildPhase}
        storyFilter={isolateStory ? (storyId ?? project.stories[0]?.id ?? null) : null}
        labelStory={storyId ?? project.stories[0]?.id ?? null}
        showStructure={showStructure}
      />
      <Ground size={site} shadows={shadows} plot={plotSide} cx={cx} cz={cz} />
      <NorthMark cx={cx} cz={cz} elev={elev} north={project.meta.north} span={span} />
      {showGrid && !walking && (
      <gridHelper
        args={[site, quality.gridDiv, "#3a4844", "#24302c"]}
        position={[0, elev + 0.01, 0]}
        frustumCulled
      />
      )}
      {walking && physicsOn ? (
        <PhysicsRig
          project={project}
          storyId={isolateStory ? (storyId ?? project.stories[0]?.id ?? null) : null}
          start={walkStart}
        >
          <WalkController key={story?.id ?? "g"} start={walkStart} />
        </PhysicsRig>
      ) : walking ? (
        <WalkController key={story?.id ?? "g"} start={walkStart} />
      ) : (
        <Placement
          elev={elev}
          enabled={drawing}
          target={[cx, elev + 1.2, cz]}
          north={project.meta.north}
          span={span}
        />
      )}
      {!walking && tool === "select" && (view === "3d" || view === "coupe") && (
        <SelectionGizmo />
      )}
      <DraftGhost elev={elev} height={storyH} project={project} storyId={story?.id ?? project.stories[0]!.id} />
    </Canvas>
  );
}