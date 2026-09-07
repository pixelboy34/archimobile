import { createFileRoute } from "@tanstack/react-router";
import { fetchParcelleByRef } from "@/lib/geo/cadastre";
import { frenchGeoError, jsonErr, jsonOk } from "@/lib/geo/api-helpers";

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  const codeInsee = (url.searchParams.get("code_insee") || "").trim();
  const section = (url.searchParams.get("section") || "").trim();
  const numero = (url.searchParams.get("numero") || "").trim();
  const codeArr = url.searchParams.get("code_arr") || undefined;
  if (!codeInsee || !section || !numero) {
    return jsonErr("Paramètres requis : code_insee, section, numero");
  }
  try {
    const parcelle = await fetchParcelleByRef({ codeInsee, section, numero, codeArr });
    if (!parcelle) return jsonErr("Parcelle introuvable pour cette référence", 404);
    return jsonOk({ parcelle });
  } catch (err) {
    return jsonErr(frenchGeoError(err), 503);
  }
}

export const Route = createFileRoute("/api/geo/parcelle")({
  server: { handlers: { GET: handle } },
});
