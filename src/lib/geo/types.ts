/** Cadastre IGN / data.gouv — indicatif, pas un certificat d'urbanisme. */

export interface BanHit {
  label: string;
  score: number;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  citycode?: string;
  context?: string;
  lon: number;
  lat: number;
}

export interface ParcelleRef {
  idu: string;
  codeInsee: string;
  section: string;
  numero: string;
  codeDep?: string;
  codeArr?: string;
  nomCom?: string;
  /** Contenance cadastrale (m²), si fournie */
  contenance?: number;
}

export interface ParcelleGeometry {
  /** Anneau WGS84 [lon, lat][] (extérieur, fermé ou non) */
  ringWgs84: [number, number][];
  /** Anneau local XY mètres, centré sur le centroïde */
  ringLocalM: [number, number][];
  centroid: { lon: number; lat: number };
  /** Surface m² (géométrie ou contenance) */
  areaM2: number;
}

export interface ParcelleLookup extends ParcelleRef, ParcelleGeometry {
  address?: string;
  source: "ign-cadastre";
}

/** Persisted on Project.meta */
export interface ProjectParcelleMeta {
  idu: string;
  codeInsee: string;
  section: string;
  numero: string;
  codeArr?: string;
  nomCom?: string;
  address?: string;
  areaM2: number;
  /** Local XY meters, centroid-centered — for Plan2D / Site underlay */
  ring: [number, number][];
  centroid: { lon: number; lat: number };
  source: "ign-cadastre";
  updatedAt?: string;
}
