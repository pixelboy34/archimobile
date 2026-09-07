/**
 * Smoke: massing 8 floors → IFC has IFCROOF + IFCSPACE + polygon slab;
 * DXF has LAYER table + multiple Z values.
 */
import { createServer } from "vite";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const { emptyProject } = await server.ssrLoadModule("/src/lib/bim/builder.ts");
  const { generateMassing } = await server.ssrLoadModule("/src/lib/cad/massing.ts");
  const { exportIfc } = await server.ssrLoadModule("/src/lib/cad/ifc.ts");
  const { exportDxf } = await server.ssrLoadModule("/src/lib/cad/dxf.ts");
  const { tallBoost, detectQuality } = await server.ssrLoadModule("/src/lib/render/quality.ts");

  let p = emptyProject("Tour-CAD");
  p = generateMassing(p, {
    width: 16,
    depth: 12,
    floors: 8,
    floorHeight: 2.8,
    groundHeight: 3.2,
    roofKind: "flat",
  });

  assert.ok(p.stories.length >= 8, `expected ≥8 stories, got ${p.stories.length}`);
  assert.ok(p.slabs.length > 0, "need slabs");
  assert.ok(p.roofs.length > 0, "need roofs");
  assert.ok(p.rooms.length > 0, "need rooms");

  const ifc = exportIfc(p);
  assert.match(ifc, /IFCROOF/, "IFC should contain IFCROOF");
  assert.match(ifc, /IFCSPACE/, "IFC should contain IFCSPACE");
  assert.match(ifc, /IFCARBITRARYCLOSEDPROFILEDEF/, "slab/space should use arbitrary profile");
  assert.match(ifc, /IFCSLAB/, "IFC should keep slabs");
  assert.match(ifc, /IFCSTAIR|IFCWALLSTANDARDCASE/, "walls/stairs present");

  // Polygon slab: profile should include more than a fake square — polyline with real coords
  const slab = p.slabs[0];
  assert.ok(slab.polygon.length >= 3);
  const px = slab.polygon[0].x.toFixed(1);
  assert.ok(ifc.includes(px) || ifc.includes(slab.polygon[0].x.toFixed(6).replace(/\.?0+$/, "")), "slab polygon coords in IFC");

  const dxf = exportDxf(p);
  assert.match(dxf, /TABLE[\s\S]*LAYER/, "DXF should have LAYER table");
  assert.match(dxf, /A-WALL-/, "DXF wall layers");
  assert.match(dxf, /A-OPEN/, "DXF openings layer");
  assert.match(dxf, /A-ROOF/, "DXF roof layer");
  assert.match(dxf, /A-SLAB|A-ROOM/, "DXF slab/room layer");

  // Multiple Z values across stories (group 30)
  const zs = new Set();
  const lines = dxf.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === "30" || lines[i] === "31" || lines[i] === "38") {
      zs.add(lines[i + 1]);
    }
  }
  assert.ok(zs.size >= 2, `expected multiple Z values, got ${[...zs].join(",")}`);

  const q = tallBoost(detectQuality(), 8);
  assert.equal(q.simpleProps, true);
  assert.ok(q.shadowMap <= 1024);
  const villa = tallBoost(detectQuality(), 2);
  assert.equal(villa.simpleProps, false, "villas must keep full quality");

  console.log(
    "cad-export-check: OK —",
    `stories=${p.stories.length}`,
    `IFCROOF+IFCSPACE+profile`,
    `DXF layers + Z×${zs.size}`,
    `tallBoost(8).shadowMap=${q.shadowMap}`,
  );
} finally {
  await server.close();
}
