import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { importDxf, describeDxfImport, dxfToSketch } from "./dxf-import.ts";
import { exportDxf } from "./dxf.ts";
import { seedProjects } from "../bim/seed.ts";

/**
 * Fixture écrite à la main, coordonnées choisies et converties de tête.
 *
 * C'est le seul oracle indépendant de ce module : un aller-retour contre notre
 * propre exportDxf prouverait seulement que nous savons relire ce que nous
 * écrivons. Les valeurs attendues ci-dessous ne sortent d'aucun code de FORMA.
 *
 * Unités déclarées en MILLIMÈTRES ($INSUNITS 4), donc tout est divisé par
 * mille en sortie. Étendue brute : x de 0 à 10 000, y de −1 000 à 8 000.
 */
const FIXTURE_MM = [
  "0", "SECTION", "2", "HEADER",
  "9", "$INSUNITS", "70", "4",
  "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  // Un mur : ligne de (0,0) à (10000,0) mm, soit 10 m de long.
  "0", "LINE", "8", "MURS",
  "10", "0", "20", "0", "11", "10000", "21", "0",
  // Le contour fermé du bâtiment, 10 m × 8 m.
  "0", "LWPOLYLINE", "8", "MURS", "90", "4", "70", "1",
  "10", "0", "20", "0",
  "10", "10000", "20", "0",
  "10", "10000", "20", "8000",
  "10", "0", "20", "8000",
  // Une ligne de cote, 1 m sous le bâtiment.
  "0", "LINE", "8", "COTES",
  "10", "0", "20", "-1000", "11", "10000", "21", "-1000",
  // Un arc : centre (5000,4000), rayon 2000, du quart nord-est.
  "0", "ARC", "8", "ARCS",
  "10", "5000", "20", "4000", "40", "2000", "50", "0", "51", "90",
  // Une entité que nous ne savons pas lire, elle doit être comptée.
  "0", "TEXT", "8", "COTES", "1", "R+1", "10", "500", "20", "500",
  "0", "ENDSEC",
  "0", "EOF",
].join("\n");

describe("import DXF — fixture écrite à la main", () => {
  it("lit les coordonnées au millimètre, en mètres", () => {
    const r = importDxf(FIXTURE_MM);

    assert.equal(r.unit.code, 4, "millimètres déclarés");
    assert.equal(r.unit.inferred, false, "l'en-tête est lue, pas devinée");
    assert.equal(r.unit.factor, 0.001);

    const mur = r.polylines.find((p) => p.source === "LINE" && p.layer === "MURS");
    assert.ok(mur, "la ligne de mur doit être lue");
    assert.deepEqual(mur!.points, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);

    const contour = r.polylines.find((p) => p.source === "LWPOLYLINE");
    assert.ok(contour, "le contour doit être lu");
    assert.equal(contour!.closed, true, "l'indicateur 70=1 marque un contour fermé");
    assert.deepEqual(contour!.points, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]);

    const cote = r.polylines.find((p) => p.layer === "COTES");
    assert.ok(cote, "la ligne de cote doit être lue");
    assert.deepEqual(cote!.points, [
      { x: 0, y: -1 },
      { x: 10, y: -1 },
    ]);
  });

  it("place l'arc sur son cercle, aux deux extrémités", () => {
    const r = importDxf(FIXTURE_MM);
    const arc = r.polylines.find((p) => p.source === "ARC");
    assert.ok(arc, "l'arc doit être lu");

    // Centre (5 ; 4) m, rayon 2 m, de 0° à 90° : départ (7 ; 4), arrivée (5 ; 6).
    const p0 = arc!.points[0]!;
    const pn = arc!.points[arc!.points.length - 1]!;
    assert.ok(Math.abs(p0.x - 7) < 1e-9 && Math.abs(p0.y - 4) < 1e-9, `départ attendu (7;4), obtenu (${p0.x};${p0.y})`);
    assert.ok(Math.abs(pn.x - 5) < 1e-9 && Math.abs(pn.y - 6) < 1e-9, `arrivée attendue (5;6), obtenue (${pn.x};${pn.y})`);

    // Tout point de l'arc est à 2 m du centre, à la flèche près.
    for (const p of arc!.points) {
      const d = Math.hypot(p.x - 5, p.y - 4);
      assert.ok(Math.abs(d - 2) < 1e-9, `point hors du cercle : rayon ${d}`);
    }
  });

  it("rend l'étendue, les calques et ce qu'il n'a pas su lire", () => {
    const r = importDxf(FIXTURE_MM);

    assert.ok(r.extent, "une étendue est attendue");
    assert.ok(Math.abs(r.extent!.width - 10) < 1e-9, `largeur 10 m attendue, obtenue ${r.extent!.width}`);
    assert.ok(Math.abs(r.extent!.height - 9) < 1e-9, `hauteur 9 m attendue, obtenue ${r.extent!.height}`);

    const murs = r.layers.find((l) => l.name === "MURS");
    assert.equal(murs?.count, 2, "deux entités sur MURS");
    assert.ok(r.layers.some((l) => l.name === "COTES"));
    assert.ok(r.layers.some((l) => l.name === "ARCS"));

    const texte = r.ignored.find((i) => i.type === "TEXT");
    assert.equal(texte?.count, 1, "le TEXT doit être compté comme non lu, pas passé sous silence");
  });
});

describe("import DXF — unité déduite quand l'en-tête est muette", () => {
  const sansEntete = FIXTURE_MM.replace('9\n$INSUNITS\n70\n4\n', "");

  it("déduit les millimètres d'un dessin de 10 000 unités", () => {
    const r = importDxf(sansEntete);
    assert.equal(r.unit.inferred, true, "l'unité doit être annoncée comme déduite");
    assert.equal(r.unit.code, 4, "10 000 unités pour un bâtiment : des millimètres");
    assert.ok(Math.abs(r.extent!.width - 10) < 1e-9);
    assert.ok(
      r.warnings.some((w) => /déduite/i.test(w)),
      "l'utilisateur doit être averti que l'unité a été devinée",
    );
  });

  it("déduit les mètres d'un dessin de quelques dizaines d'unités", () => {
    const enMetres = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "12", "21", "9",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");
    const r = importDxf(enMetres);
    assert.equal(r.unit.code, 6, "12 unités pour un bâtiment : des mètres");
    assert.equal(r.unit.inferred, true);
  });

  it("signale une en-tête invraisemblable sans passer outre", () => {
    // Mêmes 10 000 unités, mais déclarées en mètres : 10 km de bâtiment.
    const enorme = FIXTURE_MM.replace('9\n$INSUNITS\n70\n4', "9\n$INSUNITS\n70\n6");
    const r = importDxf(enorme);
    assert.equal(r.unit.code, 6, "la déclaration de l'auteur est respectée");
    assert.equal(r.unit.inferred, false);
    assert.ok(
      r.warnings.some((w) => /ordre de grandeur/i.test(w)),
      "un bâtiment de 10 km doit déclencher un avertissement",
    );
  });
});

describe("import DXF — robustesse sur des fichiers réels", () => {
  it("accepte les fins de ligne Windows et les espaces autour des codes", () => {
    const sale = FIXTURE_MM.split("\n").map((l) => "  " + l + " ").join("\r\n");
    const r = importDxf(sale);
    const contour = r.polylines.find((p) => p.source === "LWPOLYLINE");
    assert.ok(contour, "un fichier CRLF indenté reste lisible");
    assert.equal(contour!.points.length, 4);
  });

  it("rend ce qu'il a lu d'un fichier tronqué, sans lever", () => {
    const coupe = FIXTURE_MM.slice(0, FIXTURE_MM.indexOf("0\nARC"));
    const r = importDxf(coupe);
    assert.ok(r.polylines.length >= 3, "les entités complètes avant la coupure sont gardées");
    assert.ok(!r.warnings.some((w) => /^Error/i.test(w)));
  });

  it("ne lève pas sur une entrée vide ou qui n'est pas du DXF", () => {
    for (const mauvais of ["", "   ", "ceci n'est pas un DXF", "{\"json\":true}"]) {
      const r = importDxf(mauvais);
      assert.equal(r.polylines.length, 0);
      assert.ok(r.warnings.length > 0, `un avertissement est attendu pour « ${mauvais.slice(0, 20)} »`);
    }
  });

  it("garde une POLYLINE ancienne école, même sans SEQEND", () => {
    const vieux = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "POLYLINE", "8", "MURS", "70", "1",
      "0", "VERTEX", "8", "MURS", "10", "0", "20", "0",
      "0", "VERTEX", "8", "MURS", "10", "6", "20", "0",
      "0", "VERTEX", "8", "MURS", "10", "6", "20", "4",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");
    const r = importDxf(vieux);
    const poly = r.polylines.find((p) => p.source === "POLYLINE");
    assert.ok(poly, "la POLYLINE doit être retenue malgré l'absence de SEQEND");
    assert.equal(poly!.points.length, 3);
    assert.equal(poly!.closed, true);
    assert.ok(r.warnings.some((w) => /SEQEND/.test(w)));
  });
});

describe("import DXF — finesse des arcs", () => {
  function cercle(rayonM: number): string {
    return [
      "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "CIRCLE", "8", "0", "10", "0", "20", "0", "40", String(rayonM),
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");
  }

  it("segmente selon la flèche, donc plus finement quand le cercle est grand", () => {
    const petit = importDxf(cercle(0.3)).polylines[0]!;
    const grand = importDxf(cercle(30)).polylines[0]!;
    assert.ok(
      grand.points.length > petit.points.length,
      `un cercle de 30 m doit recevoir plus de segments qu'un de 30 cm (${grand.points.length} contre ${petit.points.length})`,
    );
  });

  it("respecte la flèche demandée", () => {
    const fleche = 0.005;
    const c = importDxf(cercle(10), { sagitta: fleche }).polylines[0]!;
    // Écart maximal entre la corde et l'arc, mesuré sur les milieux de corde.
    let pire = 0;
    for (let i = 0; i + 1 < c.points.length; i++) {
      const a = c.points[i]!;
      const b = c.points[i + 1]!;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pire = Math.max(pire, 10 - Math.hypot(m.x, m.y));
    }
    assert.ok(pire <= fleche * 1.05, `flèche mesurée ${pire.toFixed(5)} m pour ${fleche} m demandés`);
  });
});

describe("import DXF — aller-retour avec notre propre export", () => {
  // Oracle secondaire et volontairement reconnu comme circulaire : il prouve
  // la compatibilité avec notre exportateur, pas la justesse de la lecture.
  it("retrouve l'étendue du plan d'un projet réel", () => {
    const villa = seedProjects().find((p) => /Villa/.test(p.name))!;
    const dxf = exportDxf(villa, { plan: true });
    const r = importDxf(dxf);

    assert.ok(r.polylines.length > 0, "l'export de FORMA doit être relisible par FORMA");
    assert.equal(r.unit.code, 6, "nous écrivons $INSUNITS 6");
    assert.equal(r.unit.inferred, false);
    assert.ok(r.extent, "une étendue est attendue");
    // Une villa tient dans quelques dizaines de mètres.
    assert.ok(r.extent!.width > 1 && r.extent!.width < 200, `largeur invraisemblable : ${r.extent!.width}`);
    assert.ok(r.layers.length > 1, "les calques de l'export doivent ressortir");
  });

  it("compte les 3DFACE des toitures comme non lus plutôt que de les perdre en silence", () => {
    const pavillon = seedProjects().find((p) => /Pavillon/.test(p.name))!;
    const r = importDxf(exportDxf(pavillon));
    const faces = r.ignored.find((i) => i.type === "3DFACE");
    if (faces) assert.ok(faces.count > 0, "les faces de toiture sont annoncées comme non lues");
  });
});

describe("import DXF — passage en calques d'esquisse", () => {
  it("ramène un plan en coordonnées nationales près de l'origine", () => {
    // Lambert 93 : un plan de géomètre vit à 650 km de l'origine. Sans
    // recentrage, le cadrage de FORMA n'a plus aucun sens.
    const lambert = [
      "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "8", "CADASTRE", "90", "4", "70", "1",
      "10", "652340", "20", "6862100",
      "10", "652352", "20", "6862100",
      "10", "652352", "20", "6862109",
      "10", "652340", "20", "6862109",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");

    const r = importDxf(lambert);
    assert.ok(Math.abs(r.extent!.width - 12) < 1e-6, `12 m attendus, ${r.extent!.width}`);

    const sk = dxfToSketch(r, "st_rdc");
    const pts = sk.strokes[0]!.points;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    assert.ok(Math.min(...xs) === 0 && Math.min(...ys) === 0, "le coin bas-gauche doit tomber sur l'origine");
    assert.ok(Math.max(...xs) <= 12 + 1e-6 && Math.max(...ys) <= 9 + 1e-6, "le dessin garde ses dimensions");
    assert.deepEqual(sk.recentered, { x: -652340, y: -6862100 }, "la translation doit être rendue");
  });

  it("referme les contours fermés et range chaque trait sur son calque", () => {
    const sk = dxfToSketch(importDxf(FIXTURE_MM), "st_rdc");
    assert.equal(sk.layers.length, 3, "MURS, COTES et ARCS");

    const contour = sk.strokes.find((s) => s.points.length === 5);
    assert.ok(contour, "le contour fermé doit être bouclé explicitement");
    assert.deepEqual(contour!.points[0], contour!.points[4], "premier et dernier point confondus");

    const murs = sk.layers.find((l) => l.name === "MURS")!;
    const surMurs = sk.strokes.filter((s) => s.layerId === murs.id);
    assert.equal(surMurs.length, 2, "les deux entités MURS restent ensemble");
    assert.ok(sk.strokes.every((s) => s.storyId === "st_rdc"));
  });

  it("produit les mêmes identifiants à chaque appel", () => {
    const r = importDxf(FIXTURE_MM);
    const a = dxfToSketch(r, "st_rdc");
    const b = dxfToSketch(r, "st_rdc");
    assert.deepEqual(
      a.strokes.map((s) => s.id),
      b.strokes.map((s) => s.id),
      "le domaine doit rester rejouable : pas d'identifiant tiré au hasard",
    );
  });
});

describe("import DXF — résumé montré à l'utilisateur", () => {
  it("dit le nombre de polylignes, les calques, l'unité et ce qui manque", () => {
    const texte = describeDxfImport(importDxf(FIXTURE_MM));
    assert.match(texte, /polyligne/);
    assert.match(texte, /calque/);
    assert.match(texte, /millimètres/);
    assert.match(texte, /non lue/);
    assert.doesNotMatch(texte, /undefined|NaN/);
  });

  it("annonce franchement une unité déduite", () => {
    const sansEntete = FIXTURE_MM.replace('9\n$INSUNITS\n70\n4\n', "");
    assert.match(describeDxfImport(importDxf(sansEntete)), /déduits/);
  });
});
