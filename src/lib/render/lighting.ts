export type InteriorMode = "auto" | "on" | "off";

export interface Lighting {
  sunHour: number;
  month: number;
  sunIntensity: number;
  fill: number;
  ambient: number;
  hemi: number;
  exposure: number;
  shadows: boolean;
  shadowSoftness: number;
  interior: InteriorMode;
  interiorGain: number;
}

export const DEFAULT_LIGHTING: Lighting = {
  sunHour: 14,
  month: 6,
  sunIntensity: 2.4,
  fill: 0.62,
  ambient: 0.62,
  hemi: 0.9,
  exposure: 1.2,
  shadows: true,
  shadowSoftness: 0.4,
  interior: "auto",
  interiorGain: 0.9,
};

export const MONTH_LABELS = [
  "Janv.",
  "Févr.",
  "Mars",
  "Avr.",
  "Mai",
  "Juin",
  "Juil.",
  "Août",
  "Sept.",
  "Oct.",
  "Nov.",
  "Déc.",
];

export const LIGHT_PRESETS: { id: string; label: string; patch: Partial<Lighting> }[] = [
  { id: "dawn", label: "Aube", patch: { sunHour: 7, sunIntensity: 1.2, fill: 0.5, ambient: 0.4, hemi: 0.55, exposure: 1, shadows: true } },
  { id: "noon", label: "Midi", patch: { sunHour: 13, sunIntensity: 2.2, fill: 0.4, ambient: 0.4, hemi: 0.8, exposure: 1.15, shadows: true } },
  { id: "dusk", label: "Crépuscule", patch: { sunHour: 18.5, sunIntensity: 0.9, fill: 0.55, ambient: 0.36, hemi: 0.5, exposure: 1, shadows: true } },
  { id: "night", label: "Nuit", patch: { sunHour: 21, sunIntensity: 0.08, fill: 0.14, ambient: 0.18, hemi: 0.22, exposure: 0.85, interior: "on" } },
  { id: "overcast", label: "Couvert", patch: { sunHour: 12, sunIntensity: 0.55, fill: 0.7, ambient: 0.62, hemi: 0.85, exposure: 1.05, shadows: false } },
];

export function isNight(hour: number): boolean {
  return hour < 7 || hour >= 19.5;
}

export function interiorOn(lighting: Lighting): boolean {
  if (lighting.interior === "on") return true;
  if (lighting.interior === "off") return false;
  return isNight(lighting.sunHour);
}

export function skyColor(hour: number): string {
  const t = Math.min(1, Math.max(0, (hour - 6) / 14));
  if (t < 0.08 || t > 0.92) return "#0e1014";
  if (t < 0.18) return "#2a2420";
  if (t > 0.82) return "#1c1816";
  if (t < 0.32) return "#3d444c";
  if (t > 0.72) return "#5a4a42";
  return "#8ea4ad";
}

export function sunColor(hour: number): string {
  const t = Math.min(1, Math.max(0, (hour - 6) / 14));
  if (t < 0.16 || t > 0.86) return "#ffb070";
  if (t < 0.28 || t > 0.74) return "#ffd0a0";
  return "#fff3e0";
}
