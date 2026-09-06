export type QualityProfile = {
  lambert: boolean
  simpleProps: boolean
  dpr: number
  shadows: boolean
  texSize: number
  groundSize: number
}

/** Never degrade: PBR on, shadows on, DPR up to 2. */
export function detectQuality(): QualityProfile {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const cores = navigator.hardwareConcurrency ?? 4
  const high = mem >= 4 && cores >= 4
  return {
    lambert: false,
    simpleProps: false,
    dpr: high ? 2 : 1.75,
    shadows: true,
    texSize: high ? 512 : 256,
    groundSize: high ? 420 : 280,
  }
}
