import type { BanHit, ParcelleLookup } from "./types";

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Cadastre indisponible hors ligne");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Erreur géo (${res.status})`);
  }
  return data;
}

export async function geoSearchAddress(q: string): Promise<BanHit[]> {
  const data = await getJson<{ results: BanHit[]; error?: string }>(
    `/api/geo/search?q=${encodeURIComponent(q)}&limit=5`,
  );
  return data.results ?? [];
}

export async function geoParcelleAt(lon: number, lat: number, address?: string): Promise<ParcelleLookup> {
  const params = new URLSearchParams({
    lon: String(lon),
    lat: String(lat),
  });
  if (address) params.set("address", address);
  const data = await getJson<{ parcelle: ParcelleLookup | null; error?: string }>(
    `/api/geo/parcelle-at?${params}`,
  );
  if (!data.parcelle) throw new Error(data.error || "Aucune parcelle à cet emplacement");
  return data.parcelle;
}

export async function geoParcelleByRef(ref: {
  codeInsee: string;
  section: string;
  numero: string;
  codeArr?: string;
}): Promise<ParcelleLookup> {
  const params = new URLSearchParams({
    code_insee: ref.codeInsee,
    section: ref.section,
    numero: ref.numero,
  });
  if (ref.codeArr) params.set("code_arr", ref.codeArr);
  const data = await getJson<{ parcelle: ParcelleLookup | null; error?: string }>(
    `/api/geo/parcelle?${params}`,
  );
  if (!data.parcelle) throw new Error(data.error || "Parcelle introuvable");
  return data.parcelle;
}
