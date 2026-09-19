import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildNomenclature } from "./nomenclature.ts";
import { cloneProject, emptyProject } from "./builder.ts";
import { seedProjects } from "./seed.ts";
import { wallLength } from "./geometry.ts";
import type { Project } from "./types.ts";

/**
 * Le prix d'un article et la clé qui le regroupe doivent rester d'accord.
 *
 * `groupRows` cumule les quantités d'une même clé et garde le prix du PREMIER
 * article rencontré. Tout attribut qui pèse sur le prix sans figurer dans la
 * clé fausse donc le total en silence, sur des ouvrages que l'utilisateur n'a
 * jamais touchés. Deux cas existaient : les murs groupés sans `partition`, et
 * les matières où un mur et une dalle de même matière partageaient la clé.
 *
 * AVERTISSEMENT AU LECTEUR QUI VOUDRAIT SIMPLIFIER. Deux protections se
 * superposent et sont volontairement redondantes : les clés explicites
 * (`cloison-…`, `elevation-…`, `dalle-…`) et le prix intégré à la clé
 * d'agrégation dans `groupRows`. Mesuré au sabotage : retirer l'UNE ou l'AUTRE
 * laisse ces quatre tests verts, car chacune couvre seule les cas connus ;
 * retirer LES DEUX en fait tomber deux. Aucune n'est donc morte — la seconde
 * est le filet pour l'attribut tarifaire qu'on oubliera un jour de mettre dans
 * une clé, et qu'aucun test d'aujourd'hui ne peut exercer.
 */

function murCarre(nom = "Essai"): Project {
  const p = cloneProject(emptyProject(nom));
  const st = p.stories[0]!;
  const c = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ];
  for (let i = 0; i < 4; i++) {
    p.walls.push({
      id: `w${i}`,
      storyId: st.id,
      a: c[i]!,
      b: c[(i + 1) % 4]!,
      thickness: 0.2,
      height: st.height,
      materialId: "concrete",
      role: "exterior",
      partition: false,
    });
  }
  return p;
}

describe("nomenclature — le prix ne déborde jamais sur un autre article", () => {
  it("basculer UN mur en cloison ne change le total que de ce mur", () => {
    const avant = murCarre();
    const apres = cloneProject(avant);
    apres.walls[0]!.partition = true;

    const totalAvant = buildNomenclature(avant, "murs").totalHT;
    const totalApres = buildNomenclature(apres, "murs").totalHT;

    // Oracle indépendant : l'aire du seul mur basculé, au tarif d'écart.
    // 165 EUR/m² pour un mur plein, 85 pour une cloison.
    const mur = avant.walls[0]!;
    const aire = wallLength(mur) * mur.height;
    const attendu = Math.round(aire * (165 - 85));

    assert.equal(
      totalAvant - totalApres,
      attendu,
      `seul le mur basculé devait changer de tarif : écart ${totalAvant - totalApres} au lieu de ${attendu}`,
    );
  });

  it("une cloison et un mur plein de même épaisseur font deux lignes", () => {
    const p = murCarre();
    p.walls[0]!.partition = true;
    const n = buildNomenclature(p, "murs");

    const prix = new Set(n.rows.map((r) => r.unitPrice));
    assert.ok(prix.has(85) && prix.has(165), `les deux tarifs doivent apparaître : ${[...prix].join(", ")}`);

    const cloison = n.rows.find((r) => r.unitPrice === 85)!;
    assert.equal(cloison.entityIds.length, 1, "un seul mur a été basculé");
    assert.match(cloison.label, /Cloison/, "le libellé doit dire ce qui est facturé");
  });

  it("un mur et une dalle de même matière ne partagent pas un tarif", () => {
    const p = murCarre();
    const st = p.stories[0]!;
    p.slabs.push({
      id: "sl1",
      storyId: st.id,
      polygon: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 6 },
        { x: 0, y: 6 },
      ],
      thickness: 0.2,
      materialId: "concrete",
    });

    const n = buildNomenclature(p, "matieres");
    const beton = n.rows.filter((r) => /Béton/i.test(r.label));
    assert.equal(beton.length, 2, "élévation et dalle sont deux articles distincts");

    const tarifs = new Set(beton.map((r) => r.unitPrice));
    assert.ok(tarifs.has(42) && tarifs.has(38), `42 pour l'élévation, 38 pour la dalle : ${[...tarifs].join(", ")}`);

    const dalle = beton.find((r) => r.unitPrice === 38)!;
    assert.ok(Math.abs(dalle.qty - 48) < 0.01, `la dalle fait 8 × 6 = 48 m², obtenu ${dalle.qty}`);
  });

  it("aucune ligne ne mélange deux tarifs, sur toutes les nomenclatures des démos", () => {
    // Invariant général : le total d'une ligne vaut sa quantité au tarif annoncé.
    // Il ne tiendrait plus si un groupe cumulait des articles de prix différents.
    for (const p of seedProjects()) {
      for (const kind of ["murs", "portes", "fenetres", "objets", "matieres"] as const) {
        const n = buildNomenclature(p, kind);
        for (const r of n.rows) {
          assert.equal(
            r.total,
            Math.round(r.qty * r.unitPrice),
            `${p.name} · ${kind} · ${r.label} : total ${r.total} pour ${r.qty} × ${r.unitPrice}`,
          );
        }
        assert.equal(
          n.totalHT,
          n.rows.reduce((s, r) => s + r.total, 0),
          `${p.name} · ${kind} : le total général doit être la somme des lignes`,
        );
      }
    }
  });
});
