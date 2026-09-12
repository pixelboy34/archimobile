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
  /**
   * Stories beyond storyWindow rendered as "shell" before massing.
   * Default 2; tightened for R+24 / R+40.
   */
  shellBand: number;
  /** Only spawn interior lights within this story-index distance of active (0 = active only). */
  interiorLightRadius: number;
  /** Share one cheap material for shell-LOD walls (tall towers). */
  mergeFarWalls: boolean;
  /** InstancedMesh for repeating rect columns on shell floors. */
  instanceFarColumns: boolean;
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
      ground: 360,
      precision: "highp",
      texSize: 256,
      labels: true,
      fog: true,
      interiorLights: 12,
      simpleProps: false,
      storyWindow: 2,
      shellBand: 2,
      interiorLightRadius: 99,
      mergeFarWalls: false,
      instanceFarColumns: false,
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
  // Pas de branche « mobile » sur la qualite d'image : elle plafonnait le DPR a
  // 1,35 sur un telephone qui en demande 3, soit 45,6 % des pixels, avec
  // antialias coupe, texSize 160, ground 180, shadowMap 768 et etiquettes
  // eteintes. Le passage perf 44e0db9 l'avait introduite contre le profil de
  // 4b48503 (« Never degrade: PBR on, shadows on, DPR up to 2 »), et c'est la
  // regression de rendu deja signalee. Seul `weak` (2 coeurs, 2 Go, saveData,
  // 2G/3G) garde un profil reduit ; le cout des immeubles est borne par la
  // fenetre d'etages de tallBoost, pas en degradant l'image.
  return {
    mobile,
    weak,
    dpr: [1, Math.min(dpr, 2)],
    antialias: !weak,
    shadows: true,
    shadowMap: weak ? 512 : mobile ? 1024 : 2048,
    lambert: weak,
    gridDiv: mobile ? 24 : 48,
    ground: mobile ? 220 : 360,
    precision: mobile || weak ? "mediump" : "highp",
    texSize: weak ? 128 : 256,
    labels: true,
    fog: true,
    interiorLights: weak ? 3 : mobile ? 6 : 10,
    simpleProps: weak,
    storyWindow: mobile ? 1 : 2,
    shellBand: 2,
    interiorLightRadius: mobile ? 1 : 99,
    mergeFarWalls: false,
    instanceFarColumns: false,
  };
}

/**
 * Tall-building profile — only scales down for high story counts.
 * Normal villas (<8 stories) keep full PBR / shadows / props.
 * Does not force lighting.shadows off (user override stays); far-floor
 * meshes simply stop casting when BuildingScene windows them.
 *
 * Thresholds (isolateStory always restores full detail on the active floor):
 *   <8   — no change (villa / small collective)
 *   ≥8   — fewer lights, shadowMap≤1024, storyWindow≤mobile1/desktop2
 *   ≥16  — storyWindow=1, lights≤2/4, shadowMap≤512, interiorLightRadius=0
 *   ≥24  — tighter window (mobile 0), shellBand=1, mergeFarWalls, instanceFarColumns
 *   ≥40  — storyWindow=0 (active only full), shellBand=0 (else massing), labels off,
 *          interiorLights≤1, shadowMap≤256 mobile — R+40 phone stays interactive
 *
 * Ne touche jamais a simpleProps : le §5 exige des meubles composes en
 * permanence, et la fenetre d'etages borne deja le cout — mesure sur telephone,
 * un R+40 coute exactement ce que coute Tour Horizon (R+8) : 296 appels de
 * dessin par image en median, 330 au pic, temps d'image identique.
 */
export function tallBoost(base: RenderQuality, storyCount: number): RenderQuality {
  if (storyCount < 8) return base;
  const q: RenderQuality = { ...base };
  q.interiorLights = Math.min(q.interiorLights, base.mobile ? 3 : 5);
  q.shadowMap = Math.min(q.shadowMap, 1024);
  q.storyWindow = Math.min(q.storyWindow, base.mobile ? 1 : 2);
  q.interiorLightRadius = 1;
  if (storyCount >= 16) {
    q.interiorLights = Math.min(q.interiorLights, base.mobile ? 2 : 4);
    q.shadowMap = Math.min(q.shadowMap, 512);
    // Prefer fewer casters over killing global shadows (user can still enable).
    q.storyWindow = 1;
    q.interiorLightRadius = 0;
  }
  if (storyCount >= 24) {
    q.storyWindow = base.mobile ? 0 : 1;
    q.shellBand = 1;
    q.interiorLights = Math.min(q.interiorLights, base.mobile ? 1 : 2);
    q.interiorLightRadius = 0;
    q.mergeFarWalls = true;
    q.instanceFarColumns = true;
    if (base.mobile) q.labels = false;
  }
  if (storyCount >= 40) {
    // R+40 phone: active story full detail only; everything else massing (shellBand 0).
    q.storyWindow = 0;
    q.shellBand = 0;
    q.interiorLights = Math.min(q.interiorLights, 1);
    q.interiorLightRadius = 0;
    q.mergeFarWalls = true;
    q.instanceFarColumns = true;
    q.labels = false;
    q.shadowMap = Math.min(q.shadowMap, base.mobile ? 256 : 512);
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
