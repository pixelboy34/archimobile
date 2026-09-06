import { emptyProject } from "../src/lib/bim/builder.ts";
import { generateMassing, insertBasement } from "../src/lib/cad/massing.ts";
import { computeQuantities } from "../src/lib/bim/quantities.ts";
import { exportDxf } from "../src/lib/cad/dxf.ts";
import { exportIfc } from "../src/lib/cad/ifc.ts";

let p = emptyProject("Tour test A-Z");
p = generateMassing(p, {
  width: 18,
  depth: 14,
  floors: 8,
  floorHeight: 2.8,
  groundHeight: 3.4,
  windowSpacing: 3,
  columns: true,
  roofKind: "flat",
  coreSide: "center",
  balconyDepth: 1.1,
});
p = insertBasement(p);
const gaps = [];
if (p.openings.length === 0) gaps.push("Aucune baie generee");
if (p.columns.length === 0) gaps.push("Aucun poteau");
if (!p.openings.some((o) => o.kind === "window")) gaps.push("Pas de fenetres facade");
if (!p.openings.some((o) => o.kind === "door")) gaps.push("Pas de porte entree");
const stairs = p.stairs.length;
const stories = p.stories.length;
if (stairs < Math.max(1, stories - 2)) gaps.push("Escaliers insuffisants: " + stairs + "/" + stories);
try {
  exportDxf(p);
} catch (e) {
  gaps.push("DXF: " + e.message);
}
try {
  exportIfc(p);
} catch (e) {
  gaps.push("IFC: " + e.message);
}
const bill = computeQuantities(p);
console.log(
  JSON.stringify(
    {
      stories,
      walls: p.walls.length,
      slabs: p.slabs.length,
      openings: p.openings.length,
      windows: p.openings.filter((o) => o.kind === "window").length,
      doors: p.openings.filter((o) => o.kind === "door").length,
      stairs,
      roofs: p.roofs.length,
      cols: p.columns.length,
      rooms: p.rooms.length,
      furniture: p.furniture.length,
      height: p.stories.reduce((h, s) => h + s.height, 0),
      totalHT: bill.totalHT,
      gaps,
    },
    null,
    2,
  ),
);
process.exit(gaps.length ? 1 : 0);
