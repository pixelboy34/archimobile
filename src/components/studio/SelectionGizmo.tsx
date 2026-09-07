import { TransformControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import { snap, SNAP } from "@/lib/bim/geometry";
import { lockOrbit, unlockOrbit } from "@/lib/viewport/orbit-lock";
import { useStudio } from "@/lib/store/project-store";

const ACCENT = "#6ed0c3";

function gizmoTouchSize(): number {
  if (typeof window === "undefined") return 1.2;
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return 1.9;
    if (window.matchMedia("(max-width: 480px)").matches) return 1.65;
  } catch {
    /* ignore */
  }
  return 1.2;
}

type MovableKind = "furniture" | "column" | "stair" | "wall";

interface Target {
  kind: MovableKind;
  id: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

/**
 * 3D translate / rotate-Y gizmo for the current selection (furniture, column, stair;
 * optional wall mid-point translate in XZ).
 */
export function SelectionGizmo() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const selectedIds = useStudio((s) => s.selectedIds);
  const tool = useStudio((s) => s.tool);
  const view = useStudio((s) => s.view);
  const snapOn = useStudio((s) => s.snap);
  const gizmoMode = useStudio((s) => s.gizmoMode);
  const beginEdit = useStudio((s) => s.beginEdit);
  const moveSelected = useStudio((s) => s.moveSelected);
  const patchSelected = useStudio((s) => s.patchSelected);
  const invalidate = useThree((s) => s.invalidate);

  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<TransformControlsImpl>(null);
  const dragging = useRef(false);
  const origin = useRef({ x: 0, z: 0, rot: 0 });

  const target = useMemo((): Target | null => {
    if (!project || tool !== "select") return null;
    if (view !== "3d" && view !== "coupe") return null;
    const id = selectedIds[0];
    if (!id) return null;

    const furn = project.furniture.find((f) => f.id === id);
    if (furn) {
      const elev = project.stories.find((s) => s.id === furn.storyId)?.elevation ?? 0;
      return {
        kind: "furniture",
        id,
        x: furn.position.x,
        y: elev + furn.h * 0.5,
        z: furn.position.y,
        rotY: furn.rotation,
      };
    }
    const col = project.columns.find((c) => c.id === id);
    if (col) {
      const elev = project.stories.find((s) => s.id === col.storyId)?.elevation ?? 0;
      return {
        kind: "column",
        id,
        x: col.position.x,
        y: elev + col.height * 0.5,
        z: col.position.y,
        rotY: col.rotation ?? 0,
      };
    }
    const stair = project.stairs.find((st) => st.id === id);
    if (stair) {
      const elev = project.stories.find((s) => s.id === stair.storyId)?.elevation ?? 0;
      return {
        kind: "stair",
        id,
        x: stair.origin.x,
        y: elev + stair.rise * 0.35,
        z: stair.origin.y,
        rotY: stair.direction,
      };
    }
    const wall = project.walls.find((w) => w.id === id);
    if (wall) {
      const elev = project.stories.find((s) => s.id === wall.storyId)?.elevation ?? 0;
      return {
        kind: "wall",
        id,
        x: (wall.a.x + wall.b.x) / 2,
        y: elev + wall.height * 0.5,
        z: (wall.a.y + wall.b.y) / 2,
        rotY: 0,
      };
    }
    return null;
  }, [project, selectedIds, tool, view]);

  useEffect(() => {
    const g = groupRef.current;
    if (!g || !target || dragging.current) return;
    g.position.set(target.x, target.y, target.z);
    g.rotation.set(0, target.rotY, 0);
    invalidate();
  }, [target, invalidate]);

  useEffect(() => {
    const release = () => {
      if (!dragging.current) return;
      dragging.current = false;
      unlockOrbit();
    };
    // Fallback if TransformControls skips mouseup (touch cancel / tab blur)
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      release();
    };
  }, []);

  // Soft accent tint on gizmo helpers
  useEffect(() => {
    const ctrl = controlsRef.current as unknown as {
      gizmo?: THREE.Object3D;
    } | null;
    const gizmo = ctrl?.gizmo;
    if (!gizmo) return;
    const accent = new THREE.Color(ACCENT);
    gizmo.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if ("color" in m && (m as THREE.MeshBasicMaterial).color instanceof THREE.Color) {
          (m as THREE.MeshBasicMaterial).color.lerp(accent, 0.5);
        }
      }
    });
    invalidate();
  }, [target?.id, gizmoMode, invalidate]);

  if (!target) return null;

  const mode = target.kind === "wall" ? "translate" : gizmoMode;
  const translationSnap = snapOn ? SNAP : undefined;
  const rotationSnap = snapOn ? Math.PI / 12 : undefined;

  return (
    <TransformControls
      ref={controlsRef}
      key={`${target.id}-${mode}`}
      mode={mode}
      size={gizmoTouchSize()}
      space="world"
      translationSnap={translationSnap}
      rotationSnap={rotationSnap}
      showX={mode === "translate"}
      showY={mode === "rotate"}
      showZ={mode === "translate"}
      onMouseDown={() => {
        dragging.current = true;
        lockOrbit();
        beginEdit();
        const g = groupRef.current;
        if (g) {
          origin.current = { x: g.position.x, z: g.position.z, rot: g.rotation.y };
        }
      }}
      onMouseUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        unlockOrbit();
        const g = groupRef.current;
        if (!g) return;
        if (mode === "translate" && snapOn) {
          const nx = snap(g.position.x);
          const nz = snap(g.position.z);
          const remainderX = nx - g.position.x;
          const remainderZ = nz - g.position.z;
          if (Math.abs(remainderX) > 1e-6 || Math.abs(remainderZ) > 1e-6) {
            moveSelected(remainderX, remainderZ);
          }
          g.position.x = nx;
          g.position.z = nz;
          origin.current.x = nx;
          origin.current.z = nz;
        }
        if (mode === "rotate" && target.kind !== "wall") {
          let rot = g.rotation.y;
          if (snapOn) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12);
          if (target.kind === "furniture") patchSelected({ rotation: rot });
          else if (target.kind === "column") patchSelected({ rotation: rot });
          else if (target.kind === "stair") patchSelected({ direction: rot });
          g.rotation.y = rot;
          origin.current.rot = rot;
        }
        invalidate();
      }}
      onObjectChange={() => {
        const g = groupRef.current;
        if (!g || !dragging.current) return;
        if (mode === "translate") {
          g.position.y = target.y;
          const dx = g.position.x - origin.current.x;
          const dz = g.position.z - origin.current.z;
          if (Math.abs(dx) > 1e-9 || Math.abs(dz) > 1e-9) {
            moveSelected(dx, dz);
            origin.current.x = g.position.x;
            origin.current.z = g.position.z;
          }
        } else if (mode === "rotate" && target.kind !== "wall") {
          const rot = g.rotation.y;
          if (target.kind === "furniture") patchSelected({ rotation: rot });
          else if (target.kind === "column") patchSelected({ rotation: rot });
          else if (target.kind === "stair") patchSelected({ direction: rot });
          origin.current.rot = rot;
        }
        invalidate();
      }}
    >
      <group ref={groupRef} position={[target.x, target.y, target.z]} rotation={[0, target.rotY, 0]}>
        <mesh visible={false}>
          <boxGeometry args={[0.02, 0.02, 0.02]} />
        </mesh>
      </group>
    </TransformControls>
  );
}
