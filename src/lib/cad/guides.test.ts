import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { dist, snapVec, wallLength } from "../bim/geometry.ts";
import { seedProjects } from "../bim/seed.ts";
import type { Project, Vec2, Wall } from "../bim/types.ts";
import { healWallEnds } from "./ops.ts";
import {
  activeGuides,
  angleEntre,
  coteToPoint,
  ecartAuGuide,
  parseAngleDeg,
  parseCote,
  resolveGuidedPoint,
} from "./guides.ts";

const DEG = Math.PI / 180;

function mur(id: string, ax: number, ay: number, bx: number, by: number): Wall {
  return {
    id,
    storyId: "s0",
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thickness: 0.2,
    height: 2.8,
    materialId: "plaster",
  } as Wall;
}

function maquette(walls: Wall[], columns: Project["columns"] = []): Project {
  return {
    id: "prj_guides",
    name: "Essai guides",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    meta: {},
    stories: [{ id: "s0", name: "RDC", elevation: 0, height: 2.8 }],
    walls,
    openings: [],
    rooms: [],
    slabs: [],
    roofs: [],
    columns,
    stairs: [],
    furniture: [],
    materials: {},
  } as unknown as Project;
}

/** Rectangle 0,0 → 10,6, quatre murs, sens horaire depuis le sud-ouest. */
function boite(): Project {
  return maquette([
    mur("sud", 0, 0, 10, 0),
    mur("est", 10, 0, 10, 6),
    mur("nord", 10, 6, 0, 6),
    mur("ouest", 0, 6, 0, 0),
  ]);
}

describe("guides — prolongement d'axe", () => {
  it("s'accroche au-delà de l'about, pas sur le mur lui-même", () => {
    const p = maquette([mur("m", 0, 0, 10, 0)]);
    const dehors = activeGuides({ x: 13, y: 0.05 }, p, "s0", { tolerance: 0.2 });
    assert.equal(dehors.length, 1);
    assert.equal(dehors[0]!.kind, "axe");
    assert.ok(Math.abs(dehors[0]!.point.y) < 1e-12, "l'axe ramène sur y = 0");
    assert.ok(Math.abs(dehors[0]!.ecart - 0.05) < 1e-12);

    // Sur l'emprise du mur, snapDetail accroche déjà : pas de guide d'axe.
    const dessus = activeGuides({ x: 5, y: 0.05 }, p, "s0", { tolerance: 0.2 });
    assert.deepEqual(
      dessus.filter((g) => g.kind === "axe"),
      [],
    );
  });

  it("reste muet au-delà de la tolérance", () => {
    const p = maquette([mur("m", 0, 0, 10, 0)]);
    assert.deepEqual(activeGuides({ x: 13, y: 0.5 }, p, "s0", { tolerance: 0.2 }), []);
  });

  it("ne prolonge pas un axe à 60 m de son mur", () => {
    const p = maquette([mur("m", 0, 0, 10, 0)]);
    assert.deepEqual(activeGuides({ x: 75, y: 0.02 }, p, "s0", { tolerance: 0.2 }), []);
  });
});

describe("guides — perpendiculaires et alignements", () => {
  it("rend la perpendiculaire à l'about d'un mur", () => {
    const p = maquette([mur("m", 0, 0, 10, 0)]);
    const g = activeGuides({ x: 0.04, y: 4 }, p, "s0", { tolerance: 0.2 });
    const perp = g.find((x) => x.kind === "perpendiculaire" || x.kind === "alignement");
    assert.ok(perp, "un guide vertical est attendu à l'about ouest");
    assert.ok(Math.abs(perp!.point.x) < 1e-12);
  });

  it("ne double pas le magnétisme sur point : rien sous 0,60 m de l'ancre", () => {
    const p = maquette([mur("m", 0, 0, 10, 0)]);
    assert.deepEqual(activeGuides({ x: 0.04, y: 0.3 }, p, "s0", { tolerance: 0.2 }), []);
  });

  it("aligne sur l'abscisse d'une extrémité déjà posée", () => {
    const p = maquette([mur("m", 0, 0, 10, 0), mur("refend", 4, 0, 4, 3)]);
    const g = activeGuides({ x: 4.07, y: 9 }, p, "s0", { tolerance: 0.2 });
    assert.ok(g.length >= 1);
    assert.ok(Math.abs(g[0]!.point.x - 4) < 1e-12);
  });

  it("aligne aussi sur un poteau", () => {
    const p = maquette(
      [mur("m", 0, 0, 10, 0)],
      [
        {
          id: "c1",
          storyId: "s0",
          position: { x: 6.4, y: 5 },
          width: 0.3,
          depth: 0.3,
          height: 2.8,
          materialId: "concrete",
          shape: "rect",
          structural: true,
        },
      ] as unknown as Project["columns"],
    );
    const g = activeGuides({ x: 6.34, y: 12 }, p, "s0", { tolerance: 0.2 });
    const sur = g.find((x) => x.sourceIds.includes("c1"));
    assert.ok(sur, "le poteau doit produire un alignement");
    assert.ok(Math.abs(sur!.point.x - 6.4) < 1e-12);
  });

  it("ne dessine pas deux fois la même droite", () => {
    // L'axe du mur vertical et l'alignement sur son extrémité sont la même droite.
    const p = maquette([mur("v", 0, 0, 0, 10)]);
    const g = activeGuides({ x: 0.05, y: 14 }, p, "s0", { tolerance: 0.2 });
    assert.equal(g.length, 1);
  });

  it("plafonne le nombre de droites rendues", () => {
    const murs: Wall[] = [];
    for (let i = 0; i < 12; i++) murs.push(mur(`m${i}`, 0, i * 0.02, 6, i * 0.02));
    const p = maquette(murs);
    const g = activeGuides({ x: 9, y: 0.12 }, p, "s0", { tolerance: 0.4, max: 3 });
    assert.equal(g.filter((x) => x.form === "ligne").length, 3);
  });
});

describe("guides — équidistance entre murs parallèles", () => {
  it("trouve l'axe médian de deux murs parallèles", () => {
    const p = maquette([mur("bas", 0, 0, 10, 0), mur("haut", 0, 6, 10, 6)]);
    const g = activeGuides({ x: 3, y: 3.08 }, p, "s0", { tolerance: 0.2 });
    const eq = g.find((x) => x.kind === "equidistance");
    assert.ok(eq, "la médiane doit être active");
    assert.ok(Math.abs(eq!.point.y - 3) < 1e-12);
    assert.deepEqual([...eq!.sourceIds].sort(), ["bas", "haut"]);
  });

  it("ne se déclenche pas ailleurs qu'à mi-distance", () => {
    const p = maquette([mur("bas", 0, 0, 10, 0), mur("haut", 0, 6, 10, 6)]);
    const g = activeGuides({ x: 3, y: 4.2 }, p, "s0", { tolerance: 0.2 });
    assert.deepEqual(
      g.filter((x) => x.kind === "equidistance"),
      [],
    );
  });

  it("ignore une paire dont la travée est loin du point", () => {
    // Point sur la médiane, mais 30 m au-delà des abouts : hors travée.
    const p = maquette([mur("bas", 0, 0, 4, 0), mur("haut", 0, 2, 4, 2)]);
    const g = activeGuides({ x: 40, y: 1 }, p, "s0", { tolerance: 0.2 });
    assert.deepEqual(
      g.filter((x) => x.kind === "equidistance"),
      [],
    );
  });

  it("exige que les DEUX murs de la paire encadrent le point", () => {
    // Travée longue au sud, about court au nord : passé l'about court, la
    // médiane ne décrit plus rien, même si le mur long court encore.
    const long = mur("long", 0, 0, 40, 0);
    const court = mur("court", 0, 2, 4, 2);
    for (const ordre of [
      [long, court],
      [court, long],
    ]) {
      const g = activeGuides({ x: 30, y: 1 }, maquette(ordre), "s0", { tolerance: 0.2 });
      assert.deepEqual(
        g.filter((x) => x.kind === "equidistance"),
        [],
        "quel que soit l'ordre des murs dans le projet",
      );
    }
  });

  it("ignore un doublage : 10 cm d'entraxe ne font pas une travée", () => {
    const p = maquette([mur("porteur", 0, 0, 10, 0), mur("doublage", 0, 0.1, 10, 0.1)]);
    const g = activeGuides({ x: 5, y: 0.05 }, p, "s0", { tolerance: 0.2 });
    assert.deepEqual(
      g.filter((x) => x.kind === "equidistance"),
      [],
    );
  });

  it("ignore une paire trop écartée pour décrire une travée", () => {
    const p = maquette([mur("bas", 0, 0, 10, 0), mur("haut", 0, 30, 10, 30)]);
    const g = activeGuides({ x: 5, y: 15 }, p, "s0", { tolerance: 0.2 });
    assert.deepEqual(
      g.filter((x) => x.kind === "equidistance"),
      [],
    );
  });

  it("n'appaire pas deux murs non parallèles", () => {
    // Mur sud horizontal, mur oblique à 26,6°. Sans contrôle de parallélisme,
    // la médiane calculée sur la normale du premier tomberait à y = 1,75.
    const p = maquette([mur("sud", 0, 0, 10, 0), mur("oblique", 4, 3.5, 6, 4.5)]);
    const g = activeGuides({ x: 5, y: 1.75 }, p, "s0", { tolerance: 0.2 });
    assert.deepEqual(
      g.filter((x) => x.kind === "equidistance"),
      [],
    );
  });

  it("répartit un trumeau égal entre deux refends", () => {
    // Deux refends verticaux à 1,20 m et 4,80 m : la médiane tombe à 3,00 m.
    const p = maquette([mur("r1", 1.2, 0, 1.2, 5), mur("r2", 4.8, 0, 4.8, 5)]);
    const res = resolveGuidedPoint({ x: 3.09, y: 7 }, p, "s0", { tolerance: 0.2 });
    assert.equal(res.retenus[0]?.kind, "equidistance");
    assert.ok(Math.abs(res.point.x - 3) < 1e-12);
  });
});

describe("guides — reprise de la longueur du segment précédent", () => {
  it("ramène le point à la longueur reprise, direction conservée", () => {
    const p = maquette([mur("m", -20, -20, -20, -10)]);
    const origine: Vec2 = { x: 0, y: 0 };
    const angle = 30 * DEG;
    const brut = coteToPoint(origine, 3.11, angle);
    const res = resolveGuidedPoint(brut, p, "s0", {
      tolerance: 0.2,
      draft: origine,
      previousLength: 3.2,
    });
    assert.equal(res.retenus.length, 1);
    assert.equal(res.retenus[0]!.kind, "longueur");
    assert.ok(Math.abs(dist(origine, res.point) - 3.2) < 1e-12);
    assert.ok(Math.abs(angleEntre(origine, res.point) - angle) < 1e-12);
  });

  it("ne reprend rien si l'écart dépasse la tolérance", () => {
    const p = maquette([mur("m", -20, -20, -20, -10)]);
    const origine: Vec2 = { x: 0, y: 0 };
    const brut = coteToPoint(origine, 2.4, 0);
    const res = resolveGuidedPoint(brut, p, "s0", {
      tolerance: 0.2,
      draft: origine,
      previousLength: 3.2,
    });
    assert.deepEqual(res.retenus, []);
    assert.deepEqual(res.point, brut);
  });

  it("croise une droite et une cote : le point tient les deux", () => {
    // Alignement vertical sur x = 4, longueur reprise 5 depuis (0,0).
    const p = maquette([mur("refend", 4, -6, 4, -2)]);
    const origine: Vec2 = { x: 0, y: 0 };
    const res = resolveGuidedPoint({ x: 4.06, y: 2.9 }, p, "s0", {
      tolerance: 0.2,
      draft: origine,
      previousLength: 5,
    });
    assert.ok(Math.abs(res.point.x - 4) < 1e-12, "sur l'alignement");
    assert.ok(Math.abs(dist(origine, res.point) - 5) < 1e-12, "à la cote reprise");
    assert.ok(Math.abs(res.point.y - 3) < 1e-9, "3-4-5");
    assert.equal(res.retenus.length, 2);
  });
});

describe("guides — composition avec le magnétisme et l'ortho", () => {
  it("un point magnétisé l'emporte sur un guide", () => {
    const p = boite();
    // À 8 cm de l'angle nord-est, dans l'axe prolongé du mur est.
    const res = resolveGuidedPoint({ x: 10.02, y: 6.08 }, p, "s0", { tolerance: 0.2 });
    assert.equal(res.snap.kind, "end");
    assert.deepEqual(res.retenus, []);
    assert.deepEqual(res.point, { x: 10, y: 6 });
    assert.equal(res.raison, "Extrémité");
  });

  it("deux guides sécants donnent leur intersection", () => {
    // Alignement vertical sur x = 10 (about est) et horizontal sur y = 6 (about nord),
    // pris hors de toute matière pour que le magnétisme ne tranche pas.
    const p = maquette([mur("est", 10, 0, 10, 3), mur("nord", 0, 6, 3, 6)]);
    const res = resolveGuidedPoint({ x: 9.93, y: 6.06 }, p, "s0", { tolerance: 0.2 });
    assert.equal(res.retenus.length, 2);
    assert.ok(Math.abs(res.point.x - 10) < 1e-12);
    assert.ok(Math.abs(res.point.y - 6) < 1e-12);
  });

  it("deux guides parallèles ne se croisent pas : le plus proche projette seul", () => {
    const p = maquette([mur("r1", 4, 0, 4, 3), mur("r2", 4.3, 0, 4.3, 3)]);
    const res = resolveGuidedPoint({ x: 4.07, y: 9 }, p, "s0", { tolerance: 0.4 });
    assert.equal(res.retenus.length, 1);
    assert.ok(Number.isFinite(res.point.x) && Number.isFinite(res.point.y));
    assert.ok(Math.abs(res.point.x - 4) < 1e-12);
    assert.equal(res.point.y, 9);
  });

  it("un guide seul projette, sans toucher à l'autre coordonnée", () => {
    const p = maquette([mur("refend", 4, 0, 4, 3)]);
    const res = resolveGuidedPoint({ x: 4.07, y: 9 }, p, "s0", { tolerance: 0.2 });
    assert.ok(Math.abs(res.point.x - 4) < 1e-12);
    assert.equal(res.point.y, 9);
  });

  it("la trame ne reprend la main que sans guide", () => {
    const p = maquette([mur("refend", 4, 0, 4, 3)]);
    const loin = resolveGuidedPoint({ x: 7.07, y: 9 }, p, "s0", {
      tolerance: 0.2,
      useGrid: true,
      snapStep: 0.25,
    });
    assert.deepEqual(loin.retenus, []);
    assert.equal(loin.raison, "Trame");
    assert.deepEqual(loin.point, snapVec({ x: 7.07, y: 9 }, 0.25));

    const guide = resolveGuidedPoint({ x: 4.07, y: 9 }, p, "s0", {
      tolerance: 0.2,
      useGrid: true,
      snapStep: 0.25,
    });
    assert.ok(Math.abs(guide.point.x - 4) < 1e-12, "le guide passe devant la trame");
  });

  it("le verrou orthogonal garde le point sur son rayon", () => {
    // Rayon plein est depuis (0,0) ; l'alignement vertical sur x = 6 fixe la cote.
    const p = maquette([mur("refend", 6, -4, 6, -1)]);
    const res = resolveGuidedPoint({ x: 5.94, y: 0.03 }, p, "s0", {
      tolerance: 0.2,
      contrainte: { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 } },
    });
    assert.equal(res.point.y, 0, "le rayon est tenu");
    assert.ok(Math.abs(res.point.x - 6) < 1e-12, "la longueur est fixée par le guide");
    assert.equal(res.retenus.length, 1);
  });

  it("écarte un guide que le verrou orthogonal a rendu faux", () => {
    // Alignement horizontal sur y = 5, rayon plein est depuis (0,0) : incompatibles.
    const p = maquette([mur("nord", 0, 5, 3, 5)]);
    const res = resolveGuidedPoint({ x: 8, y: 4.94 }, p, "s0", {
      tolerance: 0.2,
      contrainte: { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 } },
    });
    assert.deepEqual(res.retenus, []);
    assert.equal(res.raison, "Ortho");
    assert.equal(res.point.y, 0);
  });

  it("ecartAuGuide mesure bien la droite et la cote", () => {
    const p = maquette([mur("refend", 4, 0, 4, 3)]);
    const g = activeGuides({ x: 4.07, y: 9 }, p, "s0", { tolerance: 0.2 })[0]!;
    assert.ok(Math.abs(ecartAuGuide(g, { x: 4.5, y: 100 }) - 0.5) < 1e-12);
    const cote = activeGuides({ x: 3.1, y: 0 }, maquette([]), "s0", {
      tolerance: 0.2,
      draft: { x: 0, y: 0 },
      previousLength: 3,
    })[0]!;
    assert.ok(Math.abs(ecartAuGuide(cote, { x: 5, y: 0 }) - 2) < 1e-12);
  });
});

describe("saisie de cote", () => {
  it("une longueur imposée donne exactement cette longueur", () => {
    const origine: Vec2 = { x: 3.17, y: -2.04 };
    let pire = 0;
    for (const L of [0.3, 1, 2.75, 3.2, 7.63, 12.5, 45.375, 120]) {
      for (let d = -180; d < 180; d += 3) {
        const b = coteToPoint(origine, L, d * DEG);
        pire = Math.max(pire, Math.abs(dist(origine, b) - L));
      }
    }
    assert.ok(pire < 1e-10, `écart maximal ${pire}`);
  });

  it("l'angle imposé est l'angle obtenu", () => {
    const origine: Vec2 = { x: 0, y: 0 };
    for (let d = -179; d < 180; d += 7) {
      const b = coteToPoint(origine, 4.2, d * DEG);
      assert.ok(Math.abs(angleEntre(origine, b) - d * DEG) < 1e-12);
    }
  });

  it("survit à la reprise de jonction du store", () => {
    // Le tracé guidé pose comme addWall : mergeDetectedRooms puis healWallEnds.
    // Un about isolé ne doit pas être déplacé, sinon la cote saisie est perdue.
    const p = seedProjects()[0]!;
    const s0 = p.stories[0]!.id;
    const depart = p.walls.find((w) => w.storyId === s0)!.a;
    const L = 3.7321;
    const arrivee = coteToPoint(depart, L, 245 * DEG);
    p.walls.push({ ...mur("neuf", depart.x, depart.y, arrivee.x, arrivee.y), storyId: s0 });
    const soigne = healWallEnds(p, s0);
    const pose = soigne.walls.find((w) => w.id === "neuf")!;
    assert.ok(Math.abs(wallLength(pose) - L) < 1e-4, `longueur posée ${wallLength(pose)}`);
  });

  it("lit une cote au pavé numérique, virgule ou point", () => {
    const fine = String.fromCharCode(0x202f); // espace fine insécable des métrés français
    assert.equal(parseCote("3,20"), 3.2);
    assert.equal(parseCote(" 3.2 m "), 3.2);
    assert.equal(parseCote(`4${fine}5,20`), 45.2);
    assert.equal(parseCote("0,075"), 0.075);
    assert.equal(parseCote(""), null);
    assert.equal(parseCote("0"), null);
    assert.equal(parseCote("-4"), null);
    assert.equal(parseCote("3,2,4"), null);
    assert.equal(parseCote("abc"), null);
    assert.equal(parseCote("900"), null);
  });

  it("lit un angle en degrés et le ramène dans le tour", () => {
    assert.ok(Math.abs(parseAngleDeg("90")! - Math.PI / 2) < 1e-12);
    assert.ok(Math.abs(parseAngleDeg("-45")! + Math.PI / 4) < 1e-12);
    assert.ok(Math.abs(parseAngleDeg("270")! + Math.PI / 2) < 1e-12);
    assert.ok(Math.abs(parseAngleDeg("37,5°")! - 37.5 * DEG) < 1e-12);
    assert.equal(parseAngleDeg("nord"), null);
    assert.equal(parseAngleDeg("99999"), null);
  });
});

/**
 * Mesure sur les cinq projets de démonstration.
 *
 * L'ancre et l'abscisse attendue sortent des données de seed, jamais d'un appel
 * aux guides : l'oracle est indépendant du code testé. Le repérage des droites
 * verticales concurrentes est refait ici à la main, pour choisir une ancre que
 * rien d'autre ne dispute — c'est une précondition, pas l'assertion.
 */
function abscissesConcurrentes(project: Project, storyId: string): number[] {
  const murs = project.walls.filter((w) => w.storyId === storyId);
  const xs: number[] = [];
  for (const w of murs) xs.push(w.a.x, w.b.x);
  for (const c of project.columns) if (c.storyId === storyId) xs.push(c.position.x);
  const verticaux = murs.filter((w) => Math.abs(w.a.x - w.b.x) < 1e-6);
  for (let i = 0; i < verticaux.length; i++) {
    for (let j = i + 1; j < verticaux.length; j++) {
      xs.push((verticaux[i]!.a.x + verticaux[j]!.a.x) / 2);
    }
  }
  return xs;
}

function loinDeToutePoint(project: Project, storyId: string, p: Vec2): boolean {
  for (const w of project.walls) {
    if (w.storyId !== storyId) continue;
    if (dist(p, w.a) < 0.8 || dist(p, w.b) < 0.8) return false;
  }
  for (const c of project.columns) {
    if (c.storyId === storyId && dist(p, c.position) < 0.8) return false;
  }
  return true;
}

describe("guides — mesure sur les cinq projets de démonstration", () => {
  it("un point posé au jugé tombe exactement sur l'alignement", () => {
    const JEU = 0.16; // 16 cm : au-delà d'une demi-maille de trame
    const TOL = 0.25;
    const mesures: { nom: string; avant: number; trame: number; apres: number }[] = [];

    for (const projet of seedProjects()) {
      const storyId = projet.stories[0]!.id;
      const murs = projet.walls.filter((w) => w.storyId === storyId);
      const ys = murs.flatMap((w) => [w.a.y, w.b.y]);
      const yHaut = Math.max(...ys) + 3;
      const concurrentes = abscissesConcurrentes(projet, storyId);

      const ancres: Vec2[] = [];
      for (const w of murs) ancres.push(w.a, w.b);
      ancres.sort((l, r) => l.x - r.x || l.y - r.y);

      let mesure: { nom: string; avant: number; trame: number; apres: number } | null = null;
      for (const ancre of ancres) {
        const seule = concurrentes.every(
          (x) => Math.abs(x - ancre.x) < 1e-9 || Math.abs(x - ancre.x) > 0.8,
        );
        if (!seule) continue;
        const brut: Vec2 = { x: ancre.x + JEU, y: yHaut };
        if (!loinDeToutePoint(projet, storyId, brut)) continue;
        if (yHaut - ancre.y > 35) continue;

        const res = resolveGuidedPoint(brut, projet, storyId, {
          tolerance: TOL,
          useGrid: true,
          snapStep: 0.25,
        });
        assert.ok(
          res.retenus.length >= 1 && ["axe", "alignement"].includes(res.retenus[0]!.kind),
          `${projet.name} : un alignement était attendu, reçu ${JSON.stringify(res.retenus.map((g) => g.kind))}`,
        );
        mesure = {
          nom: projet.name,
          avant: Math.abs(brut.x - ancre.x) * 1000,
          trame: Math.abs(snapVec(brut, 0.25).x - ancre.x) * 1000,
          apres: Math.abs(res.point.x - ancre.x) * 1000,
        };
        assert.ok(mesure.avant > 100, `${projet.name} : le jeu de départ doit être franc`);
        assert.ok(mesure.apres < 1e-6, `${projet.name} : écart résiduel ${mesure.apres} mm`);

        // Contrôle négatif : sans guides, le point reste faux.
        const sansGuide = resolveGuidedPoint(brut, projet, storyId, {
          tolerance: 1e-6,
          useGrid: true,
          snapStep: 0.25,
        });
        assert.deepEqual(sansGuide.retenus, []);
        assert.ok(
          Math.abs(sansGuide.point.x - ancre.x) > 0.05,
          `${projet.name} : la trame seule ne doit pas retomber sur l'alignement`,
        );
        break;
      }
      assert.ok(mesure, `${projet.name} : aucune ancre isolée trouvée`);
      mesures.push(mesure!);
    }

    assert.equal(mesures.length, 5, "les cinq projets doivent être mesurés");
    for (const m of mesures) {
      console.log(
        `${m.nom.padEnd(18)} brut ${m.avant.toFixed(1)} mm · trame ${m.trame.toFixed(1)} mm · guidé ${m.apres.toFixed(4)} mm`,
      );
    }
  });
});
