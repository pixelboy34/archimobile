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
  /** Full-detail story radius when not isolating (1 mobile, 2 desktop). */
  storyWindow: number;
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
      storyWindow: 2,
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
    storyWindow: mobile ? 1 : 2,
  };
}

/**
 * Tall-building profile — only scales down for high story counts.
 * Normal villas (few stories) keep full PBR / shadows / props.
 * Does not force lighting.shadows off (user override stays); far-floor
 * meshes simply stop casting when BuildingScene windows them.
 */
export function tallBoost(base: RenderQuality, storyCount: number): RenderQuality {
  if (storyCount < 8) return base;
  const q: RenderQuality = { ...base };
  q.interiorLights = Math.min(q.interiorLights, base.mobile ? 3 : 5);
  q.simpleProps = true;
  q.shadowMap = Math.min(q.shadowMap, 1024);
  q.storyWindow = Math.min(q.storyWindow, base.mobile ? 1 : 2);
  if (storyCount >= 16) {
    q.interiorLights = Math.min(q.interiorLights, base.mobile ? 2 : 4);
    q.shadowMap = Math.min(q.shadowMap, 512);
    // Prefer fewer casters over killing global shadows (user can still enable).
    q.storyWindow = 1;
  }
  return q;
}

/** Index distance from active story; Infinity if unknown. */
export function storyDistance(
  stories: { id: string }[],
  storyId: string | null | undefined,
  activeId: string | null | undefined,
): number {
  if (!storyId || !activeId) return 0;
  const a = stories.findIndex((s) => s.id === activeId);
  const b = stories.findIndex((s) => s.id === storyId);
  if (a < 0 || b < 0) return 0;
  return Math.abs(a - b);
}
