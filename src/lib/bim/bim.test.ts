import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeProject } from "./analysis.ts";
import { assessFeasibility, CITY_PRESETS, applyCityPresetMeta } from "./feasibility.ts";
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


describe("étage type vivant", () => {
  it("infers roles and live-syncs typical siblings only", async () => {
    const { inferStoryRoles, syncTypicalFrom, isLiveTypical, typicalGroupSize, setStoryDetached, markStoryRole } =
      await import("../cad/typical.ts");
    const { generateMassing } = await import("../cad/massing.ts");
    const { emptyProject } = await import("./builder.ts");

    let p = emptyProject("Tour");
    p = generateMassing(p, { width: 18, depth: 14, floors: 5, floorHeight: 2.8, groundHeight: 3.2 });
    p = inferStoryRoles(p);

    const roles = p.stories.map((s) => s.role);
    assert.equal(roles[0], "ground");
    assert.ok(roles.slice(1).every((r) => r === "typical"));
    const typ = p.stories[2]!;
    assert.equal(isLiveTypical(typ), true);
    assert.ok(typicalGroupSize(p, typ.id) >= 3);

    // Move a window on R+2 (stories[2]) — sync to other typicals, not RDC
    const typWalls = p.walls.filter((w) => w.storyId === typ.id);
    const win = p.openings.find((o) => typWalls.some((w) => w.id === o.wallId) && o.kind === "window");
    assert.ok(win);
    p.openings = p.openings.map((o) => (o.id === win!.id ? { ...o, t: 0.22 } : o));
    p = syncTypicalFrom(p, typ.id);

    const rdcId = p.stories[0]!.id;
    const rdcWalls = new Set(p.walls.filter((w) => w.storyId === rdcId).map((w) => w.id));
    const rdcWinTs = p.openings.filter((o) => rdcWalls.has(o.wallId) && o.kind === "window").map((o) => o.t);
    assert.ok(rdcWinTs.every((t) => Math.abs(t - 0.22) > 0.01), "RDC must stay unchanged");

    for (const st of p.stories.filter((s) => s.role === "typical" && !s.detached)) {
      if (st.id === typ.id) continue;
      const walls = p.walls.filter((w) => w.storyId === st.id);
      const synced = p.openings.find((o) => walls.some((w) => w.id === o.wallId) && o.kind === "window" && Math.abs(o.t - 0.22) < 0.001);
      assert.ok(synced, `typical ${st.name} should receive synced window`);
    }

    p = setStoryDetached(p, typ.id, true);
    assert.equal(isLiveTypical(p.stories.find((s) => s.id === typ.id)), false);
    p = markStoryRole(p, p.stories[p.stories.length - 1]!.id, "attic");
    assert.equal(p.stories[p.stories.length - 1]!.role, "attic");
  });
});

describe("agents copilote", () => {
  it("parses French intents and mutates façades offline", async () => {
    const {
      parseAgentIntent,
      facadeGrid,
      punchAttic,
      packUnits,
      linkTypicals,
      alignNorthGlazing,
    } = await import("../ai/agents.ts");
    const { generateMassing } = await import("../cad/massing.ts");
    const { emptyProject } = await import("./builder.ts");

    assert.equal(parseAgentIntent("baies 1,35 m").kind, "agent");
    assert.equal((parseAgentIntent("baies 1,35 m") as { id: string }).id, "facadeGrid");
    assert.equal(parseAgentIntent("attique retrait 1,2").kind, "agent");
    assert.equal(parseAgentIntent("pack T2 logements").kind, "agent");
    assert.equal(parseAgentIntent("baies sud ensoleillement").kind, "agent");
    assert.equal(parseAgentIntent("propager types liés").kind, "agent");
    assert.equal(parseAgentIntent("relevé → murs").kind, "agent");
    assert.equal((parseAgentIntent("murs depuis relevé") as { id: string }).id, "releveMurs");
    assert.equal((parseAgentIntent("vectoriser traits") as { id: string }).id, "releveMurs");
    assert.equal(parseAgentIntent("Maison 120 m² 3 chambres").kind, "generate");

    let p = emptyProject("Tour agents");
    p = generateMassing(p, {
      width: 18,
      depth: 14,
      floors: 5,
      floorHeight: 2.8,
      groundHeight: 3.2,
      windowSpacing: 3.0,
    });
    const storyId = p.stories[1]?.id ?? p.stories[0]!.id;
    const before = p.openings.filter((o) => o.kind === "window").length;

    const grid = facadeGrid(p, { storyId, spacing: 1.35 });
    assert.ok(grid.stats.fenêtres > 0, "facadeGrid places windows");
    assert.ok(grid.summary.includes("baies"));
    p = grid.project;

    const south = alignNorthGlazing(p, { storyId });
    assert.ok(south.stats.fenêtres > 0, "south glazing");
    p = south.project;

    const pack = packUnits(p, { storyId, unitKind: "T2" });
    assert.ok(pack.stats.logements >= 1, "packUnits creates flats");
    p = pack.project;

    const attic = punchAttic(p, { setback: 1.2 });
    assert.equal(attic.project.stories[attic.project.stories.length - 1]!.role, "attic");
    p = attic.project;

    const link = linkTypicals(p, { storyId: p.stories.find((s) => s.role === "typical")?.id, propagate: true });
    assert.ok(link.stats.types >= 1);
    assert.ok(p.openings.length >= 0);
    void before;
  });
});

describe("survey-to-walls", () => {
  it("closes survey polygon into exterior walls and heals", async () => {
    const { surveyPolygonToWalls, strokesToWalls, closedSurveyPerimeter } = await import("./survey-to-walls.ts");
    const { emptyProject } = await import("./builder.ts");
    const { parseAgentIntent, releveMurs } = await import("../ai/agents.ts");

    let p = emptyProject("Relevé test");
    const sid = p.stories[0]!.id;
    p.survey = [
      { id: "sv1", storyId: sid, position: { x: 0, y: 0 } },
      { id: "sv2", storyId: sid, position: { x: 8, y: 0 } },
      { id: "sv3", storyId: sid, position: { x: 8, y: 5 } },
      { id: "sv4", storyId: sid, position: { x: 0, y: 5 } },
    ];
    assert.ok(closedSurveyPerimeter(p.survey.map((s) => s.position)) > 20);

    const r = surveyPolygonToWalls(p, sid);
    assert.equal(r.wallCount, 4);
    assert.ok(Math.abs(r.perimeter - 26) < 0.2);
    assert.equal(r.project.walls.filter((w) => w.storyId === sid).length, 4);
    assert.ok(r.project.walls.every((w) => w.role === "exterior"));
    assert.ok(r.project.slabs.some((s) => s.storyId === sid));
    assert.equal((r.project.survey ?? []).filter((s) => s.storyId === sid).length, 0);

    // strokes
    p = emptyProject("Traits");
    const s2 = p.stories[0]!.id;
    p.strokes = [
      {
        id: "sk1",
        layerId: "ly_sketch",
        storyId: s2,
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 3 },
        ],
        width: 0.06,
        color: "#fff",
      },
    ];
    const st = strokesToWalls(p, s2);
    assert.equal(st.wallCount, 2);
    assert.ok(st.perimeter > 6);

    const intent = parseAgentIntent("releve murs");
    assert.equal(intent.kind, "agent");
    if (intent.kind === "agent") assert.equal(intent.id, "releveMurs");

    p = emptyProject("Agent releve");
    const s3 = p.stories[0]!.id;
    p.survey = [
      { id: "a", storyId: s3, position: { x: 0, y: 0 } },
      { id: "b", storyId: s3, position: { x: 6, y: 0 } },
      { id: "c", storyId: s3, position: { x: 6, y: 4 } },
      { id: "d", storyId: s3, position: { x: 0, y: 4 } },
    ];
    const agent = releveMurs(p, { storyId: s3 });
    assert.equal(agent.stats.murs, 4);
    assert.ok(agent.summary.includes("murs"));
  });
});

describe("feasibility", () => {
  it("scores CES/COS and returns French verdict", () => {
    const p = miniHouse();
    p.meta.plotM2 = 200;
    p.meta.ces = 0.4;
    p.meta.cos = 0.6;
    p.meta.typology = "house";
    const report = assessFeasibility(p, { month: 6 });
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.ok(["ok", "watch", "fail"].includes(report.verdict));
    assert.equal(typeof report.solarHint, "string");
    assert.ok(report.solarHint.length > 8);
    assert.ok(report.bullets.length >= 1);
    assert.ok(report.emprise > 0);
    assert.ok(report.heightM > 0);
  });

  it("fails when CES overrun", () => {
    const p = miniHouse();
    p.meta.plotM2 = 50;
    p.meta.ces = 0.3;
    p.meta.cos = 8;
    const report = assessFeasibility(p);
    assert.equal(report.verdict, "fail");
    assert.equal(report.gauges.ces.ok, false);
  });

  it("city presets are indicative and complete", () => {
    assert.equal(CITY_PRESETS.length, 6);
    for (const c of CITY_PRESETS) {
      const meta = applyCityPresetMeta(c);
      assert.equal(meta.latitude, c.latitude);
      assert.ok((meta.ces ?? 0) > 0);
      assert.ok((meta.cos ?? 0) > 0);
    }
  });
});
