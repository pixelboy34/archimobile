import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  KEYNOTE_LOTS,
  LOT_HORS,
  anchorOfEntity,
  buildKeynoteLegend,
  checkKeynotes,
  compareKeynoteCodes,
  exportKeynotesCsv,
  formatKeynoteCode,
  lotLabel,
  lotNumber,
  nextKeynoteCode,
  parseKeynoteCode,
  renumberKeynotes,
  resolveKeynoteRefs,
} from "./keynotes.ts";
import { buildPlanSvg } from "./planSvg.ts";
import { buildDossierHtml } from "./dossier.ts";
import { seedProjects } from "./seed.ts";
import { rectPolygon } from "./geometry.ts";
import type { Keynote, KeynoteRef, Project } from "./types.ts";

// --------------------------------------------------------------- fixtures

function note(id: string, code: string, lot: string, texte = `Note ${id}`, detail?: string): Keynote {
  return { id, code, lot, texte, ...(detail ? { detail } : {}) };
}

function ref(id: string, keynoteId: string, storyId: string, extra: Partial<KeynoteRef> = {}): KeynoteRef {
  return { id, keynoteId, storyId, at: { x: 2, y: 2 }, ...extra };
}

/** Une cellule carrée sur un niveau : assez pour un plan et des ancres. */
function cell(): Project {
  const now = "2026-01-01T00:00:00.000Z";
  const poly = rectPolygon(0, 0, 6, 4);
  return {
    id: "prj",
    name: "Cellule",
    createdAt: now,
    updatedAt: now,
    meta: { north: 0 },
    stories: [{ id: "s0", name: "RDC", elevation: 0, height: 2.8 }],
    walls: [
      {
        id: "w0",
        storyId: "s0",
        a: { x: 0, y: 0 },
        b: { x: 6, y: 0 },
        thickness: 0.2,
        height: 2.8,
        materialId: "concrete",
      },
      {
        id: "w1",
        storyId: "s0",
        a: { x: 6, y: 0 },
        b: { x: 6, y: 4 },
        thickness: 0.2,
        height: 2.8,
        materialId: "concrete",
      },
    ],
    openings: [
      { id: "op0", wallId: "w0", t: 0.5, kind: "window", width: 1.2, height: 1.2, sill: 0.9 },
    ],
    slabs: [{ id: "sl0", storyId: "s0", polygon: poly, thickness: 0.2, materialId: "concrete" }],
    roofs: [],
    columns: [{ id: "c0", storyId: "s0", position: { x: 3, y: 2 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete" }],
    stairs: [],
    furniture: [],
    rooms: [
      {
        id: "r0",
        storyId: "s0",
        name: "Séjour",
        polygon: poly,
        function: "living",
      },
    ],
  } as unknown as Project;
}

// ------------------------------------------------------------------ lots

describe("lots CCTP", () => {
  it("rapproche les orthographes du même lot", () => {
    assert.equal(lotNumber("Gros œuvre"), 2);
    assert.equal(lotNumber("gros oeuvre"), 2);
    assert.equal(lotNumber("GROS ŒUVRE"), 2);
    assert.equal(lotLabel("gros oeuvre"), "Gros œuvre");
  });

  it("laisse un lot hors catalogue s'annoncer par son numéro", () => {
    assert.equal(lotNumber("17 Photovoltaïque"), 17);
    assert.equal(lotLabel("17 Photovoltaïque"), "17 Photovoltaïque");
  });

  it("range en lot 0 ce qui n'est rattaché à rien", () => {
    assert.equal(lotNumber(""), 0);
    assert.equal(lotNumber("Divers"), 0);
    assert.equal(lotLabel(""), LOT_HORS);
    assert.equal(lotLabel("Divers"), "Divers");
  });

  it("n'a pas deux lots au même numéro dans le catalogue", () => {
    const nums = KEYNOTE_LOTS.map((l) => l.num);
    assert.equal(new Set(nums).size, nums.length);
    // Le numéro doit être retrouvé depuis le libellé, sinon les codes dérivent.
    for (const l of KEYNOTE_LOTS) assert.equal(lotNumber(l.label), l.num);
  });
});

describe("codes", () => {
  it("écrit « lot.rang » sur deux chiffres", () => {
    assert.equal(formatKeynoteCode(3, 2), "3.02");
    assert.equal(formatKeynoteCode(12, 11), "12.11");
  });

  it("refuse ce qui n'est pas un code", () => {
    assert.equal(parseKeynoteCode("3"), null);
    assert.equal(parseKeynoteCode("A.01"), null);
    assert.equal(parseKeynoteCode("3.00"), null);
    assert.deepEqual(parseKeynoteCode("3.01"), { lotNum: 3, rank: 1 });
  });

  it("trie par lot puis par rang, pas dans l'ordre du dictionnaire", () => {
    const codes = ["12.01", "2.10", "2.02", "3.01"];
    const sorted = [...codes].sort(compareKeynoteCodes);
    assert.deepEqual(sorted, ["2.02", "2.10", "3.01", "12.01"]);
    // Le tri lexical, lui, placerait 12.01 en tête : c'est ce qu'on évite.
    assert.equal([...codes].sort()[0], "12.01");
  });
});

// ----------------------------------------------------------- numérotation

describe("renumérotation", () => {
  it("numérote une base vierge par lot, dans l'ordre de saisie", () => {
    const base = [
      note("a", "", "Gros œuvre"),
      note("b", "", "Couverture"),
      note("c", "", "Gros œuvre"),
    ];
    assert.deepEqual(renumberKeynotes(base).map((k) => k.code), ["2.01", "4.01", "2.02"]);
  });

  it("est idempotente", () => {
    const base = [
      note("a", "", "Gros œuvre"),
      note("b", "9.07", "Plomberie · sanitaires"),
      note("c", "", "Gros œuvre"),
      note("d", "", "17 Photovoltaïque"),
    ];
    const once = renumberKeynotes(base);
    const twice = renumberKeynotes(once);
    const thrice = renumberKeynotes(twice);
    assert.deepEqual(once.map((k) => k.code), twice.map((k) => k.code));
    assert.deepEqual(twice.map((k) => k.code), thrice.map((k) => k.code));
    // Et le rang déjà posé n'est pas ramené à 1 par principe.
    assert.equal(once.find((k) => k.id === "b")!.code, "9.07");
  });

  it("ne renumérote pas les autres quand un repère s'ajoute", () => {
    const base = renumberKeynotes([
      note("a", "", "Gros œuvre"),
      note("b", "", "Gros œuvre"),
      note("c", "", "Couverture"),
    ]);
    const grown = renumberKeynotes([...base, note("d", "", "Gros œuvre")]);
    for (const k of base) {
      assert.equal(grown.find((g) => g.id === k.id)!.code, k.code, `${k.id} a bougé`);
    }
    assert.equal(grown.find((k) => k.id === "d")!.code, "2.03");
  });

  it("réattribue le code d'un repère qui change de lot, sans toucher son ancien lot", () => {
    const base = [note("a", "2.01", "Gros œuvre"), note("b", "2.02", "Gros œuvre")];
    const moved = renumberKeynotes([base[0]!, { ...base[1]!, lot: "Couverture" }]);
    assert.equal(moved.find((k) => k.id === "a")!.code, "2.01");
    assert.equal(moved.find((k) => k.id === "b")!.code, "4.01");
  });

  it("casse un doublon au profit du premier de la base", () => {
    const fixed = renumberKeynotes([
      note("a", "2.01", "Gros œuvre"),
      note("b", "2.01", "Gros œuvre"),
    ]);
    assert.equal(fixed.find((k) => k.id === "a")!.code, "2.01");
    assert.equal(fixed.find((k) => k.id === "b")!.code, "2.02");
  });

  it("comble un rang libéré plutôt que d'empiler", () => {
    const base = [note("a", "2.02", "Gros œuvre"), note("b", "", "Gros œuvre")];
    assert.equal(renumberKeynotes(base).find((k) => k.id === "b")!.code, "2.01");
  });

  it("nextKeynoteCode donne le prochain rang libre sans rien modifier", () => {
    const base = [note("a", "2.01", "Gros œuvre"), note("b", "2.03", "Gros œuvre")];
    assert.equal(nextKeynoteCode(base, "Gros œuvre"), "2.02");
    assert.equal(nextKeynoteCode(base, "Couverture"), "4.01");
    assert.equal(base[0]!.code, "2.01");
  });
});

// --------------------------------------------------------------- légende

describe("légende", () => {
  function withNotes(): Project {
    const p = cell();
    p.keynotes = [
      note("k1", "2.01", "Gros œuvre", "Voile béton 20 cm", "Béton C25/30, parement soigné."),
      note("k2", "6.01", "Menuiseries extérieures", "Châssis alu RAL 7016"),
      note("k3", "13.01", "Peinture", "Jamais appelée"),
    ];
    p.stories.push({ id: "s1", name: "R+1", elevation: 2.8, height: 2.6 });
    p.keynoteRefs = [
      ref("r1", "k1", "s0"),
      ref("r2", "k1", "s0", { at: { x: 4, y: 1 } }),
      ref("r3", "k2", "s0", { at: { x: 3, y: 0.1 }, offset: { x: 0.8, y: 1.4 }, targetId: "op0" }),
      ref("r4", "k2", "s1"),
    ];
    return p;
  }

  it("ne liste que les repères appelés sur l'étage demandé", () => {
    const legend = buildKeynoteLegend(withNotes(), "s0");
    const codes = legend.groups.flatMap((g) => g.entries.map((e) => e.code));
    assert.deepEqual(codes, ["2.01", "6.01"]);
    assert.equal(legend.noteCount, 2);
    assert.equal(legend.callCount, 3);
    // 13.01 existe dans la base mais n'est appelée nulle part : hors légende.
    assert.ok(!codes.includes("13.01"));
  });

  it("compte les appels de chaque repère sur le périmètre demandé", () => {
    const p = withNotes();
    const s0 = buildKeynoteLegend(p, "s0");
    const flat = new Map(s0.groups.flatMap((g) => g.entries.map((e) => [e.code, e.count] as const)));
    assert.equal(flat.get("2.01"), 2);
    assert.equal(flat.get("6.01"), 1);
    // 6.01 est aussi appelée en R+1 : le total projet le voit, le plan RDC non.
    const all = buildKeynoteLegend(p, null);
    const flatAll = new Map(all.groups.flatMap((g) => g.entries.map((e) => [e.code, e.count] as const)));
    assert.equal(flatAll.get("6.01"), 2);
    assert.equal(all.callCount, 4);
  });

  it("groupe par lot, dans l'ordre du CCTP", () => {
    const p = withNotes();
    p.keynoteRefs!.push(ref("r5", "k3", "s0"));
    const legend = buildKeynoteLegend(p, "s0");
    assert.deepEqual(legend.groups.map((g) => g.lotNum), [2, 6, 13]);
    assert.deepEqual(legend.groups.map((g) => g.lot), [
      "Gros œuvre",
      "Menuiseries extérieures",
      "Peinture",
    ]);
  });

  it("ignore un appel dont le repère a disparu", () => {
    const p = withNotes();
    p.keynotes = p.keynotes!.filter((k) => k.id !== "k1");
    const legend = buildKeynoteLegend(p, "s0");
    assert.deepEqual(legend.groups.flatMap((g) => g.entries.map((e) => e.code)), ["6.01"]);
    assert.equal(legend.callCount, 1);
  });

  it("resolveKeynoteRefs marque l'amorce seulement si l'étiquette est déportée", () => {
    const res = resolveKeynoteRefs(withNotes(), "s0");
    assert.equal(res.length, 3);
    assert.deepEqual(res.map((r) => r.code), ["2.01", "2.01", "6.01"]);
    const posee = res.find((r) => r.ref.id === "r1")!;
    const deportee = res.find((r) => r.ref.id === "r3")!;
    assert.equal(posee.leader, false);
    assert.deepEqual(posee.label, posee.anchor);
    assert.equal(deportee.leader, true);
    assert.deepEqual(deportee.label, { x: 3.8, y: 1.5 });
  });
});

// ------------------------------------------------------------- cohérence

describe("contrôles de cohérence", () => {
  it("ne dit rien d'un dossier sain", () => {
    const p = cell();
    p.keynotes = [note("k1", "2.01", "Gros œuvre")];
    p.keynoteRefs = [ref("r1", "k1", "s0", { targetId: "w0" })];
    assert.deepEqual(checkKeynotes(p), []);
  });

  it("signale un repère jamais appelé", () => {
    const p = cell();
    p.keynotes = [note("k1", "2.01", "Gros œuvre")];
    p.keynoteRefs = [];
    const found = checkKeynotes(p);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.kind, "repere-inutilise");
    assert.equal(found[0]!.severity, "avertissement");
    assert.equal(found[0]!.keynoteId, "k1");
  });

  it("signale un appel qui pointe un repère disparu", () => {
    const p = cell();
    p.keynotes = [];
    p.keynoteRefs = [ref("r1", "k-parti", "s0")];
    const found = checkKeynotes(p);
    assert.deepEqual(found.map((i) => i.kind), ["appel-orphelin"]);
    assert.equal(found[0]!.severity, "erreur");
    assert.equal(found[0]!.refId, "r1");
  });

  it("signale un code en double", () => {
    const p = cell();
    p.keynotes = [note("k1", "2.01", "Gros œuvre"), note("k2", "2.01", "Gros œuvre")];
    p.keynoteRefs = [ref("r1", "k1", "s0"), ref("r2", "k2", "s0")];
    const found = checkKeynotes(p);
    assert.deepEqual(found.map((i) => i.kind), ["code-double"]);
    assert.equal(found[0]!.keynoteId, "k2");
    // Et la renumérotation le résout.
    p.keynotes = renumberKeynotes(p.keynotes);
    assert.deepEqual(checkKeynotes(p), []);
  });

  it("signale une cible qui ne désigne plus rien", () => {
    const p = cell();
    p.keynotes = [note("k1", "2.01", "Gros œuvre")];
    p.keynoteRefs = [ref("r1", "k1", "s0", { targetId: "w0" })];
    assert.deepEqual(checkKeynotes(p), []);
    p.walls = p.walls.filter((w) => w.id !== "w0");
    p.openings = [];
    const found = checkKeynotes(p);
    assert.deepEqual(found.map((i) => i.kind), ["cible-absente"]);
    assert.equal(found[0]!.refId, "r1");
  });

  it("signale un appel resté sur un étage supprimé", () => {
    const p = cell();
    p.keynotes = [note("k1", "2.01", "Gros œuvre")];
    p.keynoteRefs = [ref("r1", "k1", "s-parti")];
    const found = checkKeynotes(p);
    assert.deepEqual(found.map((i) => i.kind), ["appel-hors-niveau"]);
    assert.equal(found[0]!.storyId, "s-parti");
  });

  it("met les erreurs avant les avertissements", () => {
    const p = cell();
    p.keynotes = [note("k1", "2.01", "Gros œuvre"), note("k2", "2.01", "Gros œuvre")];
    p.keynoteRefs = [ref("r1", "k1", "s0"), ref("r2", "kX", "s0")];
    const found = checkKeynotes(p);
    const severities = found.map((i) => i.severity);
    assert.ok(severities.length >= 3);
    assert.equal(severities.indexOf("avertissement"), severities.lastIndexOf("erreur") + 1);
  });
});

// ------------------------------------------------------------------ ancre

describe("ancre d'un ouvrage", () => {
  it("place l'appel au milieu du mur, au centre de la pièce, sur la baie", () => {
    const p = cell();
    assert.deepEqual(anchorOfEntity(p, "w0"), { at: { x: 3, y: 0 }, storyId: "s0" });
    assert.deepEqual(anchorOfEntity(p, "op0"), { at: { x: 3, y: 0 }, storyId: "s0" });
    assert.deepEqual(anchorOfEntity(p, "c0"), { at: { x: 3, y: 2 }, storyId: "s0" });
    const room = anchorOfEntity(p, "r0")!;
    assert.equal(room.storyId, "s0");
    assert.ok(Math.abs(room.at.x - 3) < 1e-9 && Math.abs(room.at.y - 2) < 1e-9);
  });

  it("rend null pour un identifiant inconnu", () => {
    assert.equal(anchorOfEntity(cell(), "rien"), null);
  });
});

// ---------------------------------------------------- plan, dossier, CSV

describe("mêmes codes du plan au dossier", () => {
  /** Villa Calanque annotée : un projet réel, pas une maquette de test. */
  function villa(): Project {
    const p = seedProjects().find((x) => x.name === "Villa Calanque")!;
    const rdc = p.stories[0]!;
    const wall = p.walls.find((w) => w.storyId === rdc.id)!;
    const win = p.openings.find((o) => {
      const host = p.walls.find((w) => w.id === o.wallId);
      return o.kind === "window" && host?.storyId === rdc.id;
    })!;
    p.keynotes = [
      note("k1", "2.01", "Gros œuvre", "Voile béton banché ép. 20", "Béton C25/30 · parement type P2."),
      note("k2", "6.01", "Menuiseries extérieures", "Châssis alu RAL 7016", "Uw ≤ 1,4 · double vitrage 4/16/4 argon."),
      note("k3", "13.01", "Peinture", "Peinture mate lessivable"),
    ];
    p.keynoteRefs = [
      { id: "r1", keynoteId: "k1", storyId: rdc.id, at: { x: wall.a.x, y: wall.a.y }, targetId: wall.id },
      {
        id: "r2",
        keynoteId: "k2",
        storyId: rdc.id,
        at: { x: wall.b.x, y: wall.b.y },
        offset: { x: 1.5, y: 1.5 },
        targetId: win.id,
      },
    ];
    return p;
  }

  it("dessine une pastille par appel, et rien de plus", () => {
    const p = villa();
    const svg = buildPlanSvg(p, p.stories[0]!);
    assert.equal((svg.match(/>2\.01</g) ?? []).length, 2, "code au plan + en légende");
    assert.equal((svg.match(/>6\.01</g) ?? []).length, 2);
    // Le repère jamais appelé n'apparaît nulle part sur la feuille.
    assert.ok(!svg.includes("13.01"));
    assert.ok(!svg.includes("Peinture mate"));
  });

  it("porte le code sur le plan et le texte en légende, jamais la spécification longue", () => {
    const p = villa();
    const svg = buildPlanSvg(p, p.stories[0]!);
    assert.ok(svg.includes("Châssis alu RAL 7016"));
    assert.ok(!svg.includes("Uw"), "la spécification longue reste au dossier");
    assert.ok(svg.includes("LÉGENDE"));
  });

  it("ne trace une amorce que pour l'étiquette déportée", () => {
    const p = villa();
    const svg = buildPlanSvg(p, p.stories[0]!);
    // Le point d'ancre en accent n'est dessiné qu'avec l'amorce : un seul appel
    // sur deux est déporté.
    const dots = svg.match(/<circle[^>]*r="1\.8"[^>]*fill="#6ed0c3"/g) ?? [];
    assert.equal(dots.length, 1);
  });

  it("laisse intact le plan d'un projet sans repère", () => {
    const p = villa();
    const annotated = buildPlanSvg(p, p.stories[0]!);
    const bare = buildPlanSvg({ ...p, keynotes: [], keynoteRefs: [] }, p.stories[0]!);
    assert.notEqual(annotated, bare);
    assert.ok(!bare.includes("LÉGENDE"));
    // Sans repère le cadrage doit être exactement celui d'avant ce lot :
    // l'option le prouve en rendant la même chaîne que le plan désactivé.
    assert.equal(buildPlanSvg(p, p.stories[0]!, { keynotes: false }), bare);
  });

  it("le dossier reprend le même code que le plan, avec la spécification longue", () => {
    const p = villa();
    const svg = buildPlanSvg(p, p.stories[0]!);
    const { html } = buildDossierHtml(p);
    for (const code of ["2.01", "6.01"]) {
      assert.ok(svg.includes(`>${code}<`), `${code} absent du plan`);
      assert.ok(html.includes(`>${code}<`), `${code} absent du dossier`);
    }
    assert.ok(html.includes("Repères de nomenclature"));
    assert.ok(html.includes("Uw ≤ 1,4 · double vitrage 4/16/4 argon."));
    assert.ok(html.includes("Lot 06 · Menuiseries extérieures"));
    // La page de légende du dossier ne liste pas davantage que les plans.
    assert.ok(!html.includes("Peinture mate lessivable"));
  });

  it("n'annonce pas deux fois le numéro d'un lot hors catalogue", () => {
    const p = villa();
    p.keynotes = [note("k9", "17.01", "17 Photovoltaïque", "Panneaux 400 Wc")];
    p.keynoteRefs = [{ id: "r9", keynoteId: "k9", storyId: p.stories[0]!.id, at: { x: 0, y: 0 } }];
    const { html } = buildDossierHtml(p);
    assert.ok(html.includes(">17 Photovoltaïque<"));
    assert.ok(!html.includes("Lot 17 · 17 Photovoltaïque"));
    // Le lot du catalogue, lui, garde bien son préfixe.
    p.keynotes.push(note("k8", "4.01", "Couverture", "Tuile canal"));
    p.keynoteRefs.push({ id: "r8", keynoteId: "k8", storyId: p.stories[0]!.id, at: { x: 1, y: 1 } });
    assert.ok(buildDossierHtml(p).html.includes("Lot 04 · Couverture"));
  });

  it("n'ajoute pas de page de légende à un projet sans repère", () => {
    const p = seedProjects().find((x) => x.name === "Villa Calanque")!;
    assert.ok(!buildDossierHtml(p).html.includes("Repères de nomenclature"));
  });

  it("exporte la base entière en CSV, appels comptés", () => {
    const csv = exportKeynotesCsv(villa());
    const lines = csv.split("\n");
    assert.equal(lines[2], '"Code";"Lot";"Désignation";"Spécification";"Appels"');
    assert.equal(
      lines[3],
      '"2.01";"Gros œuvre";"Voile béton banché ép. 20";"Béton C25/30 · parement type P2.";"1"',
    );
    // Le repère non appelé figure bien à la base, à zéro appel : c'est la
    // différence entre la base et la légende.
    assert.equal(lines[5], '"13.01";"Peinture";"Peinture mate lessivable";"";"0"');
    assert.equal(lines[lines.length - 1], '"";"Total appels";"";"";"2"');
  });

  it("échappe le guillemet plutôt que de casser la colonne", () => {
    const p = cell();
    p.keynotes = [note("k1", "2.01", "Gros œuvre", 'Voile dit "banché"')];
    p.keynoteRefs = [];
    assert.ok(exportKeynotesCsv(p).includes('"Voile dit ""banché"""'));
  });
});
