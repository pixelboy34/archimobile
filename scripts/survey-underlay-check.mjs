#!/usr/bin/env node
/**
 * Smoke: underlay types + pixel→world + edge polyline path (no DOM Image).
 * Run: node scripts/survey-underlay-check.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const jitiFactory = require("jiti");
const jiti = jitiFactory(path.join(root, "scripts/survey-underlay-check.mjs"), {
  interopDefault: true,
  esmResolve: true,
  alias: { "@": path.join(root, "src") },
});

const {
  underlayPixelToWorld,
  defaultUnderlay,
  simplifyPolyline,
  imageDataToGray,
  boxBlur3,
  sobelMagnitude,
  thresholdEdges,
  tracePolylines,
  extractStrokesFromImageData,
} = jiti(path.join(root, "src/lib/bim/survey-underlay.ts"));
const { emptyProject } = jiti(path.join(root, "src/lib/bim/builder.ts"));
const { strokesToWalls } = jiti(path.join(root, "src/lib/bim/survey-to-walls.ts"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ImageData polyfill for node
class FakeImageData {
  constructor(data, w, h) {
    this.data = data;
    this.width = w;
    this.height = h;
  }
}
if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = FakeImageData;
}

const u = defaultUnderlay("st1", "data:image/jpeg;base64,xx", 100, 50);
assert(u.storyId === "st1", "story");
assert(u.opacity > 0 && u.scale > 0, "defaults");

const center = underlayPixelToWorld(u, 50, 25);
assert(Math.abs(center.x - u.offset.x) < 0.01, `center x ${center.x}`);
assert(Math.abs(center.y - u.offset.y) < 0.01, `center y ${center.y}`);

const right = underlayPixelToWorld(u, 100, 25);
assert(right.x > center.x, "right pixel → +x");

// Le sens vertical n'était pas couvert : un calque peint en miroir (ctx.scale(1,-1))
// passait le smoke alors qu'il décalait les traits de 9 à 48 m selon le format.
const topEdge = underlayPixelToWorld(u, u.naturalWidth / 2, 0);
const bottomEdge = underlayPixelToWorld(u, u.naturalWidth / 2, u.naturalHeight);
assert(topEdge.y > bottomEdge.y, `top pixel → +y (haut ${topEdge.y} / bas ${bottomEdge.y})`);

// Oracle fermé du coin haut-gauche : c'est là que drawImage pose le pixel (0,0)
// sans flip. Si la peinture et l'extraction divergent, l'une des deux bouge ici.
const aspect0 = u.naturalHeight / u.naturalWidth;
const corner = underlayPixelToWorld(u, 0, 0);
assert(Math.abs(corner.x - (u.offset.x - u.scale / 2)) < 1e-9, `coin x ${corner.x}`);
assert(
  Math.abs(corner.y - (u.offset.y + (u.scale * aspect0) / 2)) < 1e-9,
  `coin y ${corner.y}`,
);

const simp = simplifyPolyline(
  [
    { x: 0, y: 0 },
    { x: 1, y: 0.01 },
    { x: 2, y: 0 },
    { x: 3, y: 0.01 },
    { x: 4, y: 0 },
  ],
  0.5,
);
assert(simp.length <= 3, `simplified ${simp.length}`);

// Synthetic L-shape edges in 32×32
const W = 32;
const H = 32;
const px = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const on = (y === 8 && x >= 4 && x <= 24) || (x === 24 && y >= 8 && y <= 24);
    const v = on ? 255 : 20;
    const i = (y * W + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
}
const data = new FakeImageData(px, W, H);
const gray = imageDataToGray(data);
assert(gray.length === W * H, "gray len");
const blur = boxBlur3(gray, W, H);
const mag = sobelMagnitude(blur, W, H);
const mask = thresholdEdges(mag, 0.85);
let edges = 0;
for (let i = 0; i < mask.length; i++) if (mask[i]) edges++;
assert(edges > 10, `edges ${edges}`);

const chains = tracePolylines(mask, W, H, 6);
assert(chains.length >= 1, `chains ${chains.length}`);

const underlay = defaultUnderlay("st1", "x", W, H);
underlay.scale = 10;
underlay.offset = { x: 0, y: 0 };
const extracted = extractStrokesFromImageData(data, underlay, { maxDim: 32, minPixelLen: 6 });
assert(extracted.polylines.length >= 1, `polylines ${extracted.polylines.length}`);

// Feed strokes → walls
let p = emptyProject("Underlay");
const sid = p.stories[0].id;
p.surveyUnderlay = { ...underlay, storyId: sid };
p.strokes = extracted.polylines.slice(0, 3).map((points, i) => ({
  id: `sk${i}`,
  layerId: "ly_sketch",
  storyId: sid,
  points,
  width: 0.05,
  color: "#6ed0c3",
}));
const walls = strokesToWalls(p, sid, { clearStrokes: false });
assert(walls.wallCount >= 1, `walls from extract ${walls.wallCount}`);

// underlay must not appear in naive export surface (field ignored by dxf/ifc)
assert(p.surveyUnderlay, "underlay kept on project");
assert(typeof p.surveyUnderlay.src === "string", "src");

console.log(
  `OK survey-underlay-check · edges ${edges} · polylines ${extracted.polylines.length} · murs ${walls.wallCount}`,
);
