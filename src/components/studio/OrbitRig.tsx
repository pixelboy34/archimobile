import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useStudio } from "@/lib/store/project-store";
import { isOrbitLocked } from "@/lib/viewport/orbit-lock";

export type CamCommand =
  | { kind: "iso" | "top" | "front" | "right" | "left" | "back" | "fit" | "north" | "yawL" | "yawR" }
  | { kind: "focus"; x: number; y: number; z: number; radius?: number };

export function dispatchCam(cmd: CamCommand) {
  window.dispatchEvent(new CustomEvent<CamCommand>("forma-cam", { detail: cmd }));
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const Y_UP = new THREE.Vector3(0, 1, 0);

function camBasis(theta: number, phi: number) {
  const sinP = Math.sin(phi);
  const cosP = Math.cos(phi);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  _fwd.set(-sinP * cosT, -cosP, -sinP * sinT).normalize();
  _right.crossVectors(_fwd, Y_UP);
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
  else _right.normalize();
  _up.crossVectors(_right, _fwd).normalize();
}

export function OrbitRig({
  target,
  minDistance = 3,
  maxDistance = 240,
  north = 0,
  span = 16,
  onTap,
}: {
  target: [number, number, number];
  minDistance?: number;
  maxDistance?: number;
  north?: number;
  span?: number;
  onTap?: (ndcX: number, ndcY: number) => void;
}) {
  const { camera, gl, invalidate } = useThree();
  const nav = useStudio((s) => s.nav);
  const northRad = (north * Math.PI) / 180;
  const s = useRef({
    theta: 0.7 + northRad,
    phi: 1.05,
    radius: Math.max(12, span * 1.25),
    tx: target[0],
    ty: target[1],
    tz: target[2],
    dTheta: 0.7 + northRad,
    dPhi: 1.05,
    dRadius: Math.max(12, span * 1.25),
    dTx: target[0],
    dTy: target[1],
    dTz: target[2],
    pointers: new Map<number, { x: number; y: number }>(),
    pinch: 0,
    midX: 0,
    midY: 0,
    moved: 0,
    pan: false,
    lastTap: 0,
  });
  const tap = useRef(onTap);
  tap.current = onTap;
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    const st = s.current;
    const offset = camera.position.clone().sub(new THREE.Vector3(st.tx, st.ty, st.tz));
    const sph = new THREE.Spherical().setFromVector3(offset);
    if (Number.isFinite(sph.radius) && sph.radius > 1) {
      st.radius = st.dRadius = sph.radius;
      st.phi = st.dPhi = sph.phi;
      st.theta = st.dTheta = sph.theta;
    }
  }, [camera]);

  useEffect(() => {
    const st = s.current;
    st.dTx = target[0];
    st.dTy = target[1];
    st.dTz = target[2];
    invalidate();
  }, [target, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    const st = s.current;

    const applyFit = () => {
      st.dRadius = Math.min(maxDistance, Math.max(minDistance, span * 1.35));
      st.dPhi = 1.05;
      st.dTheta = 0.7 + northRad;
      st.dTx = target[0];
      st.dTy = target[1];
      st.dTz = target[2];
    };

    const onCmd = (ev: Event) => {
      const cmd = (ev as CustomEvent<CamCommand>).detail;
      if (!cmd) return;
      if (cmd.kind === "fit" || cmd.kind === "iso") applyFit();
      if (cmd.kind === "top") {
        st.dPhi = 0.12;
        st.dTheta = northRad + Math.PI / 2;
        st.dRadius = Math.max(10, span * 1.15);
      }
      if (cmd.kind === "front") {
        st.dPhi = 1.35;
        st.dTheta = northRad + Math.PI / 2;
        st.dRadius = Math.max(10, span * 1.2);
      }
      if (cmd.kind === "back") {
        st.dPhi = 1.35;
        st.dTheta = northRad + Math.PI / 2 + Math.PI;
        st.dRadius = Math.max(10, span * 1.2);
      }
      if (cmd.kind === "north") {
        st.dPhi = 1.12;
        st.dTheta = northRad - Math.PI / 2;
        st.dRadius = Math.max(10, span * 1.25);
      }
      if (cmd.kind === "right") {
        st.dPhi = 1.32;
        st.dTheta = northRad;
        st.dRadius = Math.max(10, span * 1.2);
      }
      if (cmd.kind === "left") {
        st.dPhi = 1.32;
        st.dTheta = northRad + Math.PI;
        st.dRadius = Math.max(10, span * 1.2);
      }
      if (cmd.kind === "yawL") st.dTheta -= Math.PI / 2;
      if (cmd.kind === "yawR") st.dTheta += Math.PI / 2;
      if (cmd.kind === "focus") {
        st.dTx = cmd.x;
        st.dTy = cmd.y;
        st.dTz = cmd.z;
        st.dRadius = Math.min(maxDistance, Math.max(minDistance, cmd.radius ?? 9));
        st.dPhi = 1.05;
      }
      invalidate();
    };

    const orbitBy = (dx: number, dy: number) => {
      const n = navRef.current;
      const k = 0.0055 * n.sensitivity;
      const ix = n.invertOrbitX ? -1 : 1;
      const iy = n.invertOrbitY ? -1 : 1;
      const grab = n.orbitMode !== "regard";
      if (grab) {
        st.dTheta -= dx * k * ix;
        st.dPhi = Math.max(0.12, Math.min(1.48, st.dPhi - dy * 0.0048 * n.sensitivity * iy));
      } else {
        st.dTheta += dx * k * ix;
        st.dPhi = Math.max(0.12, Math.min(1.48, st.dPhi + dy * 0.0048 * n.sensitivity * iy));
      }
    };

    const panBy = (dx: number, dy: number) => {
      const n = navRef.current;
      const grab = n.orbitMode !== "regard";
      const pan = st.dRadius * 0.0022 * n.sensitivity * (n.invertPan ? -1 : 1);
      camBasis(st.dTheta, st.dPhi);
      const sx = grab ? -1 : 1;
      const sy = grab ? -1 : 1;
      st.dTx += (_right.x * dx * sx + _up.x * dy * sy) * pan;
      st.dTy += (_right.y * dx * sx + _up.y * dy * sy) * pan;
      st.dTz += (_right.z * dx * sx + _up.z * dy * sy) * pan;
    };

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      st.moved = 0;
      st.pan = e.button === 1 || e.button === 2 || e.shiftKey;
      if (st.pointers.size === 2) {
        const pts = [...st.pointers.values()];
        st.pinch = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
        st.midX = (pts[0]!.x + pts[1]!.x) / 2;
        st.midY = (pts[0]!.y + pts[1]!.y) / 2;
      }
      invalidate();
    };
    const move = (e: PointerEvent) => {
      const prev = st.pointers.get(e.pointerId);
      if (!prev) return;
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      st.moved += Math.hypot(dx, dy);
      if (isOrbitLocked()) {
        invalidate();
        return;
      }
      const n = navRef.current;
      if (st.pointers.size >= 2) {
        const pts = [...st.pointers.values()];
        const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
        const mx = (pts[0]!.x + pts[1]!.x) / 2;
        const my = (pts[0]!.y + pts[1]!.y) / 2;
        if (st.pinch > 0 && dist > 0) {
          const ratio = n.invertZoom ? dist / st.pinch : st.pinch / dist;
          st.dRadius = Math.min(maxDistance, Math.max(minDistance, st.dRadius * ratio));
        }
        panBy(mx - st.midX, my - st.midY);
        st.pinch = dist;
        st.midX = mx;
        st.midY = my;
      } else if (e.ctrlKey || e.metaKey) {
        st.dRadius = Math.min(maxDistance, Math.max(minDistance, st.dRadius * (dy > 0 ? 1.02 : 0.98)));
      } else if (st.pan) {
        panBy(dx, dy);
      } else if (st.moved > 6) {
        orbitBy(dx, dy);
      }
      invalidate();
    };
    const up = (e: PointerEvent) => {
      const wasOne = st.pointers.size === 1;
      st.pointers.delete(e.pointerId);
      if (st.pointers.size < 2) st.pinch = 0;
      st.pan = false;
      if (wasOne && st.moved < 10) {
        const now = performance.now();
        if (now - st.lastTap < 280) {
          dispatchCam({ kind: "fit" });
          st.lastTap = 0;
        } else {
          st.lastTap = now;
          if (tap.current) {
            const r = el.getBoundingClientRect();
            const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
            const ndcY = -(((e.clientY - r.top) / r.height) * 2 - 1);
            tap.current(ndcX, ndcY);
          }
        }
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isOrbitLocked()) return;
      const z = navRef.current.invertZoom ? -1 : 1;
      const factor = (e.deltaY > 0 ? 1.08 : 0.92) ** z;
      st.dRadius = Math.min(maxDistance, Math.max(minDistance, st.dRadius * factor));
      invalidate();
    };
    const ctx = (e: Event) => e.preventDefault();
    const kd = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useStudio.getState().view === "visite") return;
      if (e.code === "ArrowLeft") orbitBy(-16, 0);
      if (e.code === "ArrowRight") orbitBy(16, 0);
      if (e.code === "ArrowUp") orbitBy(0, -16);
      if (e.code === "ArrowDown") orbitBy(0, 16);
      if (e.code === "KeyQ") dispatchCam({ kind: "yawL" });
      if (e.code === "KeyE") dispatchCam({ kind: "yawR" });
      if (e.code === "KeyN") dispatchCam({ kind: "north" });
      if (e.code === "KeyF" && !e.metaKey && !e.ctrlKey) dispatchCam({ kind: "fit" });
      invalidate();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", ctx);
    window.addEventListener("forma-cam", onCmd);
    window.addEventListener("keydown", kd);
    window.__orbitTest = {
      getTheta: () => st.theta,
      getPhi: () => st.phi,
      getTarget: () => ({ x: st.tx, y: st.ty, z: st.tz }),
      nudgeX: (dx: number) => {
        orbitBy(dx, 0);
        invalidate();
      },
      panX: (dx: number) => {
        panBy(dx, 0);
        invalidate();
      },
    };
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", ctx);
      window.removeEventListener("forma-cam", onCmd);
      window.removeEventListener("keydown", kd);
      delete window.__orbitTest;
    };
  }, [gl, invalidate, minDistance, maxDistance, northRad, span, target]);

  useFrame((_, dt) => {
    const st = s.current;
    const damp = navRef.current.damping;
    const k = 1 - Math.exp(-damp * Math.min(dt, 0.05));
    st.theta += (st.dTheta - st.theta) * k;
    st.phi += (st.dPhi - st.phi) * k;
    st.radius += (st.dRadius - st.radius) * k;
    st.tx += (st.dTx - st.tx) * k;
    st.ty += (st.dTy - st.ty) * k;
    st.tz += (st.dTz - st.tz) * k;
    const sinP = Math.sin(st.phi);
    camera.position.set(
      st.tx + st.radius * sinP * Math.cos(st.theta),
      st.ty + st.radius * Math.cos(st.phi),
      st.tz + st.radius * sinP * Math.sin(st.theta),
    );
    camera.lookAt(st.tx, st.ty, st.tz);
    const busy =
      Math.abs(st.dTheta - st.theta) +
        Math.abs(st.dPhi - st.phi) +
        Math.abs(st.dRadius - st.radius) +
        Math.abs(st.dTx - st.tx) >
      0.002;
    if (busy) {
      invalidate();
      window.dispatchEvent(
        new CustomEvent("forma-pose", {
          detail: { theta: st.theta, phi: st.phi, north: northRad },
        }),
      );
    }
  });

  return null;
}

declare global {
  interface Window {
    __orbitTest?: {
      getTheta: () => number;
      getPhi: () => number;
      getTarget: () => { x: number; y: number; z: number };
      nudgeX: (dx: number) => void;
      panX: (dx: number) => void;
    };
  }
}
