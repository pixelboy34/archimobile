import { readJsonOrThrow } from "./api-helpers";
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
    const data = await readJsonOrThrow<BanCollection>(res, "adresse");
    // Chaque entrée est lue défensivement : la BAN renvoie parfois un résultat
    // sans géométrie, et `f.geometry.coordinates[0]` levait alors un TypeError
    // dont le message V8 remontait en anglais jusqu'au bandeau. Une entrée
    // inexploitable est écartée, elle ne fait pas échouer la recherche entière.
    return (Array.isArray(data?.features) ? data.features : []).flatMap((f) => {
      const p = f?.properties;
      const c = f?.geometry?.coordinates;
      if (!p || !Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") return [];
      return [
        {
          label: p.label,
          score: p.score,
          housenumber: p.housenumber,
          street: p.street,
          postcode: p.postcode,
          city: p.city,
          citycode: p.citycode,
          context: p.context,
          lon: c[0],
          lat: c[1],
        },
      ];
    });
  } finally {
    clearTimeout(t);
  }
}
