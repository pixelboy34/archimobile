import { wallMid } from "../bim/geometry";
import type { Project } from "../bim/types";

function ent(type: string, pairs: [number, string | number][]): string {
  const lines = ["0", type];
  for (const [c, v] of pairs) {
    lines.push(String(c), String(v));
  }
  return lines.join("\n");
}

export function exportDxf(project: Project): string {
  const ents: string[] = [];
  for (const w of project.walls) {
    ents.push(
      ent("LINE", [
        [8, w.storyId],
        [10, w.a.x],
        [20, w.a.y],
        [30, 0],
        [11, w.b.x],
        [21, w.b.y],
        [31, 0],
      ]),
    );
  }
  for (const c of project.columns) {
    ents.push(
      ent("CIRCLE", [
        [8, c.storyId],
        [10, c.position.x],
        [20, c.position.y],
        [30, 0],
        [40, Math.max(c.width, c.depth) / 2],
      ]),
    );
  }
  for (const r of project.rooms) {
    const n = r.polygon.length;
    const pairs: [number, string | number][] = [
      [8, r.storyId],
      [90, n],
      [70, 1],
    ];
    for (const pt of r.polygon) {
      pairs.push([10, pt.x], [20, pt.y]);
    }
    ents.push(ent("LWPOLYLINE", pairs));
  }
  for (const f of project.furniture) {
    ents.push(
      ent("POINT", [
        [8, "MOB"],
        [10, f.position.x],
        [20, f.position.y],
        [30, 0],
      ]),
    );
  }
  for (const w of project.walls) {
    const m = wallMid(w);
    ents.push(
      ent("TEXT", [
        [8, "COT"],
        [10, m.x],
        [20, m.y],
        [40, 0.18],
        [1, `${Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y).toFixed(2)}`],
      ]),
    );
  }
  return [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$INSUNITS",
    "70",
    "6",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    ents.join("\n"),
    "0",
    "ENDSEC",
    "0",
    "EOF",
  ].join("\n");
}
