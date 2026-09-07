/** Shared lock so OrbitRig ignores pointers while a 3D gizmo is dragging. */

let locks = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function lockOrbit() {
  locks += 1;
  notify();
}

export function unlockOrbit() {
  locks = Math.max(0, locks - 1);
  notify();
}

export function isOrbitLocked(): boolean {
  return locks > 0;
}

export function subscribeOrbitLock(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
