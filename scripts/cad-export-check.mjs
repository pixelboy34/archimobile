/**
 * Smoke: massing 8 floors → IFC has IFCROOF + IFCSPACE + polygon slab;
 * DXF has LAYER table + multiple Z values;
 * gable/multi roofs → multiple IFCROOF + DXF 3DFACE + A-ROOF-{story};
 * tallBoost ≥40 aggression (storyWindow 0, mergeFarWalls).
 */
import { createServer } from "vite";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// fileURLToPath, et non .pathname : sous Windows .pathname vaut "/C:/..." et Vite le
// prend pour un chemin relatif, d'ou un mkdir "C:\C:\Users\..." qui echoue.
const root = fileURLToPath(new URL("..", import.meta.url));

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
  const { roofFaces } = await server.ssrLoadModule("/src/lib/cad/roof-planes.ts");

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
  assert.match(ifc, /\.FLAT_ROOF\./, "flat roof PredefinedType");

  const slab = p.slabs[0];
  assert.ok(slab.polygon.length >= 3);
  const px = slab.polygon[0].x.toFixed(1);
  assert.ok(
    ifc.includes(px) || ifc.includes(slab.polygon[0].x.toFixed(6).replace(/\.?0+$/, "")),
    "slab polygon coords in IFC",
  );

  const dxf = exportDxf(p);
  assert.match(dxf, /TABLE[\s\S]*LAYER/, "DXF should have LAYER table");
  assert.match(dxf, /A-WALL-/, "DXF wall layers");
  assert.match(dxf, /A-OPEN/, "DXF openings layer");
  assert.match(dxf, /A-ROOF/, "DXF roof layer");
  assert.match(dxf, /A-ROOF-/, "DXF per-story roof layer A-ROOF-{story}");
  assert.match(dxf, /A-SLAB|A-ROOM/, "DXF slab/room layer");

  const zs = new Set();
  const lines = dxf.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === "30" || lines[i] === "31" || lines[i] === "38") {
      zs.add(lines[i + 1]);
    }
  }
  assert.ok(zs.size >= 2, `expected multiple Z values, got ${[...zs].join(",")}`);

  // --- Gable roof: multiple IFCROOF planes + 3DFACE ---
  let gable = emptyProject("Gable-CAD");
  gable = generateMassing(gable, {
    width: 14,
    depth: 10,
    floors: 2,
    floorHeight: 2.8,
    roofKind: "gable",
    roofPitch: 30,
  });
  assert.ok(gable.roofs.some((r) => r.kind === "gable"), "gable roof present");
  const gableIfc = exportIfc(gable);
  const gableRoofCount = (gableIfc.match(/IFCROOF\(/g) || []).length;
  assert.ok(gableRoofCount >= 2, `gable should emit ≥2 IFCROOF planes, got ${gableRoofCount}`);
  assert.match(gableIfc, /\.GABLE_ROOF\./, "GABLE_ROOF type");
  const gableDxf = exportDxf(gable);
  assert.match(gableDxf, /3DFACE/, "DXF 3DFACE for pitched roof planes");
  const story = gable.stories.find((s) => gable.roofs[0]?.storyId === s.id);
  const z0 = (story?.elevation ?? 0) + (story?.height ?? 2.8);
  const faces = roofFaces(gable.roofs[0], z0);
  assert.ok(faces.length >= 2, `roofFaces(gable) ≥2, got ${faces.length}`);

  // --- Multi roof ---
  let multi = emptyProject("Multi-CAD");
  multi = generateMassing(multi, {
    width: 16,
    depth: 12,
    floors: 1,
    floorHeight: 3,
    roofKind: "multi",
    roofPitch: 28,
  });
  assert.ok(multi.roofs.some((r) => r.kind === "multi"), "multi roof present");
  const multiIfc = exportIfc(multi);
  const multiCount = (multiIfc.match(/IFCROOF\(/g) || []).length;
  assert.ok(multiCount >= 2, `multi should emit ≥2 IFCROOF, got ${multiCount}`);
  const multiDxf = exportDxf(multi);
  assert.match(multiDxf, /3DFACE/, "multi DXF 3DFACE");
  assert.match(multiDxf, /A-ROOF-/, "multi A-ROOF-story layer");

  // --- tallBoost thresholds ---
  const q8 = tallBoost(detectQuality(), 8);
  // Cette assertion figeait « simpleProps = true des 8 etages », c'est-a-dire la
  // regression elle-meme : sur Tour Horizon, le seed vitrine, les meubles
  // composes redevenaient des boites, contre le §5 qui exige « simpleProps:
  // false toujours ». La mesure a tranche — un R+40 coute 296 appels de dessin
  // par image, exactement comme un R+8, parce que la fenetre d'etages borne
  // deja le cout : rien ne justifiait de degrader les meubles.
  assert.equal(q8.simpleProps, false, "les meubles composes restent composes (§5)");
  assert.ok(q8.shadowMap <= 1024);
  const villa = tallBoost(detectQuality(), 2);
  assert.equal(villa.simpleProps, false, "villas must keep full quality");
  assert.equal(villa.mergeFarWalls, false);

  const q16 = tallBoost(detectQuality(), 16);
  assert.equal(q16.storyWindow, 1);
  assert.equal(q16.interiorLightRadius, 0);

  const q24 = tallBoost(detectQuality(), 24);
  assert.ok(q24.mergeFarWalls, "≥24 mergeFarWalls");
  assert.ok(q24.instanceFarColumns, "≥24 instanceFarColumns");
  assert.ok(q24.shellBand <= 1);

  const q40 = tallBoost(detectQuality(), 40);
  assert.equal(q40.storyWindow, 0, "R+40 active-only full detail");
  assert.equal(q40.shellBand, 0, "R+40 no shell band — massing beyond active");
  assert.equal(q40.interiorLightRadius, 0);
  assert.ok(q40.mergeFarWalls);
  assert.ok(q40.instanceFarColumns);
  assert.equal(q40.labels, false);
  assert.ok(q40.interiorLights <= 1);
  // Must not force global shadows off
  assert.equal(q40.shadows, detectQuality().shadows);

  console.log(
    "cad-export-check: OK —",
    `stories=${p.stories.length}`,
    `IFCROOF+IFCSPACE+profile`,
    `gablePlanes=${gableRoofCount}`,
    `multiPlanes=${multiCount}`,
    `DXF 3DFACE + A-ROOF-story + Z×${zs.size}`,
    `tallBoost(40).storyWindow=${q40.storyWindow}`,
  );
} finally {
  await server.close();
}
