import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { frenchGeoError, geoError, readJsonOrThrow } from "./api-helpers.ts";

/**
 * Aucun message technique ne doit atteindre une interface française (§0.7).
 *
 * L'ancienne version finissait par `m.length < 180 ? m : "Erreur géo"` : tout
 * message d'exception assez court passait tel quel. Une passerelle répondant en
 * HTML, ou une entrée BAN sans géométrie, affichaient donc « Unexpected token
 * < in JSON » ou « Cannot read properties of undefined » dans le bandeau.
 */

/** Ce qu'un moteur JS produit réellement, mot pour mot. */
const ERREURS_NATIVES = [
  new SyntaxError("Unexpected token < in JSON at position 0"),
  new SyntaxError('Unexpected end of JSON input'),
  new TypeError("Cannot read properties of undefined (reading 'coordinates')"),
  new TypeError("f.geometry is null"),
  new RangeError("Maximum call stack size exceeded"),
  new Error("socket hang up"),
  new Error("write EPROTO 0000:error:0A00010B:SSL routines"),
  new Error("Converting circular structure to JSON"),
];

/** Mots qui trahissent une fuite technique ou anglaise. */
const INTERDITS =
  /undefined|null\b|Unexpected|Cannot|token|JSON|stack|socket|EPROTO|SSL|circular|properties|reading/i;

describe("frenchGeoError — rien de technique ne remonte à l'écran", () => {
  it("n'exhibe jamais un message de moteur JS", () => {
    for (const e of ERREURS_NATIVES) {
      const out = frenchGeoError(e);
      assert.doesNotMatch(
        out,
        INTERDITS,
        `« ${e.message} » ressort en « ${out} »`,
      );
      assert.ok(out.length > 0);
    }
  });

  it("répond en français, quoi qu'on lui donne", () => {
    const entrees: unknown[] = [
      ...ERREURS_NATIVES,
      null,
      undefined,
      "une chaîne nue",
      42,
      { message: "objet qui n'est pas une Error" },
      new Error(""),
    ];
    // Au moins un mot accentué ou clairement français dans chaque réponse.
    for (const e of entrees) {
      const out = frenchGeoError(e);
      assert.match(
        out,
        /cadastre|adresse|Délai|Réponse|Erreur|indisponible|réessayez/i,
        `réponse non francophone pour ${String(e)} : « ${out} »`,
      );
    }
  });

  it("garde les cas que l'utilisateur doit distinguer", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    assert.match(frenchGeoError(abort), /Délai dépassé/);

    assert.match(frenchGeoError(new Error("fetch failed")), /hors ligne/i);
    assert.match(frenchGeoError(new Error("ENOTFOUND api-adresse.data.gouv.fr")), /hors ligne/i);
    assert.match(frenchGeoError(new Error("BAN HTTP 503")), /momentanément indisponible/i);
    assert.match(frenchGeoError(new Error("Cadastre HTTP 500")), /momentanément indisponible/i);
    assert.match(frenchGeoError(new SyntaxError("x")), /Réponse inattendue/i);
  });

  it("laisse passer nos propres phrases, et elles seules", () => {
    const notre = geoError("Parcelle introuvable à cette adresse");
    assert.equal(frenchGeoError(notre), "Parcelle introuvable à cette adresse");

    // Un message qui imiterait le nôtre sans la marque ne passe pas.
    const imitation = new Error("Parcelle introuvable à cette adresse");
    assert.notEqual(frenchGeoError(imitation), "Parcelle introuvable à cette adresse");
  });
});

describe("readJsonOrThrow — une passerelle qui répond en HTML", () => {
  it("rend une phrase française plutôt que l'erreur d'analyse", async () => {
    const html = new Response("<html><body>502 Bad Gateway</body></html>", {
      headers: { "Content-Type": "text/html" },
    });
    await assert.rejects(
      () => readJsonOrThrow(html, "cadastre"),
      (e: unknown) => {
        const out = frenchGeoError(e);
        assert.doesNotMatch(out, INTERDITS, `fuite : « ${out} »`);
        assert.match(out, /illisible|inattendue/i);
        return true;
      },
    );
  });

  it("nomme le service en cause", async () => {
    const vide = new Response("", { headers: { "Content-Type": "application/json" } });
    await assert.rejects(
      () => readJsonOrThrow(vide, "adresse"),
      (e: unknown) => {
        assert.match(frenchGeoError(e), /adresse/);
        return true;
      },
    );
  });

  it("rend le corps quand il est bien du JSON", async () => {
    const ok = new Response(JSON.stringify({ features: [] }), {
      headers: { "Content-Type": "application/json" },
    });
    const data = await readJsonOrThrow<{ features: unknown[] }>(ok, "adresse");
    assert.deepEqual(data, { features: [] });
  });
});
