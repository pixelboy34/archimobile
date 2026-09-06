export type RenderQuality = {
  mobile: boolean;
  weak: boolean;
  dpr: [number, number];
  antialias: boolean;
  shadows: boolean;
  shadowMap: number;
  lambert: boolean;
  gridDiv: number;
  ground: number;
  precision: "lowp" | "mediump" | "highp";
  texSize: number;
  labels: boolean;
  fog: boolean;
  interiorLights: number;
  simpleProps: boolean;
};

export function detectQuality(): RenderQuality {
  if (typeof window === "undefined") {
    return {
      mobile: false,
      weak: false,
      dpr: [1, 2],
      antialias: true,
      shadows: true,
      shadowMap: 2048,
      lambert: false,
      gridDiv: 48,
      ground: 280,
      precision: "highp",
      texSize: 256,
      labels: true,
      fog: true,
      interiorLights: 12,
      simpleProps: false,
    };
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 720;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  const saveData = Boolean(nav.connection?.saveData);
  const slowNet = nav.connection?.effectiveType === "2g" || nav.connection?.effectiveType === "3g";
  const cores = navigator.hardwareConcurrency || 8;
  const mem = nav.deviceMemory ?? 8;
  const dpr = window.devicePixelRatio || 1;
  const weak = cores <= 2 || saveData || slowNet || mem <= 2;
  const mobile = coarse || narrow;
  return {
    mobile,
    weak,
    dpr: [1, Math.min(dpr, mobile ? 2 : 2)],
    antialias: true,
    shadows: true,
    shadowMap: weak ? 512 : mobile ? 1024 : 2048,
    lambert: false,
    gridDiv: mobile ? 32 : 56,
    ground: mobile ? 220 : 360,
    precision: "highp",
    texSize: weak ? 128 : 256,
    labels: true,
    fog: true,
    interiorLights: weak ? 4 : mobile ? 8 : 12,
    simpleProps: false,
  };
}
