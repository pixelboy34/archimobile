import { analyzeProject, type ProjectAnalysis } from "./analysis";
import { aboveGroundHeight } from "./planSvg";
import type { ClimateZone, Project, Typology } from "./types";
import type { Lighting } from "../render/lighting";

export type FeasibilityVerdict = "ok" | "watch" | "fail";

export interface RatioGauge {
  actual: number;
  cap: number;
  ok: boolean;
}

export interface FeasibilityReport {
  verdict: FeasibilityVerdict;
  score: number;
  gauges: {
    ces: RatioGauge;
    cos: RatioGauge;
    daylight: number;
    energy: number;
  };
  heightM: number;
  stories: number;
  sdp: number;
  emprise: number;
  bullets: string[];
  solarHint: string;
}

/** Indicative city defaults — not legal PLU. Offline only. */
export interface CityPreset {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  climate: ClimateZone;
  /** Typical CES (emprise / parcelle), indicatif */
  ces: number;
  /** Typical COS (SDP / parcelle), indicatif */
  cos: number;
}

export const CITY_PRESETS: CityPreset[] = [
  { id: "paris", label: "Paris", latitude: 48.86, longitude: 2.35, climate: "H1", ces: 0.55, cos: 3.0 },
  { id: "lyon", label: "Lyon", latitude: 45.76, longitude: 4.84, climate: "H1", ces: 0.5, cos: 2.5 },
  { id: "marseille", label: "Marseille", latitude: 43.3, longitude: 5.4, climate: "H3", ces: 0.5, cos: 2.0 },
  { id: "bordeaux", label: "Bordeaux", latitude: 44.84, longitude: -0.58, climate: "H2", ces: 0.45, cos: 1.8 },
  { id: "lille", label: "Lille", latitude: 50.63, longitude: 3.06, climate: "H1", ces: 0.5, cos: 2.2 },
  { id: "nice", label: "Nice", latitude: 43.7, longitude: 7.27, climate: "H3", ces: 0.5, cos: 2.4 },
];

export const VERDICT_LABELS: Record<FeasibilityVerdict, string> = {
  ok: "Conforme",
  watch: "À surveiller",
  fail: "Non conforme",
};

/** Soft height envelopes by typology (m above ground) — design heuristics. */
const TYPOLOGY_HEIGHT: Record<Typology, { soft: number; hard: number }> = {
  house: { soft: 8, hard: 12 },
  villa: { soft: 10, hard: 14 },
  collective: { soft: 28, hard: 50 },
  office: { soft: 35, hard: 60 },
  atelier: { soft: 10, hard: 16 },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function ratioScore(actual: number, cap: number): { score: number; ok: boolean; overrun: boolean } {
  if (!(cap > 0)) return { score: 72, ok: true, overrun: false };
  const ratio = actual / cap;
  if (ratio <= 0.85) return { score: 100, ok: true, overrun: false };
  if (ratio <= 1.0) return { score: 82, ok: true, overrun: false };
  if (ratio <= 1.08) return { score: 48, ok: false, overrun: true };
  if (ratio <= 1.2) return { score: 28, ok: false, overrun: true };
  return { score: 8, ok: false, overrun: true };
}

function heightScore(heightM: number, typology: Typology | undefined): { score: number; note?: string } {
  const t = typology ?? "house";
  const band = TYPOLOGY_HEIGHT[t] ?? TYPOLOGY_HEIGHT.house;
  if (heightM <= band.soft) return { score: 100 };
  if (heightM <= band.hard) {
    return {
      score: 58,
      note: `Hauteur ${heightM.toFixed(1)} m élevée pour ${t === "collective" ? "un collectif" : "cette typologie"} (indicatif).`,
    };
  }
  return {
    score: 22,
    note: `Hauteur ${heightM.toFixed(1)} m hors enveloppe typique (${band.hard} m) — vérifier PLU / gabarit.`,
  };
}

function glazingRatio(analysis: ProjectAnalysis): number {
  return analysis.netArea > 1 ? analysis.windowArea / analysis.netArea : 0;
}

/** Solar / daylight hint from latitude, month and glazing. */
export function solarHintFrom(
  latitude: number,
  month: number,
  glazing: number,
  climate?: string,
): string {
  const lat = Number.isFinite(latitude) ? latitude : 46;
  const m = clamp(Math.round(month || 6), 1, 12);
  const summer = m >= 5 && m <= 9;
  const southStrong = lat >= 41 && lat <= 52;
  const mediterranean = climate === "H3" || lat < 44.5;
  const parts: string[] = [];

  if (southStrong && summer && glazing > 0.28) {
    parts.push("Apports sud favorables · risque surchauffe si survitrage");
  } else if (southStrong && summer) {
    parts.push("Apports sud favorables · ombrages d'été recommandés");
  } else if (southStrong && !summer) {
    parts.push("Soleil bas d'hiver · privilégier baies sud");
  } else if (lat > 52) {
    parts.push("Latitude nord · maximiser lumière naturelle et baies sud");
  } else {
    parts.push("Apports solaires à calibrer selon orientation");
  }

  if (mediterranean && summer) {
    parts.push("climat H3 / sud : inertie + protections solaires");
  } else if (climate === "H1" && !summer) {
    parts.push("H1 : attention ponts thermiques et apports hiver");
  }

  if (glazing < 0.12) parts.push("vitrage faible");
  if (glazing > 0.35) parts.push("survitrage");

  return parts.join(" · ");
}

export function assessFeasibility(
  project: Project,
  lighting?: Pick<Lighting, "month"> | null,
  analysis?: ProjectAnalysis,
): FeasibilityReport {
  const a = analysis ?? analyzeProject(project);
  const cesCap = project.meta.ces ?? 0;
  const cosCap = project.meta.cos ?? 0;
  const ces = ratioScore(a.cesActual, cesCap);
  const cos = ratioScore(a.cosActual, cosCap);
  const heightM = aboveGroundHeight(project);
  const stories = project.stories.length;
  const height = heightScore(heightM, project.meta.typology);
  const glazing = glazingRatio(a);
  const month = lighting?.month ?? 6;
  const solarHint = solarHintFrom(project.meta.latitude, month, glazing, project.meta.climate as string | undefined);

  const score = Math.round(
    clamp(
      ces.score * 0.28 +
        cos.score * 0.28 +
        a.daylightScore * 0.18 +
        a.energyScore * 0.14 +
        height.score * 0.12,
      0,
      100,
    ),
  );

  const hardFail = (cesCap > 0 && a.cesActual > cesCap + 0.01) || (cosCap > 0 && a.cosActual > cosCap + 0.01);
  const softWatch =
    (cesCap > 0 && a.cesActual > cesCap * 0.92 && a.cesActual <= cesCap + 0.01) ||
    (cosCap > 0 && a.cosActual > cosCap * 0.92 && a.cosActual <= cosCap + 0.01) ||
    height.score < 70 ||
    a.daylightScore < 45 ||
    a.energyScore < 45;

  let verdict: FeasibilityVerdict = "ok";
  if (hardFail || score < 45 || height.score <= 22) verdict = "fail";
  else if (softWatch || score < 70) verdict = "watch";

  const bullets: string[] = [];
  for (const n of a.notes) {
    if (!bullets.includes(n)) bullets.push(n);
  }
  if (height.note && !bullets.includes(height.note)) bullets.push(height.note);
  if (project.meta.plotM2 == null || project.meta.plotM2 < 1) {
    bullets.unshift("Parcelle non renseignée — CES/COS indicatifs indisponibles.");
  } else if (project.meta.parcelle?.areaM2) {
    bullets.unshift(
      `Parcelle cadastre ${project.meta.parcelle.section} ${project.meta.parcelle.numero} · ${Math.round(project.meta.parcelle.areaM2).toLocaleString("fr-FR")} m² (IGN / data.gouv — indicatif).`,
    );
  }
  if (cesCap <= 0 || cosCap <= 0) {
    bullets.push("Plafonds CES/COS absents — appliquer un preset ville (indicatif) ou saisie PLU.");
  }
  bullets.push(solarHint);

  // Keep actionable and short
  const trimmed = bullets.filter(Boolean).slice(0, 8);

  return {
    verdict,
    score,
    gauges: {
      ces: { actual: a.cesActual, cap: cesCap, ok: ces.ok },
      cos: { actual: a.cosActual, cap: cosCap, ok: cos.ok },
      daylight: a.daylightScore,
      energy: a.energyScore,
    },
    heightM,
    stories,
    sdp: a.floorArea,
    emprise: a.footprint,
    bullets: trimmed,
    solarHint,
  };
}

export function applyCityPresetMeta(preset: CityPreset): Partial<Project["meta"]> {
  return {
    location: preset.label,
    latitude: preset.latitude,
    longitude: preset.longitude,
    climate: preset.climate,
    ces: preset.ces,
    cos: preset.cos,
  };
}
