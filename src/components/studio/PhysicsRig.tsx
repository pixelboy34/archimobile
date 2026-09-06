import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { Collider, KinematicCharacterController, RigidBody, World } from "@dimforge/rapier3d-compat";
import type { Project } from "@/lib/bim/types";
import {
  createBuildingWorld,
  EYE_OFFSET,
  loadRapier,
  PLAYER_HALF,
  PLAYER_RADIUS,
  type Rapier,
} from "@/lib/physics/rapier-world";

export interface PhysicsApi {
  ready: boolean;
  reset: (x: number, y: number, z: number) => void;
  tick: (
    dt: number,
    wishX: number,
    wishZ: number,
    jump: boolean,
  ) => { x: number; y: number; z: number; eye: number };
}

const Ctx = createContext<PhysicsApi | null>(null);

export function usePhysics() {
  return useContext(Ctx);
}

export function PhysicsRig({
  project,
  storyId,
  start,
  children,
}: {
  project: Project;
  storyId: string | null;
  start: [number, number, number];
  children: ReactNode;
}) {
  const Rref = useRef<Rapier | null>(null);
  const worldRef = useRef<World | null>(null);
  const bodyRef = useRef<RigidBody | null>(null);
  const colRef = useRef<Collider | null>(null);
  const ctrlRef = useRef<KinematicCharacterController | null>(null);
  const vy = useRef(0);
  const apiRef = useRef<PhysicsApi>({
    ready: false,
    reset: () => {},
    tick: () => ({ x: start[0], y: start[1], z: start[2], eye: start[1] }),
  });

  useEffect(() => {
    let dead = false;
    void loadRapier().then((R) => {
      if (dead) return;
      Rref.current = R;
      const world = createBuildingWorld(R, project, storyId);
      const body = world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(start[0], start[1], start[2]),
      );
      const col = world.createCollider(R.ColliderDesc.capsule(PLAYER_HALF, PLAYER_RADIUS), body);
      const ctrl = world.createCharacterController(0.02);
      ctrl.setUp({ x: 0, y: 1, z: 0 });
      ctrl.enableAutostep(0.38, 0.22, true);
      ctrl.enableSnapToGround(0.45);
      ctrl.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
      ctrl.setMinSlopeSlideAngle((60 * Math.PI) / 180);
      worldRef.current = world;
      bodyRef.current = body;
      colRef.current = col;
      ctrlRef.current = ctrl;
      vy.current = 0;
      apiRef.current.ready = true;
    });
    return () => {
      dead = true;
      apiRef.current.ready = false;
      ctrlRef.current?.free();
      worldRef.current?.free();
      worldRef.current = null;
      bodyRef.current = null;
      colRef.current = null;
      ctrlRef.current = null;
    };
  }, [project.id, project.updatedAt, storyId, start[0], start[1], start[2]]);

  apiRef.current.reset = (x, y, z) => {
    bodyRef.current?.setNextKinematicTranslation({ x, y, z });
    vy.current = 0;
  };

  apiRef.current.tick = (dt, wishX, wishZ, jump) => {
    const world = worldRef.current;
    const body = bodyRef.current;
    const col = colRef.current;
    const ctrl = ctrlRef.current;
    if (!world || !body || !col || !ctrl) {
      return { x: start[0], y: start[1], z: start[2], eye: start[1] + EYE_OFFSET };
    }
    if (vy.current > 0.2) ctrl.enableSnapToGround(0);
    else ctrl.enableSnapToGround(0.45);
    const grounded = ctrl.computedGrounded();
    if (grounded && vy.current <= 0) vy.current = jump ? 4.2 : 0;
    else vy.current -= 18 * dt;
    const desired = { x: wishX * dt, y: vy.current * dt, z: wishZ * dt };
    ctrl.computeColliderMovement(col, desired);
    const mv = ctrl.computedMovement();
    const t = body.translation();
    body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    world.timestep = Math.min(dt, 0.04);
    world.step();
    const p = body.translation();
    return { x: p.x, y: p.y, z: p.z, eye: p.y + EYE_OFFSET };
  };

  return <Ctx.Provider value={apiRef.current}>{children}</Ctx.Provider>;
}
