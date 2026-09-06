import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Scan, Smartphone, Box, Ruler } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as THREE from "three";
import { orientationToQuat, probeAr, requestMotion, startCamera, type ArCaps } from "@/lib/ar/device";
import { ghostParts } from "@/lib/ar/parts";
import { exportUsdz, openQuickLook } from "@/lib/ar/usdz";
import { dist, projectBounds } from "@/lib/bim/geometry";
import { formatMeters } from "@/lib/utils";
import type { Project, Vec2 } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";

type ArMode = "pose" | "releve" | "mesure";

const noop = () => {};

export function ArView({ project }: { project: Project }) {
  const storyId = useStudio((s) => s.storyId);
  const addSurveyPoint = useStudio((s) => s.addSurveyPoint);
  const isolateStory = useStudio((s) => s.isolateStory);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [caps, setCaps] = useState<ArCaps | null>(null);
  const [live, setLive] = useState(false);
  const [mode, setMode] = useState<ArMode>("pose");
  const [scale, setScale] = useState(0.04);
  const [origin, setOrigin] = useState<[number, number, number]>([0, 0, 0]);
  const [heading, setHeading] = useState(0);
  const [measure, setMeasure] = useState<{ a: Vec2 | null }>({ a: null });
  const [lastDist, setLastDist] = useState<number | null>(null);
  const look = useRef({ yaw: 0, pitch: -0.08, gyro: false, q: new THREE.Quaternion() });

  const b = projectBounds(project, isolateStory ? (storyId ?? undefined) : undefined);
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.y + b.max.y) / 2;
  const span = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 8);
  const north = (project.meta.north * Math.PI) / 180;
  const story = storyId ?? project.stories[0]?.id ?? null;

  useEffect(() => {
    void probeAr().then(setCaps);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const enable = async () => {
    const motion = await requestMotion();
    look.current.gyro = motion;
    if (videoRef.current) {
      streamRef.current = await startCamera(videoRef.current);
    }
    if (!streamRef.current) toast("Caméra indisponible — mode viseur");
    setLive(true);
    setOrigin([cx, 0, cz + Math.max(6, span * 0.7)]);
  };

  useEffect(() => {
    if (!live) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const alpha = THREE.MathUtils.degToRad(e.alpha ?? 0);
      const beta = THREE.MathUtils.degToRad(e.beta ?? 0);
      const gamma = THREE.MathUtils.degToRad(e.gamma ?? 0);
      const orient = THREE.MathUtils.degToRad(Number((window as Window & { orientation?: number }).orientation ?? 0));
      orientationToQuat(alpha, beta, gamma, orient, look.current.q);
      look.current.gyro = true;
      const compass =
        "webkitCompassHeading" in e
          ? Number((e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading)
          : ((e.alpha ?? 0) + 360) % 360;
      setHeading(compass);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [live]);

  const onQuickLook = async () => {
    try {
      const blob = await exportUsdz(project, isolateStory ? story : null);
      openQuickLook(blob, project.name);
      toast.success("USDZ prêt — Quick Look AR sur iPhone");
    } catch {
      toast.error("Export AR impossible");
    }
  };

  const enterXr = async () => {
    try {
      if (!navigator.xr) throw new Error("no xr");
      const session = await navigator.xr.requestSession("immersive-ar", {
        optionalFeatures: ["hit-test", "dom-overlay", "local-floor"],
      });
      session.addEventListener("end", () => toast("Session AR terminée"));
      toast.success("WebXR immersif");
    } catch {
      toast("WebXR non disponible sur cet appareil — utilisez le viseur ou Quick Look");
    }
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-bg">
      <video
        ref={videoRef}
        className="absolute inset-0 size-full object-cover"
        playsInline
        muted
        autoPlay
      />
      {!live && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#1a1a16,transparent_70%)]" />
      )}
      <Canvas
        className="absolute inset-0"
        frameloop="always"
        dpr={[1, 1.25]}
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance", stencil: false }}
        camera={{ fov: 60, near: 0.12, far: 80, position: [0, 1.55, 8] }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ArRig look={look} origin={origin} />
        <ambientLight intensity={1.1} />
        <hemisphereLight args={["#f2f0ea", "#3a3a34", 0.6]} />
        <group position={[cx, 0, cz]} rotation={[0, north, 0]} scale={scale}>
          <group position={[-cx, 0, -cz]}>
            <GhostMeshes project={project} storyId={isolateStory ? story : null} />
          </group>
        </group>
        <gridHelper args={[Math.max(8, span * scale * 2.4), 12, "#2a2a26", "#1e1e1a"]} position={[cx, 0.01, cz]} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="absolute top-3 right-3 left-3 flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex overflow-hidden rounded-full border border-border bg-surface/90">
            {(
              [
                ["pose", "Poser", Box],
                ["releve", "Relevé", Scan],
                ["mesure", "Cote", Ruler],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`flex h-10 items-center gap-1.5 px-3 text-[11px] ${
                  mode === id ? "bg-primary text-primary-fg" : "text-muted"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="rounded-full border border-border bg-surface/90 px-3 py-2 font-mono text-[11px] tabular">
            N {Math.round(heading)}°
          </div>
        </div>

        {!live && (
          <div className="pointer-events-auto absolute inset-x-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3 text-center">
            <Smartphone className="size-8 text-accent" />
            <p className="font-display text-lg font-semibold">Réalité augmentée</p>
            <p className="max-w-sm text-sm text-muted">
              Posez la maquette sur la table, relevez un terrain existant, ou ouvrez Quick Look
              AR sur iPhone.
            </p>
            <button
              type="button"
              onClick={() => void enable()}
              className="flex h-12 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-fg"
            >
              Activer caméra et gyroscope
            </button>
            <button type="button" onClick={() => void onQuickLook()} className="text-xs text-accent">
              Ouvrir dans AR Quick Look (iPhone)
            </button>
          </div>
        )}

        {live && (
          <div className="pointer-events-auto absolute right-3 bottom-3 left-3 flex flex-col gap-2">
            <p className="rounded-lg border border-border bg-surface/90 px-3 py-2 text-xs text-muted">
              {mode === "pose"
                ? "Glissez pour déplacer · pincez l’échelle · le nord suit la boussole"
                : mode === "releve"
                  ? "Tapez les angles du bâtiment réel — les points vont au relevé"
                  : lastDist
                    ? `Dernière cote ${formatMeters(lastDist)} — tapez deux points`
                    : "Tapez deux points au sol"}
            </p>
            <label className="flex items-center gap-3 rounded-lg border border-border bg-surface/90 px-3 py-2 text-[11px] text-muted">
              Échelle 1:{Math.round(1 / scale)}
              <input
                type="range"
                min={0.02}
                max={1}
                step={0.01}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span className="font-mono text-fg">{scale >= 0.95 ? "1:1" : `1:${Math.round(1 / scale)}`}</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOrigin([cx, 0, cz + Math.max(6, span * 0.7)])}
                className="h-11 flex-1 rounded-full bg-elevated text-xs"
              >
                Recentrer
              </button>
              <button
                type="button"
                onClick={() => void onQuickLook()}
                className="h-11 flex-1 rounded-full bg-primary text-xs font-medium text-primary-fg"
              >
                Quick Look iPhone
              </button>
              {caps?.webxr && (
                <button type="button" onClick={() => void enterXr()} className="h-11 rounded-full bg-elevated px-3 text-xs">
                  WebXR
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <LookPad
        look={look}
        origin={origin}
        setOrigin={setOrigin}
        live={live}
        onTap={
          mode === "pose"
            ? undefined
            : (p) => {
                if (mode === "releve") addSurveyPoint(p);
                if (mode === "mesure") {
                  if (!measure.a) setMeasure({ a: p });
                  else {
                    setLastDist(dist(measure.a, p));
                    setMeasure({ a: null });
                  }
                }
              }
        }
      />
    </div>
  );
}

function GhostMeshes({ project, storyId }: { project: Project; storyId: string | null }) {
  const parts = useMemo(() => ghostParts(project, storyId), [project, storyId]);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mats = useMemo(() => {
    const m = new Map<string, THREE.MeshLambertMaterial>();
    for (const p of parts) {
      if (!m.has(p.color)) {
        m.set(
          p.color,
          new THREE.MeshLambertMaterial({
            color: p.color,
            transparent: true,
            opacity: 0.78,
            depthWrite: true,
          }),
        );
      }
    }
    return m;
  }, [parts]);
  useEffect(
    () => () => {
      box.dispose();
      for (const m of mats.values()) m.dispose();
    },
    [box, mats],
  );
  return (
    <group>
      {parts.map((p) => (
        <mesh
          key={p.id}
          geometry={box}
          material={mats.get(p.color)}
          position={p.pos}
          rotation={p.rot}
          scale={p.scale}
          raycast={noop}
        />
      ))}
    </group>
  );
}

function ArRig({
  look,
  origin,
}: {
  look: React.MutableRefObject<{ yaw: number; pitch: number; gyro: boolean; q: THREE.Quaternion }>;
  origin: [number, number, number];
}) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    camera.position.set(origin[0], origin[1] + 1.55, origin[2]);
    if (look.current.gyro) camera.quaternion.copy(look.current.q);
    else camera.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
  });
  return null;
}

function LookPad({
  look,
  origin,
  setOrigin,
  live,
  onTap,
}: {
  look: React.MutableRefObject<{ yaw: number; pitch: number; gyro: boolean; q: THREE.Quaternion }>;
  origin: [number, number, number];
  setOrigin: (o: [number, number, number]) => void;
  live: boolean;
  onTap?: (p: Vec2) => void;
}) {
  const start = useRef<{ x: number; y: number; ox: number; oz: number; yaw: number; pitch: number } | null>(
    null,
  );
  const moved = useRef(0);
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  if (!live) return null;
  return (
    <div
      className="absolute inset-x-0 top-14 bottom-36 z-[1]"
      onPointerDown={(e) => {
        moved.current = 0;
        start.current = {
          x: e.clientX,
          y: e.clientY,
          ox: origin[0],
          oz: origin[2],
          yaw: look.current.yaw,
          pitch: look.current.pitch,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        moved.current += Math.hypot(e.movementX, e.movementY);
        if (!look.current.gyro) {
          look.current.yaw = s.yaw - dx * 0.005;
          look.current.pitch = Math.max(-1.1, Math.min(0.6, s.pitch - dy * 0.004));
          return;
        }
        fwd.current.set(0, 0, -1).applyQuaternion(look.current.q);
        fwd.current.y = 0;
        fwd.current.normalize();
        right.current.set(1, 0, 0).applyQuaternion(look.current.q);
        right.current.y = 0;
        right.current.normalize();
        setOrigin([
          s.ox - right.current.x * dx * 0.018 + fwd.current.x * dy * 0.018,
          origin[1],
          s.oz - right.current.z * dx * 0.018 + fwd.current.z * dy * 0.018,
        ]);
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s || moved.current > 14 || !onTap) return;
        const host = e.currentTarget.parentElement;
        if (!host) return;
        const r = host.getBoundingClientRect();
        const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
        const ndcY = -(((e.clientY - r.top) / r.height) * 2 - 1);
        const cam = new THREE.PerspectiveCamera(60, r.width / Math.max(1, r.height), 0.1, 80);
        cam.position.set(origin[0], origin[1] + 1.55, origin[2]);
        if (look.current.gyro) cam.quaternion.copy(look.current.q);
        else cam.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
        cam.updateMatrixWorld();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
        const hit = new THREE.Vector3();
        if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
          onTap({ x: hit.x, y: hit.z });
        }
      }}
    />
  );
}
