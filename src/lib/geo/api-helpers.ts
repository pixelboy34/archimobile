/** Shared JSON helpers for /api/geo/* routes. */

export function frenchGeoError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "Délai dépassé — cadastre indisponible";
    const m = err.message || "";
    if (/fetch failed|network|ECONN|ENOTFOUND|offline/i.test(m)) {
      return "Cadastre indisponible hors ligne";
    }
    if (m.includes("Cadastre indisponible")) return m;
    if (m.startsWith("BAN ") || m.startsWith("Cadastre HTTP")) {
      return "Service cadastre / adresse momentanément indisponible";
    }
    return m.length < 180 ? m : "Erreur géo";
  }
  return "Erreur géo";
}

export function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function jsonErr(message: string, status = 400): Response {
  return jsonOk({ error: message }, status);
}
