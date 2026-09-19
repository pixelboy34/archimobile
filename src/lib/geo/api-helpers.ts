/** Shared JSON helpers for /api/geo/* routes. */

/**
 * Message affichable, toujours en français.
 *
 * La version précédente finissait par `return m.length < 180 ? m : "Erreur géo"`
 * et laissait donc passer TOUT message d'exception assez court. Il suffisait
 * qu'une passerelle réponde en HTML, ou qu'une entrée BAN arrive sans
 * géométrie, pour afficher « Cannot read properties of undefined » ou
 * « Unexpected token < in JSON » dans une interface française (§0.7).
 *
 * Le principe est inversé : on ne réémet QUE les messages que nous avons
 * produits nous-mêmes ; tout le reste retombe sur une phrase générique. Une
 * liste blanche ne peut pas fuir, une liste noire finit toujours par laisser
 * passer quelque chose.
 */
export function frenchGeoError(err: unknown): string {
  if (!(err instanceof Error)) return "Erreur géo — service indisponible";
  if (err.name === "AbortError") return "Délai dépassé — cadastre indisponible";

  const m = err.message || "";
  if (/fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN|offline/i.test(m)) {
    return "Cadastre indisponible hors ligne";
  }
  // Une réponse qui n'est pas du JSON, ou dont la forme n'est pas celle
  // attendue : le service a répondu, mais pas ce qu'il annonce.
  if (err instanceof SyntaxError || err instanceof TypeError) {
    return "Réponse inattendue du service adresse / cadastre — réessayez";
  }
  if (m.includes("Cadastre indisponible")) return m;
  if (m.startsWith("BAN ") || m.startsWith("Cadastre HTTP")) {
    return "Service cadastre / adresse momentanément indisponible";
  }
  // Nos propres messages sont marqués : eux seuls repassent tels quels.
  if (m.startsWith(GEO_PREFIX)) return m.slice(GEO_PREFIX.length);
  return "Erreur géo — service indisponible";
}

/**
 * Marque nos propres messages, seuls autorisés à atteindre l'utilisateur.
 * Un préfixe lisible et non un octet nul : ce dernier faisait passer le fichier
 * pour binaire aux yeux de git et de grep. Il est retiré avant affichage.
 */
const GEO_PREFIX = "forma-geo:";

/** Erreur dont le message est déjà rédigé en français pour l'utilisateur. */
export function geoError(messageFr: string): Error {
  return new Error(GEO_PREFIX + messageFr);
}

/**
 * Lit le corps JSON d'une réponse tierce sans jamais laisser fuir l'erreur
 * native. Une passerelle qui répond en HTML est le cas courant.
 */
export async function readJsonOrThrow<T>(res: Response, service: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw geoError(`Réponse illisible du service ${service} — réessayez`);
  }
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
