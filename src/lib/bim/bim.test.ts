import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeProject } from "./analysis.ts";
import { OBJECT_CATALOG, OBJECT_MESH, OBJECT_SIZES, WALL_PRESETS } from "./catalog.ts";
import { furniturePhase, visibleAt } from "./construction.ts";
import {
  dist,
  polygonArea,
  rectPolygon,
  snapVec,
  uniqueWallEdges,
  wallLength,
  wallNormalOffset,
} from "./geometry.ts";
import { MATERIAL_CATALOG, resolveMaterial } from "./materials.ts";
import { computeQuantities, exportBimJson, exportQuantitiesCsv, parseImportedProject } from "./quantities.ts";
import { detectLoops } from "./rooms.ts";
import { analyzeStructure, isBearingWall, markLoadBearing } from "./structure.ts";
import type { FurnitureKind, MaterialId, Project } from "./types.ts";
import { FURNITURE_LABELS, MATERIAL_LABELS } from "./types.ts";

function miniHouse(): Project {
  const now = new Date().toISOString();
  const rdc = { id: "s0", name: "RDC", elevation: 0, height: 2.8 };
  const etage = { id: "s1", name: "Étage", elevation: 2.8, height: 2.6 };
  const poly = rectPolygon(0, 0, 8, 6);
  return {
    id: "p1",
    name: "Test",
    createdAt: now,
    updatedAt: now,
    meta: {
      client: "A",
      location: "Lyon",
      latitude: 45.7,
      longitude: 4.8,
      north: 0,
      brief: "essai",
    },
    stories: [rdc, etage],
    walls: [
      { id: "w1", storyId: "s0", a: { x: 0, y: 0 }, b: { x: 8, y: 0 }, thickness: 0.25, height: 2.8, materialId: "concrete", loadBearing: true, role: "exterior" },
      { id: "w2", storyId: "s0", a: { x: 8, y: 0 }, b: { x: 8, y: 6 }, thickness: 0.25, height: 2.8, materialId: "concrete", loadBearing: true, role: "exterior" },
      { id: "w3", storyId: "s0", a: { x: 8, y: 6 }, b: { x: 0, y: 6 }, thickness: 0.25, height: 2.8, materialId: "concrete", loadBearing: true, role: "exterior" },
      { id: "w4", storyId: "s0", a: { x: 0, y: 6 }, b: { x: 0, y: 0 }, thickness: 0.25, height: 2.8, materialId: "concrete", loadBearing: true, role: "exterior" },
      { id: "w5", storyId: "s0", a: { x: 4, y: 0 }, b: { x: 4, y: 6 }, thickness: 0.07, height: 2.8, materialId: "plaster", partition: true, loadBearing: false, role: "interior" },
      { id: "w6", storyId: "s1", a: { x: 0, y: 0 }, b: { x: 8, y: 0 }, thickness: 0.25, height: 2.6, materialId: "concrete", loadBearing: true, role: "exterior" },
      { id: "w7", storyId: "s1", a: { x: 8, y: 0 }, b: { x: 8, y: 6 }, thickness: 0.25, height: 2.6, materialId: "concrete", loadBearing: true, role: "exterior" },
      { id: "w8", storyId: "s1", a: { x: 8, y: 6 }, b: { x: 0, y: 6 }, thickness: 0.25, height: 2.6, materialId: "concrete", loadBearing: true, role: "exterior" },
      { id: "w9", storyId: "s1", a: { x: 0, y: 6 }, b: { x: 0, y: 0 }, thickness: 0.25, height: 2.6, materialId: "concrete", loadBearing: true, role: "exterior" },
    ],
    openings: [
      { id: "o1", kind: "door", wallId: "w1", t: 0.3, width: 0.9, height: 2.1, sill: 0, materialId: "wood" },
      { id: "o2", kind: "window", wallId: "w3", t: 0.5, width: 1.4, height: 1.35, sill: 0.9, materialId: "glass", glazing: "double" },
    ],
    slabs: [
      { id: "sl1", storyId: "s0", polygon: poly, thickness: 0.2, materialId: "concrete" },
      { id: "sl2", storyId: "s1", polygon: poly, thickness: 0.2, materialId: "concrete" },
    ],
    roofs: [{ id: "rf1", storyId: "s1", polygon: poly, kind: "gable", pitch: 30, overhang: 0.4, thickness: 0.18, materialId: "terracotta" }],
    columns: [{ id: "c1", storyId: "s0", position: { x: 4, y: 3 }, width: 0.3, depth: 0.3, height: 2.8, materialId: "concrete", structural: true }],
    stairs: [{ id: "st1", storyId: "s0", origin: { x: 1, y: 1 }, direction: 0, width: 0.9, run: 3.2, rise: 2.8, steps: 16, railing: true }],
    furniture: [
      { id: "f1", storyId: "s0", kind: "sofa", position: { x: 2, y: 2 }, rotation: 0, w: 2.4, d: 0.9, h: 0.75 },
      { id: "f2", storyId: "s0", kind: "tree", position: { x: 10, y: 1 }, rotation: 0, w: 2, d: 2, h: 4 },
    ],
    rooms: [
      { id: "r1", storyId: "s0", name: "Salon", function: "living", polygon: rectPolygon(0, 0, 4, 6), heated: true, occupancy: 4 },
      { id: "r2", storyId: "s0", name: "Chambre", function: "bedroom", polygon: rectPolygon(4, 0, 4, 6), heated: true, occupancy: 2 },
    ],
  };
}

describe("geometry", () => {
  it("snaps and measures walls", () => {
    assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.deepEqual(snapVec({ x: 0.12, y: 0.38 }), { x: 0, y: 0.5 });
    assert.equal(polygonArea(rectPolygon(0, 0, 4, 5)), 20);
    const wall = miniHouse().walls[0]!;
    assert.equal(wallLength(wall), 8);
    assert.deepEqual(wallNormalOffset({ ...wall, alignment: "center" }), { x: 0, y: 0 });
  });

  it("merges shared room edges", () => {
    const edges = uniqueWallEdges([rectPolygon(0, 0, 4, 6), rectPolygon(4, 0, 4, 6)]);
    assert.equal(edges.length, 7);
  });
});

describe("catalog", () => {
  it("covers every furniture kind and material", () => {
    const kinds = Object.keys(FURNITURE_LABELS) as FurnitureKind[];
    for (const k of kinds) {
      assert.ok(OBJECT_SIZES[k], `size missing ${k}`);
      assert.ok(OBJECT_MESH[k], `mesh missing ${k}`);
    }
    for (const id of Object.keys(MATERIAL_LABELS) as MaterialId[]) {
      assert.ok(MATERIAL_CATALOG[id], `catalog missing ${id}`);
      assert.equal(resolveMaterial(id).color, MATERIAL_CATALOG[id].color);
    }
    assert.equal(OBJECT_CATALOG.length, kinds.length);
    const seen = new Set<string>();
    for (const o of OBJECT_CATALOG) {
      assert.equal(seen.has(o.kind), false, `duplicate ${o.kind}`);
      seen.add(o.kind);
    }
    assert.ok(WALL_PRESETS.length >= 6);
  });
});

describe("rooms", () => {
  it("detects a closed rectangle", () => {
    const loops = detectLoops([
      { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
      { a: { x: 4, y: 0 }, b: { x: 4, y: 3 } },
      { a: { x: 4, y: 3 }, b: { x: 0, y: 3 } },
      { a: { x: 0, y: 3 }, b: { x: 0, y: 0 } },
    ]);
    assert.ok(loops.length >= 1);
    assert.ok(Math.abs(polygonArea(loops[0]!) - 12) < 0.05);
  });
});

describe("quantities and analysis", () => {
  it("prices and scores a house", () => {
    const p = miniHouse();
    const bill = computeQuantities(p);
    assert.ok(bill.totalHT > 1000);
    assert.ok(bill.wallM2 > 10);
    const csv = exportQuantitiesCsv(p);
    assert.match(csv, /Total HT/);
    const json = exportBimJson(p);
    const parsed = parseImportedProject(json) as Project;
    assert.equal(parsed.name, "Test");
    const a = analyzeProject(p);
    assert.ok(a.netArea > 40);
    assert.equal(a.openingCount, 2);
    assert.ok(a.energyScore >= 18);
  });
});

describe("structure", () => {
  it("separates bearing walls from partitions", () => {
    const p = miniHouse();
    assert.equal(isBearingWall(p.walls[0]!), true);
    assert.equal(isBearingWall(p.walls[4]!), false);
    const r = analyzeStructure(p);
    assert.equal(r.system, "murs");
    assert.ok(r.bearingMl > 20);
    assert.ok(r.columns === 1);
    assert.ok(r.score >= 12);
    const glass = markLoadBearing({
      ...p,
      walls: p.walls.map((w, i) => (i === 0 ? { ...w, materialId: "glass" as const, thickness: 0.12, loadBearing: true } : w)),
    });
    assert.equal(isBearingWall(glass.walls[0]!), false);
  });
});

describe("construction phasing", () => {
  it("reveals site objects before interiors", () => {
    assert.equal(furniturePhase({ kind: "tree" } as never), 0);
    assert.equal(furniturePhase({ kind: "sofa" } as never), 7);
    assert.equal(visibleAt(3, 3), true);
    assert.equal(visibleAt(3, 6), false);
  });
});
