import { createFileRoute } from "@tanstack/react-router";
import { fetchParcelleAtPoint } from "@/lib/geo/cadastre";
import { frenchGeoError, jsonErr, jsonOk } from "@/lib/geo/api-helpers";

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  const lon = Number(url.searchParams.get("lon"));
  const lat = Number(url.searchParams.get("lat"));
  const address = url.searchParams.get("address") || undefined;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return jsonErr("Coordonnées lon/lat invalides");
  }
  if (lon < -10 || lon > 15 || lat < 40 || lat > 52) {
    return jsonErr("Point hors France métropolitaine (indicatif)");
  }
  try {
    const parcelle = await fetchParcelleAtPoint(lon, lat, address);
    if (!parcelle) return jsonErr("Aucune parcelle cadastrale à cet emplacement", 404);
    return jsonOk({ parcelle });
  } catch (err) {
    return jsonErr(frenchGeoError(err), 503);
  }
}

export const Route = createFileRoute("/api/geo/parcelle-at")({
  server: { handlers: { GET: handle } },
});
