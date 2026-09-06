import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function formatMeters(n: number, digits = 2): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 })} m`;
}

export function formatArea(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m²`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
