import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { addMultiRoof, emptyProject } from "../bim/builder.ts";
import { rectPolygon } from "../bim/geometry.ts";
import { seedProjects } from "../bim/seed.ts";
import type { Project, Roof, RoofKind } from "../bim/types.ts";
import { exportIfc } from "./ifc.ts";
import { generateMassing } from "./massing.ts";
import { roofFaces, type RoofFace } from "./roof-planes.ts";

/* ------------------------------------------------------------------ */
/* Mini-lecteur STEP : juste assez pour reconstruire des sommets monde  */
/* ------------------------------------------------------------------ */

type V3 = { x: number; y: number; z: number };
type Frame = { o: V3; x: V3; y: V3; z: V3 };
type Ent = { type: string; args: string[] };

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      cur += c;
      if (c === "'") {
        if (s[i + 1] === "'") {
          cur += "'";
          i++;
        } else quoted = false;
      }
      continue;
    }
    if (c === "'") {
      quoted = true;
      cur += c;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim().length) out.push(cur.trim());
  return out;
}

function readEntities(ifc: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of ifc.split("\n")) {
    const line = raw.trim();
    const m = /^(#\d+)=(.+);$/.exec(line);
    if (m) map.set(m[1]!, m[2]!);
  }
  return map;
}

function ent(map: Map<string, string>, ref: string): Ent {
  const expr = ref.startsWith("#") ? map.get(ref) : ref;
  assert.ok(expr, `entité introuvable : ${ref}`);
  const m = /^([A-Z0-9]+)\(([\s\S]*)\)$/.exec(expr);
  assert.ok(m, `entité illisible : ${expr}`);
  return { type: m[1]!, args: splitArgs(m[2]!) };
}

function refsOf(list: string): string[] {
  return splitArgs(list.replace(/^\(/, "").replace(/\)$/, "")).filter((s) => s.length > 0);
}

function tuple(arg: string): number[] {
  return refsOf(arg).map((s) => Number.parseFloat(s));
}

function point(map: Map<string, string>, ref: string): V3 {
  const e = ent(map, ref);
  assert.equal(e.type, "IFCCARTESIANPOINT");
  const v = tuple(e.args[0]!);
  return { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 };
}

function direction(map: Map<string, string>, ref: string): V3 {
  const e = ent(map, ref);
  assert.equal(e.type, "IFCDIRECTION");
  const v = tuple(e.args[0]!);
  return { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 };
}

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
function unit(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z);
  assert.ok(l > 1e-9, "direction nulle dans l'IFC");
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function frameOf(map: Map<string, string>, ref: string): Frame {
  const e = ent(map, ref);
  assert.equal(e.type, "IFCAXIS2PLACEMENT3D");
  const o = point(map, e.args[0]!);
  const z = e.args[1] === "$" ? { x: 0, y: 0, z: 1 } : unit(direction(map, e.args[1]!));
  const raw = e.args[2] === "$" ? { x: 1, y: 0, z: 0 } : unit(direction(map, e.args[2]!));
  const d = dot(raw, z);
  // Le schéma tolère un RefDirection non orthogonal : on refait Gram-Schmidt
  // comme le ferait un viewer, pour lire exactement ce qu'il verrait.
  const x = unit({ x: raw.x - z.x * d, y: raw.y - z.y * d, z: raw.z - z.z * d });
  return { o, x, y: cross(z, x), z };
}

function apply(f: Frame, p: V3): V3 {
  return {
    x: f.o.x + f.x.x * p.x + f.y.x * p.y + f.z.x * p.z,
    y: f.o.y + f.x.y * p.x + f.y.y * p.y + f.z.y * p.z,
    z: f.o.z + f.x.z * p.x + f.y.z * p.y + f.z.z * p.z,
  };
}

function rotate(f: Frame, v: V3): V3 {
  return {
    x: f.x.x * v.x + f.y.x * v.y + f.z.x * v.z,
    y: f.x.y * v.x + f.y.y * v.y + f.z.y * v.z,
    z: f.x.z * v.x + f.y.z * v.y + f.z.z * v.z,
  };
}

function compose(a: Frame, b: Frame): Frame {
  return { o: apply(a, b.o), x: rotate(a, b.x), y: rotate(a, b.y), z: rotate(a, b.z) };
}

function placementOf(map: Map<string, string>, ref: string): Frame {
  const e = ent(map, ref);
  assert.equal(e.type, "IFCLOCALPLACEMENT");
  const local = frameOf(map, e.args[1]!);
  if (e.args[0] === "$") return local;
  return compose(placementOf(map, e.args[0]!), local);
}

type IfcSolid = {
  /** Sommets monde des deux faces du prisme (base + sommet de l'extrusion). */
  verts: V3[];
  /** Normale du plan du profil, en monde. */
  normal: V3;
  /** Origine du placement de l'objet, en monde. */
  origin: V3;
  depth: number;
  /** Direction d'extrusion telle qu'écrite (repère du profil). */
  extrude: V3;
  /** Profil 2D tel qu'écrit, boucle fermée exclue. */
  profile: { x: number; y: number }[];
  name: string;
  predefined: string;
};

function readProduct(map: Map<string, string>, ref: string): IfcSolid {
  const e = ent(map, ref);
  const place = placementOf(map, e.args[5]!);
  const shape = ent(map, e.args[6]!);
  assert.equal(shape.type, "IFCPRODUCTDEFINITIONSHAPE");
  const rep = ent(map, refsOf(shape.args[2]!)[0]!);
  assert.equal(rep.type, "IFCSHAPEREPRESENTATION");
  const solid = ent(map, refsOf(rep.args[3]!)[0]!);
  assert.equal(solid.type, "IFCEXTRUDEDAREASOLID");
  const profileDef = ent(map, solid.args[0]!);
  assert.equal(profileDef.type, "IFCARBITRARYCLOSEDPROFILEDEF");
  const poly = ent(map, profileDef.args[2]!);
  assert.equal(poly.type, "IFCPOLYLINE");
  const ptRefs = refsOf(poly.args[0]!);
  const pos = frameOf(map, solid.args[1]!);
  const extrude = unit(direction(map, solid.args[2]!));
  const depth = Number.parseFloat(solid.args[3]!);
  const full = compose(place, pos);

  const profile: { x: number; y: number }[] = [];
  const verts: V3[] = [];
  // Dernier point = répétition du premier (fermeture de la IFCPOLYLINE).
  for (let i = 0; i < ptRefs.length - 1; i++) {
    const p = point(map, ptRefs[i]!);
    profile.push({ x: p.x, y: p.y });
    const base = { x: p.x, y: p.y, z: 0 };
    verts.push(apply(full, base));
    verts.push(
      apply(full, {
        x: base.x + extrude.x * depth,
        y: base.y + extrude.y * depth,
        z: base.z + extrude.z * depth,
      }),
    );
  }
  return {
    verts,
    normal: full.z,
    origin: place.o,
    depth,
    extrude,
    profile,
    name: (e.args[2] ?? "").replace(/^'|'$/g, ""),
    predefined: (e.args[8] ?? "").replace(/\./g, ""),
  };
}

function productsOfType(map: Map<string, string>, type: string): string[] {
  const out: string[] = [];
  for (const [ref, expr] of map) if (expr.startsWith(`${type}(`)) out.push(ref);
  return out;
}

/* ------------------------------------------------------------------ */
/* Attentes côté modèle                                                */
/* ------------------------------------------------------------------ */

function modelFaces(p: Project): { roof: Roof; face: RoofFace }[] {
  const out: { roof: Roof; face: RoofFace }[] = [];
  for (const r of p.roofs) {
    if (r.polygon.length < 3 && r.kind !== "multi") continue;
    const st = p.stories.find((s) => s.id === r.storyId);
    const z0 = (st?.elevation ?? 0) + (st?.height ?? 2.8);
    for (const f of roofFaces(r, z0)) out.push({ roof: r, face: f });
  }
  return out;
}

const faceEave = (f: RoofFace) => Math.min(...f.corners.map((c) => c.z));
const faceRidge = (f: RoofFace) => Math.max(...f.corners.map((c) => c.z));
const spanZ = (s: IfcSolid) => ({
  min: Math.min(...s.verts.map((v) => v.z)),
  max: Math.max(...s.verts.map((v) => v.z)),
});

const TOL = 0.01;

function massingProject(kind: RoofKind, pitch: number): Project {
  return generateMassing(emptyProject(`Massing ${kind}`), {
    width: 16,
    depth: 11,
    floors: 3,
    floorHeight: 3,
    roofKind: kind,
    roofPitch: pitch,
  });
}

function checkRoofs(label: string, p: Project): void {
  const ifc = exportIfc(p);
  const map = readEntities(ifc);
  const refs = productsOfType(map, "IFCROOF");
  const faces = modelFaces(p);
  assert.equal(refs.length, faces.length, `${label} — nombre d'IFCROOF exportés`);

  for (let i = 0; i < refs.length; i++) {
    const solid = readProduct(map, refs[i]!);
    const { roof, face } = faces[i]!;
    const eave = faceEave(face);
    const ridge = faceRidge(face);
    const z = spanZ(solid);
    const what = `${label} — pan ${face.id} (${roof.kind})`;

    assert.ok(
      z.min <= eave + TOL,
      `${what} : bas du solide ${z.min.toFixed(3)} au-dessus de l'égout ${eave.toFixed(3)}`,
    );
    assert.ok(
      z.max >= ridge - TOL,
      `${what} : haut du solide ${z.max.toFixed(3)} sous le faîtage ${ridge.toFixed(3)}`,
    );
    if (roof.kind !== "flat") {
      assert.ok(
        Math.abs(z.max - ridge) <= TOL,
        `${what} : sommet exporté ${z.max.toFixed(3)} ≠ faîtage modèle ${ridge.toFixed(3)}`,
      );
      assert.ok(
        ridge - eave < TOL || z.max - z.min > ridge - eave - TOL,
        `${what} : pan aplati (dénivelé exporté ${(z.max - z.min).toFixed(3)} pour ${(ridge - eave).toFixed(3)})`,
      );
    }
  }
}

describe("IFC — toitures en pente", () => {
  it("les cinq seeds exportent chaque pan dans son plan", () => {
    for (const p of seedProjects()) checkRoofs(p.name, p);
  });

  it("un volume massing exporte les quatre types de toit en volume", () => {
    const cases: [RoofKind, number][] = [
      ["flat", 2],
      ["gable", 30],
      ["shed", 18],
      ["hip", 26],
    ];
    for (const [kind, pitch] of cases) {
      const p = massingProject(kind, pitch);
      assert.ok(p.roofs.length > 0, `massing ${kind} sans toiture`);
      checkRoofs(`massing ${kind}`, p);
    }
  });

  it("une toiture composée exporte chaque bande dans son plan", () => {
    const base = massingProject("flat", 2);
    const last = base.stories[base.stories.length - 1]!;
    const p = addMultiRoof(
      { ...base, roofs: [] },
      last.id,
      rectPolygon(-0.3, -0.3, 16.6, 11.6),
      [30, 24],
    );
    checkRoofs("multi", p);
  });

  it("les deux pans d'une bicorne ne se superposent plus", () => {
    const p = massingProject("gable", 30);
    const ifc = exportIfc(p);
    const map = readEntities(ifc);
    const refs = productsOfType(map, "IFCROOF");
    assert.equal(refs.length, 2, "une bicorne = deux pans");
    const a = readProduct(map, refs[0]!);
    const b = readProduct(map, refs[1]!);

    // Avant correctif : mêmes profils 2D projetés, même origine, même normale
    // verticale — les deux pans occupaient exactement le même volume.
    assert.ok(
      Math.hypot(a.origin.x - b.origin.x, a.origin.y - b.origin.y, a.origin.z - b.origin.z) > TOL,
      "les deux pans partagent la même origine de placement",
    );
    assert.ok(dot(a.normal, b.normal) < 0.99, "les deux pans partagent la même normale");
    assert.ok(a.normal.z > 0.1 && b.normal.z > 0.1, "normale de pan non orientée vers le haut");
    for (const s of [a, b]) {
      assert.ok(
        Math.abs(s.normal.z) < 0.999,
        "pan exporté horizontal : l'extrusion n'est pas inclinée",
      );
      assert.equal(s.predefined, "GABLE_ROOF");
    }
  });

  it("les toitures plates restent posées à plat (non-régression)", () => {
    const p = massingProject("flat", 2);
    const roof = p.roofs[0]!;
    const st = p.stories.find((s) => s.id === roof.storyId)!;
    const z0 = st.elevation + st.height;
    const ifc = exportIfc(p);
    const map = readEntities(ifc);
    const refs = productsOfType(map, "IFCROOF");
    assert.equal(refs.length, 1);
    const s = readProduct(map, refs[0]!);

    assert.ok(Math.abs(s.normal.z - 1) < 1e-9, "toiture plate : normale non verticale");
    assert.deepEqual(
      s.extrude,
      { x: 0, y: 0, z: 1 },
      "toiture plate : direction d'extrusion modifiée",
    );
    assert.ok(
      Math.abs(s.depth - roof.thickness) < 1e-6,
      `toiture plate : épaisseur ${s.depth} ≠ ${roof.thickness}`,
    );
    assert.ok(
      Math.abs(s.origin.z - (z0 + roof.thickness * 0.85)) < 1e-4,
      `toiture plate : cote de pose ${s.origin.z} déplacée`,
    );
    // Profil resté en coordonnées monde XY, comme avant.
    assert.equal(s.profile.length, roof.polygon.length);
    for (let i = 0; i < roof.polygon.length; i++) {
      assert.ok(Math.abs(s.profile[i]!.x - roof.polygon[i]!.x) < 1e-4);
      assert.ok(Math.abs(s.profile[i]!.y - roof.polygon[i]!.y) < 1e-4);
    }
  });
});
