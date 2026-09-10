import { openRing, wgs84RingToLocal } from "./geometry";
import type { ParcelleLookup, ParcelleRef } from "./types";
import { CITY_PRESETS, type CityPreset } from "@/lib/bim/feasibility";

const APICARTO = "https://apicarto.ign.fr/api/cadastre";
const FETCH_MS = 12_000;

export type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface CadastreFeature {
  type: "Feature";
  geometry: GeoJsonGeometry | null;
  properties: {
    idu?: string;
    numero?: string;
    section?: string;
    code_insee?: string;
    code_dep?: string;
    code_arr?: string;
    nom_com?: string;
    contenance?: number;
    [k: string]: unknown;
  };
}

export interface CadastreCollection {
  type: "FeatureCollection";
  features: CadastreFeature[];
  numberMatched?: number;
}

function padNumero(n: string): string {
  const t = n.replace(/\s/g, "").toUpperCase();
  if (/^\d+$/.test(t)) return t.padStart(4, "0");
  return t;
}

function extractExteriorRing(geom: GeoJsonGeometry | null): [number, number][] | null {
  if (!geom) return null;
  let ring: number[][] | undefined;
  if (geom.type === "Polygon") ring = geom.coordinates[0];
  else if (geom.type === "MultiPolygon") ring = geom.coordinates[0]?.[0];
  if (!ring || ring.length < 3) return null;
  return ring.map((c) => [c[0]!, c[1]!] as [number, number]);
}

export function featureToParcelle(
  feature: CadastreFeature,
  address?: string,
): ParcelleLookup | null {
  const p = feature.properties ?? {};
  const ringWgs84 = extractExteriorRing(feature.geometry);
  if (!ringWgs84) return null;
  const { ringLocalM, centroid, areaM2: geomArea } = wgs84RingToLocal(ringWgs84);
  const contenance = typeof p.contenance === "number" && p.contenance > 0 ? p.contenance : undefined;
  const areaM2 = geomArea > 1 ? Math.round(geomArea) : contenance ?? Math.round(geomArea);
  const numero = padNumero(String(p.numero ?? ""));
  const section = String(p.section ?? "").trim().toUpperCase();
  const codeInsee = String(p.code_insee ?? "");
  const idu = String(p.idu ?? `${codeInsee}${section}${numero}`);
  if (!section || !numero || !codeInsee) return null;
  return {
    idu,
    codeInsee,
    section,
    numero,
    codeDep: p.code_dep ? String(p.code_dep) : undefined,
    codeArr: p.code_arr && p.code_arr !== "000" ? String(p.code_arr) : undefined,
    nomCom: p.nom_com ? String(p.nom_com) : undefined,
    contenance,
    ringWgs84: openRing(ringWgs84),
    ringLocalM: openRing(ringLocalM),
    centroid,
    areaM2,
    address,
    source: "ign-cadastre",
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cadastre HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/** Point-in-parcelle via GeoJSON Point geom (API Carto). */
export async function fetchParcelleAtPoint(
  lon: number,
  lat: number,
  address?: string,
): Promise<ParcelleLookup | null> {
  const geom = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
  const url = `${APICARTO}/parcelle?geom=${encodeURIComponent(geom)}`;
  const data = await fetchJson<CadastreCollection>(url);
  const feature = data.features?.[0];
  if (!feature) return null;
  return featureToParcelle(feature, address);
}

/** Lookup by commune + section + numero (numero 4 chars). Paris: prefer code_arr. */
export async function fetchParcelleByRef(ref: {
  codeInsee: string;
  section: string;
  numero: string;
  codeArr?: string;
}): Promise<ParcelleLookup | null> {
  const params = new URLSearchParams({
    code_insee: ref.codeInsee,
    section: ref.section.trim().toUpperCase(),
    numero: padNumero(ref.numero),
  });
  if (ref.codeArr) params.set("code_arr", ref.codeArr);
  const url = `${APICARTO}/parcelle?${params}`;
  const data = await fetchJson<CadastreCollection>(url);
  const features = data.features ?? [];
  if (features.length === 0) return null;
  // La meme section/numero existe d'un arrondissement a l'autre (AM0028 a Paris) :
  // sans code d'arrondissement on garde la premiere, l'appelant devant preferer
  // la recherche par point des qu'il dispose de coordonnees.
  const feature = features[0]!;
  return featureToParcelle(feature);
}

export function formatCadastralRef(p: Pick<ParcelleRef, "section" | "numero" | "codeInsee" | "idu">): string {
  const num = p.numero.replace(/^0+/, "") || p.numero;
  return `${p.section} ${num} · ${p.codeInsee}${p.idu ? ` · ${p.idu}` : ""}`;
}

export function nearestCityPreset(lat: number, lon: number): CityPreset {
  let best = CITY_PRESETS[0]!;
  let bestD = Infinity;
  for (const c of CITY_PRESETS) {
    const dlat = c.latitude - lat;
    const dlon = c.longitude - lon;
    const d = dlat * dlat + dlon * dlon;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function parcelleToMetaPatch(
  p: ParcelleLookup,
  opts?: { applyClimateCaps?: boolean },
): {
  plotM2: number;
  latitude: number;
  longitude: number;
  location?: string;
  climate?: string;
  ces?: number;
  cos?: number;
  parcelle: import("./types").ProjectParcelleMeta;
} {
  const city = nearestCityPreset(p.centroid.lat, p.centroid.lon);
  const location =
    p.address ||
    [p.nomCom, p.codeInsee !== "75056" ? undefined : "Paris"].filter(Boolean).join(" · ") ||
    city.label;
  const patch: ReturnType<typeof parcelleToMetaPatch> = {
    plotM2: p.areaM2,
    latitude: Math.round(p.centroid.lat * 1e5) / 1e5,
    longitude: Math.round(p.centroid.lon * 1e5) / 1e5,
    location,
    parcelle: {
      idu: p.idu,
      codeInsee: p.codeInsee,
      section: p.section,
      numero: p.numero,
      codeArr: p.codeArr,
      nomCom: p.nomCom,
      address: p.address,
      areaM2: p.areaM2,
      ring: p.ringLocalM,
      centroid: p.centroid,
      source: "ign-cadastre",
      updatedAt: new Date().toISOString(),
    },
  };
  if (opts?.applyClimateCaps !== false) {
    patch.climate = city.climate;
    patch.ces = city.ces;
    patch.cos = city.cos;
  }
  return patch;
}

export const CADASTRE_DISCLAIMER =
  "Données cadastre IGN / data.gouv — indicatif, pas un certificat d'urbanisme";
