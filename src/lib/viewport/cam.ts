export type CamCommand =
  | { kind: "iso" | "top" | "front" | "right" | "left" | "back" | "fit" | "north" | "yawL" | "yawR" }
  | { kind: "focus"; x: number; y: number; z: number; radius?: number };

export function dispatchCam(cmd: CamCommand) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CamCommand>("forma-cam", { detail: cmd }));
}
