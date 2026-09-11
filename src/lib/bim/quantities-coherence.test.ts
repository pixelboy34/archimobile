import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { emptyProject } from "./builder.ts";
import { wallLength } from "./geometry.ts";
import { buildNomenclature } from "./nomenclature.ts";
import { computeQuantities } from "./quantities.ts";
import { seedProjects } from "./seed.ts";
import type { Project, Roof, RoofKind } from "./types.ts";
import { generateMassing } from "../cad/massing.ts";
import { roofFaces } from "../cad/roof-planes.ts";

/** Aire d'un polygone gauche par la formule de Newell — meme calcul que le correctif. */
function faceArea(corners: { x: number; y: number; z: number }[]): number {
  if (corners.length < 3) return 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i]!;
    const q = corners[(i + 1) % corners.length]!;
    nx += (p.y - q.y) * (p.z + q.z);
    ny += (p.z - q.z) * (p.x + q.x);
    nz += (p.x - q.x) * (p.y + q.y);
  }
  return Math.hypot(nx, ny, nz) / 2;
}

/** Surface de couverture telle que l'IFC, le DXF et la 3D la livrent. */
function livredRoofM2(project: Project): number {
  let total = 0;
  for (const r of project.roofs) {
    if (r.polygon.length < 3) continue;
    const story = project.stories.find((s) => s.id === r.storyId);
    const z0 = (story?.elevation ?? 0) + (story?.height ?? 2.8);
    for (const f of roofFaces(r, z0)) total += faceArea(f.corners);
  }
  return total;
}

function immeubleAvecCloisons(): Project {
  return generateMassing(emptyProject("Immeuble"), {
    width: 18,
    depth: 14,
    floors: 7,
    floorHeight: 2.9,
  });
}

function netArea(project: Project, wallId: string): number {
  const w = project.walls.find((x) => x.id === wallId)!;
  const baies = project.openings
    .filter((o) => o.wallId === w.id)
    .reduce((s, o) => s + o.width * o.height, 0);
  return Math.max(0, wallLength(w) * w.height - baies);
}

/** Projet minimal portant une seule toiture, pour isoler pente et debord. */
function toitSeul(kind: RoofKind, pitch: number, overhang = 0.4): Project {
  const p = emptyProject("Toit");
  const story = p.stories[0]!;
  const roof: Roof = {
    id: "rf-test",
    storyId: story.id,
    polygon: [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 9 },
      { x: 0, y: 9 },
    ],
    kind,
    pitch,
    overhang,
    thickness: 0.18,
    materialId: "terracotta",
  };
  p.roofs.push(roof);
  return p;
}

describe("coherence du metre", () => {
  it("facture les cloisons au meme prix que la nomenclature Murs", () => {
    const p = immeubleAvecCloisons();
    const cloisons = p.walls.filter((w) => w.partition);
    assert.ok(cloisons.length > 0, "le volume genere doit comporter des cloisons");

    const bill = computeQuantities(p);
    const murs = bill.lines.find((l) => l.key === "walls");
    const cloison = bill.lines.find((l) => l.key === "partition");
    assert.ok(murs, "le metre doit porter une ligne Murs (elevation)");
    assert.ok(cloison, "le metre doit porter une ligne Cloisons distincte");
    assert.equal(murs.unitPrice, 165);
    assert.equal(cloison.unitPrice, 85);

    const nom = buildNomenclature(p, "murs");
    // Meme page, meme quantite : les deux totaux doivent tomber a l'euro pres.
    assert.ok(
      Math.abs(murs.total + cloison.total - nom.totalHT) <= 1,
      `metre ${murs.total + cloison.total} EUR contre nomenclature ${nom.totalHT} EUR`,
    );
  });

  it("separe les deux accumulateurs sur le meme test que la nomenclature", () => {
    const p = immeubleAvecCloisons();
    const bill = computeQuantities(p);
    const attenduElev = p.walls
      .filter((w) => !w.partition)
      .reduce((s, w) => s + netArea(p, w.id), 0);
    const attenduCloison = p.walls
      .filter((w) => w.partition)
      .reduce((s, w) => s + netArea(p, w.id), 0);

    const murs = bill.lines.find((l) => l.key === "walls")!;
    const cloison = bill.lines.find((l) => l.key === "partition")!;
    assert.ok(Math.abs(murs.qty - attenduElev) < 0.02);
    assert.ok(Math.abs(cloison.qty - attenduCloison) < 0.02);
    // Le cumul reste celui affiche en KPI du dossier.
    assert.ok(Math.abs(bill.wallM2 - (attenduElev + attenduCloison)) < 0.02);
  });

  it("laisse le total HT inchange quand le projet n'a aucune cloison", () => {
    for (const seed of seedProjects()) {
      const bill = computeQuantities(seed);
      assert.equal(
        bill.lines.some((l) => l.key === "partition"),
        false,
        `${seed.name} n'a pas de cloison : pas de ligne Cloisons`,
      );
    }
  });
});

describe("metre de toiture", () => {
  it("suit les pans livres dans l'IFC, le DXF et la 3D sur les cinq seeds", () => {
    for (const seed of seedProjects()) {
      const attendu = livredRoofM2(seed);
      if (attendu < 0.05) continue;
      const obtenu = computeQuantities(seed).roofM2;
      assert.ok(
        Math.abs(obtenu - attendu) <= attendu * 0.01,
        `${seed.name} : metre ${obtenu.toFixed(2)} m2 contre pans ${attendu.toFixed(2)} m2`,
      );
    }
  });

  it("suit les pans pour les quatre types de toiture", () => {
    for (const kind of ["flat", "gable", "hip", "shed"] as RoofKind[]) {
      const p = toitSeul(kind, 32);
      const attendu = livredRoofM2(p);
      const obtenu = computeQuantities(p).roofM2;
      assert.ok(
        Math.abs(obtenu - attendu) <= attendu * 0.01,
        `${kind} : metre ${obtenu.toFixed(2)} m2 contre pans ${attendu.toFixed(2)} m2`,
      );
    }
  });

  it("distingue deux pentes differentes", () => {
    const douce = computeQuantities(toitSeul("shed", 25)).roofM2;
    const raide = computeQuantities(toitSeul("shed", 40)).roofM2;
    assert.ok(raide > douce + 1, `25 deg -> ${douce.toFixed(2)} m2, 40 deg -> ${raide.toFixed(2)} m2`);

    const gDouce = computeQuantities(toitSeul("gable", 15)).roofM2;
    const gRaide = computeQuantities(toitSeul("gable", 45)).roofM2;
    assert.ok(gRaide > gDouce + 1);
  });

  it("prend le debord en compte", () => {
    const sans = computeQuantities(toitSeul("gable", 30, 0)).roofM2;
    const avec = computeQuantities(toitSeul("gable", 30, 0.8)).roofM2;
    assert.ok(avec > sans + 1, `sans debord ${sans.toFixed(2)} m2, avec ${avec.toFixed(2)} m2`);
  });
});
