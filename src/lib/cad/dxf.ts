import { wallMid } from "../bim/geometry";
import type { Project, Vec2 } from "../bim/types";
import { roofFaces } from "./roof-planes";

function ent(type: string, pairs: [number, string | number][]): string {
  const lines = ["0", type];
  for (const [c, v] of pairs) {
    lines.push(String(c), String(v));
  }
  return lines.join("\n");
}

function sanitizeLayer(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "ETAGE";
}

function elevOf(project: Project, storyId: string): number {
  return project.stories.find((s) => s.id === storyId)?.elevation ?? 0;
}

function layerDef(name: string, color = 7): string {
  return [
    "0",
    "LAYER",
    "2",
    name,
    "70",
    "0",
    "62",
    String(color),
    "6",
    "CONTINUOUS",
  ].join("\n");
}

function lwpoly(layer: string, pts: Vec2[], z: number, closed = true): string {
  const pairs: [number, string | number][] = [
    [8, layer],
    [90, pts.length],
    [70, closed ? 1 : 0],
    [38, z],
  ];
  for (const pt of pts) {
    pairs.push([10, pt.x], [20, pt.y], [30, z]);
  }
  return ent("LWPOLYLINE", pairs);
}

/** Elevated LWPOLYLINE with per-vertex Z (group 30) for pitched roof outlines. */
function lwpoly3d(
  layer: string,
  pts: { x: number; y: number; z: number }[],
  closed = true,
): string {
  const pairs: [number, string | number][] = [
    [8, layer],
    [90, pts.length],
    [70, closed ? 1 : 0],
  ];
  for (const pt of pts) {
    pairs.push([10, pt.x], [20, pt.y], [30, pt.z]);
  }
  return ent("LWPOLYLINE", pairs);
}

/** 3DFACE from 3–4 corners (repeats last if triangle). */
function face3d(
  layer: string,
  c: { x: number; y: number; z: number }[],
): string {
  const a = c[0]!;
  const b = c[1]!;
  const d = c[2]!;
  const e = c[3] ?? c[2]!;
  return ent("3DFACE", [
    [8, layer],
    [10, a.x],
    [20, a.y],
    [30, a.z],
    [11, b.x],
    [21, b.y],
    [31, b.z],
    [12, d.x],
    [22, d.y],
    [32, d.z],
    [13, e.x],
    [23, e.y],
    [33, e.z],
  ]);
}

/**
 * DXF export — TABLES/LAYER + per-story Z (group 30/31).
 * Roofs: A-ROOF-{story} layers, 3DFACE pitch planes + elevated polylines.
 */
export function exportDxf(project: Project, opts?: { plan?: boolean }): string {
  const plan = Boolean(opts?.plan);
  const zOf = (storyId: string) => (plan ? 0 : elevOf(project, storyId));

  const wallLayers = new Map<string, string>();
  const roofLayers = new Map<string, string>();
  for (const st of project.stories) {
    wallLayers.set(st.id, `A-WALL-${sanitizeLayer(st.name)}`);
    roofLayers.set(st.id, `A-ROOF-${sanitizeLayer(st.name)}`);
  }

  const layers = new Set<string>([
    "A-OPEN",
    "A-COL",
    "A-ROOM",
    "A-ROOF",
    "A-FURN",
    "A-DIMS",
    "A-SLAB",
    ...wallLayers.values(),
    ...roofLayers.values(),
  ]);

  const ents: string[] = [];

  for (const w of project.walls) {
    const z = zOf(w.storyId);
    const layer = wallLayers.get(w.storyId) ?? "A-WALL";
    ents.push(
      ent("LINE", [
        [8, layer],
        [10, w.a.x],
        [20, w.a.y],
        [30, z],
        [11, w.b.x],
        [21, w.b.y],
        [31, z],
      ]),
    );
  }

  const wallById = new Map(project.walls.map((w) => [w.id, w]));
  for (const o of project.openings) {
    const w = wallById.get(o.wallId);
    if (!w) continue;
    const z = zOf(w.storyId);
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const half = o.width / 2;
    const depth = Math.max(0.08, w.thickness / 2 + 0.04);
    const mx = w.a.x + dx * o.t;
    const my = w.a.y + dy * o.t;
    const corners: Vec2[] = [
      { x: mx - ux * half - nx * depth, y: my - uy * half - ny * depth },
      { x: mx + ux * half - nx * depth, y: my + uy * half - ny * depth },
      { x: mx + ux * half + nx * depth, y: my + uy * half + ny * depth },
      { x: mx - ux * half + nx * depth, y: my - uy * half + ny * depth },
    ];
    ents.push(lwpoly("A-OPEN", corners, z, true));
  }

  for (const c of project.columns) {
    const z = zOf(c.storyId);
    ents.push(
      ent("CIRCLE", [
        [8, "A-COL"],
        [10, c.position.x],
        [20, c.position.y],
        [30, z],
        [40, Math.max(c.width, c.depth) / 2],
      ]),
    );
  }

  for (const r of project.rooms) {
    if (r.polygon.length < 2) continue;
    ents.push(lwpoly("A-ROOM", r.polygon, zOf(r.storyId), true));
  }

  for (const s of project.slabs) {
    if (s.polygon.length < 2) continue;
    ents.push(lwpoly("A-SLAB", s.polygon, zOf(s.storyId), true));
  }

  for (const r of project.roofs) {
    const story = project.stories.find((st) => st.id === r.storyId);
    const layer = roofLayers.get(r.storyId) ?? "A-ROOF";
    const zBase = plan ? 0 : (story?.elevation ?? 0) + (story?.height ?? 2.8);
    if (plan) {
      if (r.polygon.length >= 2) ents.push(lwpoly(layer, r.polygon, 0, true));
      continue;
    }
    const faces = roofFaces(r, zBase);
    for (const f of faces) {
      if (f.corners.length < 3) continue;
      // Pitch plane as 3DFACE + elevated outline polyline
      ents.push(face3d(layer, f.corners));
      ents.push(lwpoly3d(layer, f.corners, true));
    }
    // Also keep overall footprint on A-ROOF for plan readers
    if (r.polygon.length >= 2) {
      ents.push(lwpoly("A-ROOF", r.polygon, zBase, true));
    }
  }

  for (const f of project.furniture) {
    const z = zOf(f.storyId);
    ents.push(
      ent("POINT", [
        [8, "A-FURN"],
        [10, f.position.x],
        [20, f.position.y],
        [30, z],
      ]),
    );
  }

  for (const w of project.walls) {
    const m = wallMid(w);
    const z = zOf(w.storyId);
    ents.push(
      ent("TEXT", [
        [8, "A-DIMS"],
        [10, m.x],
        [20, m.y],
        [30, z],
        [40, 0.18],
        [1, `${Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y).toFixed(2)}`],
      ]),
    );
  }

  const layerTable = ["0", "TABLE", "2", "LAYER", "70", String(layers.size)];
  const colors: Record<string, number> = {
    "A-OPEN": 3,
    "A-COL": 5,
    "A-ROOM": 4,
    "A-ROOF": 1,
    "A-FURN": 6,
    "A-DIMS": 2,
    "A-SLAB": 8,
  };
  let i = 0;
  for (const name of layers) {
    const color = name.startsWith("A-ROOF-")
      ? 1
      : name.startsWith("A-WALL-")
        ? 7
        : (colors[name] ?? 7 + (i % 5));
    layerTable.push(layerDef(name, color));
    i++;
  }
  layerTable.push("0", "ENDTAB");

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
    "TABLES",
    layerTable.join("\n"),
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
