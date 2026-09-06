import * as THREE from "three";

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

export type ArCaps = {
  camera: boolean;
  motion: boolean;
  webxr: boolean;
  ios: boolean;
};

export async function probeAr(): Promise<ArCaps> {
  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const camera = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const motion = typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  let webxr = false;
  try {
    webxr = Boolean(navigator.xr && (await navigator.xr.isSessionSupported("immersive-ar")));
  } catch {
    webxr = false;
  }
  return { camera, motion, webxr, ios };
}

export async function requestMotion(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };
  if (typeof DOE.requestPermission === "function") {
    try {
      return (await DOE.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();
    return stream;
  } catch {
    return null;
  }
}

export function orientationToQuat(
  alpha: number,
  beta: number,
  gamma: number,
  screenOrient: number,
  target: THREE.Quaternion,
) {
  euler.set(beta, alpha, -gamma, "YXZ");
  target.setFromEuler(euler);
  target.multiply(q1);
  target.multiply(q0.setFromAxisAngle(zee, -screenOrient));
}
