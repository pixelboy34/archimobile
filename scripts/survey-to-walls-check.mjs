#!/usr/bin/env node
/**
 * Smoke check: survey/strokes → murs BIM + intent keywords.
 * Run: node scripts/survey-to-walls-check.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const jitiFactory = require("jiti");
const jiti = jitiFactory(path.join(root, "scripts/survey-to-walls-check.mjs"), {
  interopDefault: true,
  esmResolve: true,
  alias: {
    "@": path.join(root, "src"),
  },
});

const { emptyProject } = jiti(path.join(root, "src/lib/bim/builder.ts"));
const { surveyPolygonToWalls, strokesToWalls, closedSurveyPerimeter } = jiti(
  path.join(root, "src/lib/bim/survey-to-walls.ts"),
);
const { parseAgentIntent, releveMurs } = jiti(path.join(root, "src/lib/ai/agents.ts"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let p = emptyProject("Relevé check");
const sid = p.stories[0].id;
p.survey = [
  { id: "sv1", storyId: sid, position: { x: 0, y: 0 } },
  { id: "sv2", storyId: sid, position: { x: 8, y: 0 } },
  { id: "sv3", storyId: sid, position: { x: 8, y: 5 } },
  { id: "sv4", storyId: sid, position: { x: 0, y: 5 } },
];
assert(closedSurveyPerimeter(p.survey.map((s) => s.position)) > 20, "perimeter");
const r = surveyPolygonToWalls(p, sid);
assert(r.wallCount === 4, `expected 4 walls, got ${r.wallCount}`);
assert(Math.abs(r.perimeter - 26) < 0.2, `perimeter ${r.perimeter}`);
assert(r.project.walls.every((w) => w.role === "exterior"), "exterior role");
assert((r.project.survey ?? []).filter((s) => s.storyId === sid).length === 0, "survey cleared");

p = emptyProject("Traits");
const s2 = p.stories[0].id;
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
assert(st.wallCount === 2, `strokes walls ${st.wallCount}`);

const intent = parseAgentIntent("murs depuis relevé");
assert(intent.kind === "agent", "intent releve");
assert(intent.id === "releveMurs", "id releve");
assert(parseAgentIntent("vectoriser").id === "releveMurs", "vectoriser");

p = emptyProject("Agent");
const s3 = p.stories[0].id;
p.survey = [
  { id: "a", storyId: s3, position: { x: 0, y: 0 } },
  { id: "b", storyId: s3, position: { x: 6, y: 0 } },
  { id: "c", storyId: s3, position: { x: 6, y: 4 } },
  { id: "d", storyId: s3, position: { x: 0, y: 4 } },
];
const agent = releveMurs(p, { storyId: s3 });
assert(agent.stats.murs === 4, `agent murs ${agent.stats.murs}`);
assert(agent.summary.includes("murs"), "summary");

console.log("OK survey-to-walls-check · 4 murs · intents · agent");
