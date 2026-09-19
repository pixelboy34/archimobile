import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { checkCoherence, resumeCoherence, TITRES, type NatureDefaut } from "./coherence.ts";
import { cloneProject, emptyProject, addStair, nombreDeMarches } from "./builder.ts";
import { seedProjects } from "./seed.ts";
import { generateMassing } from "../cad/massing.ts";
import { syncStoryGeometry } from "../cad/ops.ts";
import type { Project } from "./types.ts";

/** Un carré de quatre murs sur un étage, base saine de tous les cas cassés. */
function carre(nom = "Essai"): Project {
  let p = emptyProject(nom);
  const st = p.stories[0]!;
  const c = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ];
  p = cloneProject(p);
  for (let i = 0; i < 4; i++) {
    p.walls.push({
      id: `w${i}`,
      storyId: st.id,
      a: c[i]!,
      b: c[(i + 1) % 4]!,
      thickness: 0.2,
      height: st.height,
      materialId: "plaster",
    });
  }
  return p;
}

function natures(p: Project): NatureDefaut[] {
  return checkCoherence(p).defauts.map((d) => d.nature);
}

describe("cohérence — silence sur les modèles sains", () => {
  it("ne signale rien sur les cinq projets de démonstration", () => {
    for (const p of seedProjects()) {
      const r = checkCoherence(p);
      assert.equal(
        r.defauts.length,
        0,
        `${p.name} devrait sortir propre : ${r.defauts.map((d) => d.message).join(" | ")}`,
      );
      assert.equal(r.sain, true);
    }
  });

  it("ne signale rien sur un R+8 généré", () => {
    const tour = generateMassing(emptyProject("Tour"), {
      width: 18,
      depth: 14,
      floors: 8,
      floorHeight: 2.8,
      groundHeight: 3.2,
    });
    const r = checkCoherence(tour);
    assert.equal(r.defauts.length, 0, r.defauts.map((d) => d.message).join(" | "));
  });

  it("dit franchement que le modèle est sain, sans liste vide", () => {
    assert.match(resumeCoherence(checkCoherence(carre())), /Aucune incohérence/);
  });

  it("rend toujours la même liste, dans le même ordre", () => {
    const p = seedProjects()[1]!;
    const a = checkCoherence(p).defauts.map((d) => d.id);
    const b = checkCoherence(p).defauts.map((d) => d.id);
    assert.deepEqual(a, b, "le domaine doit rester rejouable");
  });
});

describe("volume généré — percements sains sur toute la plage d'emprise", () => {
  // Deux défauts trouvés par le contrôle de cohérence lui-même, tous deux sur
  // la porte d'entrée et tous deux invisibles sur les emprises courantes :
  //   20 × 16 — la fenêtre voisine survivait au filtre et recouvrait la porte
  //             de 7,5 cm, le seuil valant la largeur de la porte au lieu de la
  //             demi-somme des deux largeurs ;
  //   8  × n  — la butée relative t ∈ [0,15 ; 0,85] posait le bord de la porte
  //             8 cm hors d'un tronçon de façade de 3,10 m.
  const emprises: [number, number][] = [
    [8, 8], [8, 20], [10, 10], [12, 12], [16, 12],
    [18, 14], [20, 16], [24, 18], [30, 20], [40, 30],
  ];

  for (const [w, d] of emprises) {
    it(`${w} × ${d} m : aucun percement incohérent`, () => {
      const p = generateMassing(emptyProject("Volume"), {
        width: w,
        depth: d,
        floors: 2,
        floorHeight: 2.8,
        groundHeight: 3.4,
      });
      const fautes = checkCoherence(p).defauts.filter(
        (x) => x.nature === "baie-chevauchement" || x.nature === "baie-debordante",
      );
      assert.equal(fautes.length, 0, fautes.map((f) => f.message).join(" | "));
    });
  }

  it("garde une porte d'entrée sur chaque emprise", () => {
    for (const [w, d] of emprises) {
      const p = generateMassing(emptyProject("Volume"), {
        width: w,
        depth: d,
        floors: 2,
        floorHeight: 2.8,
        groundHeight: 3.4,
      });
      const portes = p.openings.filter((o) => o.kind === "door");
      assert.ok(portes.length > 0, `${w} × ${d} m devrait avoir une entrée`);
      // Le correctif écarte des fenêtres autour de la porte : vérifier qu'il
      // n'a pas vidé la façade au passage.
      const rdc = p.stories[0]!.id;
      const mursRdc = new Set(p.walls.filter((x) => x.storyId === rdc).map((x) => x.id));
      const baies = p.openings.filter((o) => mursRdc.has(o.wallId));
      assert.ok(baies.length >= 6, `${w} × ${d} m : seulement ${baies.length} baies au RDC`);
    }
  });
});

describe("cohérence — chaque règle mord sur un défaut réel", () => {
  it("voit un ouvrage rattaché à un niveau disparu", () => {
    const p = carre();
    p.walls[0]!.storyId = "st_supprime";
    const r = checkCoherence(p);
    assert.ok(natures(p).includes("orphelin"));
    assert.equal(r.critiques, 1, "c'est critique : compté au métré, exporté en IFC, invisible");
    assert.ok(r.defauts[0]!.cibles.includes("w0"));
  });

  it("voit une baie posée sur un mur qui n'existe plus", () => {
    const p = carre();
    p.openings.push({
      id: "op1", kind: "window", wallId: "w_disparu", t: 0.5,
      width: 1.2, height: 1.3, sill: 0.9, materialId: "glass",
    });
    assert.ok(natures(p).includes("baie-orpheline"));
  });

  it("voit une baie plus large que son mur", () => {
    const p = carre();
    // Mur w1 : de (8;0) à (8;6), soit 6 m. Une baie de 7 m n'y tient pas.
    p.openings.push({
      id: "op1", kind: "window", wallId: "w1", t: 0.5,
      width: 7, height: 1.3, sill: 0.9, materialId: "glass",
    });
    const d = checkCoherence(p).defauts.find((x) => x.nature === "baie-debordante");
    assert.ok(d, "une baie de 7 m sur un mur de 6 m doit être signalée");
    assert.match(d!.message, /plus large que son mur/);
  });

  it("voit une baie qui déborde par une extrémité", () => {
    const p = carre();
    // Mur w0 : 8 m. Baie de 2 m centrée à t=0,97, soit de 6,76 à 8,76 m.
    p.openings.push({
      id: "op1", kind: "window", wallId: "w0", t: 0.97,
      width: 2, height: 1.3, sill: 0.9, materialId: "glass",
    });
    const d = checkCoherence(p).defauts.find((x) => x.nature === "baie-debordante");
    assert.ok(d);
    assert.match(d!.message, /0,76 m/, "le débordement exact doit être annoncé");
  });

  it("voit deux baies qui se chevauchent, et se tait quand elles sont jointives", () => {
    const chevauchantes = carre();
    // Mur de 8 m : baies de 1,4 m centrées à 3 m et 4 m — 0,40 m de recouvrement.
    for (const [id, t] of [["op1", 3 / 8], ["op2", 4 / 8]] as const) {
      chevauchantes.openings.push({
        id, kind: "window", wallId: "w0", t,
        width: 1.4, height: 1.3, sill: 0.9, materialId: "glass",
      });
    }
    const d = checkCoherence(chevauchantes).defauts.find((x) => x.nature === "baie-chevauchement");
    assert.ok(d, "deux baies distantes de 1 m pour 1,40 m de large se chevauchent");
    assert.match(d!.message, /0,40 m/);

    // Jointives bord à bord : licite, aucun recouvrement.
    const jointives = carre();
    for (const [id, t] of [["op1", 3 / 8], ["op2", 4.4 / 8]] as const) {
      jointives.openings.push({
        id, kind: "window", wallId: "w0", t,
        width: 1.4, height: 1.3, sill: 0.9, materialId: "glass",
      });
    }
    assert.ok(!natures(jointives).includes("baie-chevauchement"), "deux baies jointives sont licites");
  });

  it("voit deux murs croisés en X, et se tait sur une jonction en T", () => {
    const croix = carre();
    croix.walls.push(
      { id: "wa", storyId: croix.stories[0]!.id, a: { x: 1, y: 3 }, b: { x: 7, y: 3 }, thickness: 0.2, height: 2.8, materialId: "plaster" },
      { id: "wb", storyId: croix.stories[0]!.id, a: { x: 4, y: 1 }, b: { x: 4, y: 5 }, thickness: 0.2, height: 2.8, materialId: "plaster" },
    );
    assert.ok(natures(croix).includes("murs-croises"), "un croisement franc doit être signalé");

    // Jonction en T : l'extrémité de wb tombe sur wa. C'est voulu.
    const te = carre();
    te.walls.push(
      { id: "wa", storyId: te.stories[0]!.id, a: { x: 1, y: 3 }, b: { x: 7, y: 3 }, thickness: 0.2, height: 2.8, materialId: "plaster" },
      { id: "wb", storyId: te.stories[0]!.id, a: { x: 4, y: 3 }, b: { x: 4, y: 5 }, thickness: 0.2, height: 2.8, materialId: "plaster" },
    );
    assert.ok(!natures(te).includes("murs-croises"), "une jonction en T est licite");
  });

  it("voit deux poteaux au même point, et se tait sur deux poteaux voisins", () => {
    const double = carre();
    const st = double.stories[0]!.id;
    double.columns.push(
      { id: "c1", storyId: st, position: { x: 4, y: 3 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete" },
      { id: "c2", storyId: st, position: { x: 4.01, y: 3 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete" },
    );
    assert.ok(natures(double).includes("poteau-double"));

    const espaces = carre();
    espaces.columns.push(
      { id: "c1", storyId: espaces.stories[0]!.id, position: { x: 3, y: 3 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete" },
      { id: "c2", storyId: espaces.stories[0]!.id, position: { x: 5, y: 3 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete" },
    );
    assert.ok(!natures(espaces).includes("poteau-double"));
  });

  it("voit un poteau noyé, et se tait sur un poteau plus large que le mur", () => {
    const noye = carre();
    noye.walls.push({
      id: "gros", storyId: noye.stories[0]!.id,
      a: { x: 1, y: 3 }, b: { x: 7, y: 3 }, thickness: 1, height: 2.8, materialId: "concrete",
    });
    noye.columns.push({
      id: "c1", storyId: noye.stories[0]!.id,
      position: { x: 4, y: 3 }, width: 0.2, depth: 0.2, height: 2.8, materialId: "concrete",
    });
    assert.ok(natures(noye).includes("poteau-noye"), "un poteau de 20 cm dans un mur de 1 m ne sert à rien");

    // Un raidisseur plus large que le mur est légitime : il déborde et porte.
    const raidisseur = carre();
    raidisseur.walls.push({
      id: "mince", storyId: raidisseur.stories[0]!.id,
      a: { x: 1, y: 3 }, b: { x: 7, y: 3 }, thickness: 0.2, height: 2.8, materialId: "concrete",
    });
    raidisseur.columns.push({
      id: "c1", storyId: raidisseur.stories[0]!.id,
      position: { x: 4, y: 3 }, width: 0.5, depth: 0.5, height: 2.8, materialId: "concrete",
    });
    assert.ok(!natures(raidisseur).includes("poteau-noye"));
  });

  it("voit deux pièces qui se recouvrent, et se tait sur deux pièces mitoyennes", () => {
    const dessus = carre();
    const st = dessus.stories[0]!.id;
    dessus.rooms.push(
      { id: "r1", storyId: st, name: "Séjour", function: "living", polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }] },
      { id: "r2", storyId: st, name: "Chambre", function: "bedroom", polygon: [{ x: 3, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 5 }, { x: 3, y: 5 }] },
    );
    const d = checkCoherence(dessus).defauts.find((x) => x.nature === "pieces-superposees");
    assert.ok(d, "10 m² communs sur 25 doivent être signalés");
    assert.match(d!.message, /comptée deux fois/);

    const mitoyennes = carre();
    const st2 = mitoyennes.stories[0]!.id;
    mitoyennes.rooms.push(
      { id: "r1", storyId: st2, name: "Séjour", function: "living", polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }, { x: 0, y: 5 }] },
      { id: "r2", storyId: st2, name: "Chambre", function: "bedroom", polygon: [{ x: 4, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 5 }, { x: 4, y: 5 }] },
    );
    assert.ok(
      !natures(mitoyennes).includes("pieces-superposees"),
      "deux pièces qui partagent une arête ne se recouvrent pas",
    );
  });

  it("voit un escalier qui ne rejoint pas l'étage", () => {
    const p = carre();
    const st = p.stories[0]!;
    st.height = 2.8;
    p.stairs.push({
      id: "s1", storyId: st.id, origin: { x: 2, y: 2 }, direction: 0,
      width: 1, run: 3.6, rise: 3.2, steps: 16,
    });
    const d = checkCoherence(p).defauts.find((x) => x.nature === "escalier-hauteur");
    assert.ok(d, "3,20 m de montée pour un étage de 2,80 m");
    assert.match(d!.message, /dépasse/);
  });

  it("voit un escalier impraticable", () => {
    const p = carre();
    const st = p.stories[0]!;
    p.stairs.push({
      id: "s1", storyId: st.id, origin: { x: 2, y: 2 }, direction: 0,
      // 2,50 m de reculement pour 16 marches : giron de 0,156 m.
      width: 1, run: 2.5, rise: st.height, steps: 16,
    });
    const d = checkCoherence(p).defauts.find((x) => x.nature === "escalier-pas");
    assert.ok(d);
    assert.match(d!.message, /giron/);
  });

  it("voit une pièce sans surface", () => {
    const p = carre();
    p.rooms.push({
      id: "r1", storyId: p.stories[0]!.id, name: "Placard", function: "storage",
      polygon: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0.2 }, { x: 0, y: 0.2 }],
    });
    assert.ok(natures(p).includes("piece-degeneree"));
  });

  it("voit un mur de longueur nulle", () => {
    const p = carre();
    p.walls.push({
      id: "nul", storyId: p.stories[0]!.id,
      a: { x: 2, y: 2 }, b: { x: 2, y: 2 }, thickness: 0.2, height: 2.8, materialId: "plaster",
    });
    assert.ok(natures(p).includes("mur-degenere"));
  });
});

describe("cohérence — regroupement et intitulés", () => {
  it("groupe les défauts par nature, avec un intitulé pour chacun", () => {
    const p = carre();
    const st = p.stories[0]!.id;
    p.columns.push(
      { id: "c1", storyId: st, position: { x: 4, y: 3 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete" },
      { id: "c2", storyId: st, position: { x: 4.01, y: 3 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete" },
      { id: "c3", storyId: st, position: { x: 6, y: 3 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete" },
      { id: "c4", storyId: st, position: { x: 6.01, y: 3 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete" },
    );
    const r = checkCoherence(p);
    const g = r.parNature.find((x) => x.nature === "poteau-double");
    assert.ok(g, "un groupe doit exister");
    assert.equal(g!.defauts.length, 2, "deux paires, un seul groupe");
    assert.equal(g!.titre, TITRES["poteau-double"]);
    assert.doesNotMatch(resumeCoherence(r), /undefined|NaN/);
  });
});

describe("escaliers — le compte de marches tient les deux contraintes", () => {
  it("garde contremarche et giron dans les limites, sur toute la plage utile", () => {
    for (let rise = 2.4; rise <= 6.01; rise += 0.2) {
      for (const run of [3.2, 3.6, 4.2, 5]) {
        const n = nombreDeMarches(rise, run);
        const contremarche = rise / n;
        const giron = run / n;
        assert.ok(contremarche <= 0.2101, `contremarche ${contremarche.toFixed(3)} pour ${rise}/${run}`);
        if (run / Math.ceil(rise / 0.21) >= 0.22) {
          assert.ok(giron >= 0.2199, `giron ${giron.toFixed(3)} pour ${rise}/${run}`);
        }
      }
    }
  });

  it("un étage recopié puis rabaissé garde un escalier praticable", () => {
    // C'est le cas qui rendait Tour Horizon incohérent : copyStory recopiait
    // l'escalier du RDC, la hauteur d'étage changeait, l'escalier non.
    let p = emptyProject("Copie");
    p.stories[0]!.height = 3.2;
    p = addStair(p, p.stories[0]!.id, { x: 2, y: 2 }, 0, 4.2, 1.1);
    p.stories.push({ id: "st_haut", name: "R+1", elevation: 3.2, height: 2.8 });
    p.stairs.push({ ...p.stairs[0]!, id: "s2", storyId: "st_haut" });
    assert.ok(natures(p).includes("escalier-hauteur"), "avant synchronisation, l'escalier ment");

    p = syncStoryGeometry(p, "st_haut");
    assert.ok(!natures(p).includes("escalier-hauteur"), "après synchronisation, il rejoint l'étage");
    assert.ok(!natures(p).includes("escalier-pas"), "et il reste praticable");
  });
});
