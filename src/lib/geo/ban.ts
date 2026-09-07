import type { BanHit } from "./types";

const BAN = "https://api-adresse.data.gouv.fr/search/";
const FETCH_MS = 10_000;

interface BanFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    label: string;
    score: number;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    citycode?: string;
    context?: string;
    type?: string;
  };
}

interface BanCollection {
  type: "FeatureCollection";
  features: BanFeature[];
}

export async function searchBanAddress(q: string, limit = 5): Promise<BanHit[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  const url = `${BAN}?q=${encodeURIComponent(query)}&limit=${Math.min(10, Math.max(1, limit))}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`BAN HTTP ${res.status}`);
    const data = (await res.json()) as BanCollection;
    return (data.features ?? []).map((f) => ({
      label: f.properties.label,
      score: f.properties.score,
      housenumber: f.properties.housenumber,
      street: f.properties.street,
      postcode: f.properties.postcode,
      city: f.properties.city,
      citycode: f.properties.citycode,
      context: f.properties.context,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  } finally {
    clearTimeout(t);
  }
}
