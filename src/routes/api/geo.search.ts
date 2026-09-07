import { createFileRoute } from "@tanstack/react-router";
import { searchBanAddress } from "@/lib/geo/ban";
import { frenchGeoError, jsonErr, jsonOk } from "@/lib/geo/api-helpers";

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Number(url.searchParams.get("limit") || "5");
  if (q.length < 3) return jsonErr("Saisissez au moins 3 caractères d'adresse");
  try {
    const results = await searchBanAddress(q, limit);
    return jsonOk({ results });
  } catch (err) {
    return jsonErr(frenchGeoError(err), 503);
  }
}

export const Route = createFileRoute("/api/geo/search")({
  server: { handlers: { GET: handle } },
});
