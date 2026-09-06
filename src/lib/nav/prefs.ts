export type OrbitMode = "maquette" | "regard";

export interface NavPrefs {
  orbitMode: OrbitMode;
  invertOrbitX: boolean;
  invertOrbitY: boolean;
  invertPan: boolean;
  invertLook: boolean;
  invertZoom: boolean;
  sensitivity: number;
  damping: number;
  orthoCam: boolean;
  showCompass: boolean;
  showHud: boolean;
  walkSpeed: number;
  fov: number;
}

export const DEFAULT_NAV: NavPrefs = {
  orbitMode: "maquette",
  invertOrbitX: false,
  invertOrbitY: false,
  invertPan: false,
  invertLook: false,
  invertZoom: false,
  sensitivity: 1,
  damping: 14,
  orthoCam: false,
  showCompass: true,
  showHud: true,
  walkSpeed: 1,
  fov: 60,
};
