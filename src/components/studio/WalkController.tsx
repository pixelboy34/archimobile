import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EYE_OFFSET } from "@/lib/physics/rapier-world";
import { useStudio } from "@/lib/store/project-store";
import { usePhysics } from "./PhysicsRig";

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const keys = new Set<string>();

export function WalkController({ start }: { start: [number, number, number] }) {
  const { camera, gl, invalidate } = useThree();
  const physics = usePhysics();
  const invertLook = useStudio((s) => s.nav.invertLook);
  const walkSpeed = useStudio((s) => s.nav.walkSpeed);
  const yaw = useRef(0);
  const pitch = useRef(-0.08);
  const dYaw = useRef(0);
  const dPitch = useRef(-0.08);
  const pos = useRef(new THREE.Vector3(...start));
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const joy = useRef({ x: 0, y: 0 });
  const jumpHeld = useRef(false);

  useEffect(() => {
    pos.current.set(start[0], start[1], start[2]);
    camera.position.copy(pos.current);
    physics?.reset(start[0], start[1], start[2]);
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch" && e.clientX < el.clientWidth * 0.42) return;
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      const look = invertLook ? -1 : 1;
      dYaw.current -= dx * 0.0046 * look;
      dPitch.current = Math.max(-1.15, Math.min(1.05, dPitch.current - dy * 0.0038 * look));
    };
    const up = () => {
      dragging.current = false;
    };
    const kd = (e: KeyboardEvent) => keys.add(e.code);
    const ku = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    const onJoy = ((e: CustomEvent<{ x: number; y: number }>) => {
      joy.current = e.detail;
    }) as EventListener;
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    window.addEventListener("forma-joy", onJoy);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      window.removeEventListener("forma-joy", onJoy);
    };
  }, [camera, gl, start, invertLook, physics]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.08);
    const k = 1 - Math.exp(-14 * dt);
    yaw.current += (dYaw.current - yaw.current) * k;
    pitch.current += (dPitch.current - pitch.current) * k;
    const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 5.2 : 2.4) * walkSpeed;
    forward.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    right.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current));
    let mx = joy.current.x;
    let mz = -joy.current.y;
    if (keys.has("KeyW") || keys.has("ArrowUp")) mz += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) mz -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }
    const jump = keys.has("Space") && !jumpHeld.current;
    jumpHeld.current = keys.has("Space");
    const wishX = forward.x * mz * speed + right.x * mx * speed;
    const wishZ = forward.z * mz * speed + right.z * mx * speed;
    if (physics?.ready) {
      const p = physics.tick(dt, wishX, wishZ, jump);
      pos.current.set(p.x, p.eye, p.z);
    } else {
      pos.current.addScaledVector(forward, mz * speed * dt);
      pos.current.addScaledVector(right, mx * speed * dt);
      pos.current.y = start[1] + (physics ? EYE_OFFSET : 0);
    }
    camera.position.copy(pos.current);
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    if (mag > 0.02 || dragging.current || Math.abs(dYaw.current - yaw.current) > 0.001) invalidate();
  });

  return null;
}
