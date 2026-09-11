import { polygonArea, wallLength, wallMid } from "../bim/geometry";
import type { Project, Vec2 } from "../bim/types";
import { faceBaseZ, faceFootprint, pointInPolygon, roofFaces } from "./roof-planes";

/** Minimal IFC2X3 CoordinationView subset — walls, slabs (polygon), roofs, stairs, spaces, openings, columns, stories. */
export function exportIfc(project: Project): string {
  const lines: string[] = [];
  let n = 0;
  const id = () => `#${++n}`;
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "''");
  const elevOf = (storyId: string) => project.stories.find((s) => s.id === storyId)?.elevation ?? 0;
  const heightOf = (storyId: string) => project.stories.find((s) => s.id === storyId)?.height ?? 2.8;

  const push = (entity: string) => {
    const r = id();
    lines.push(`${r}=${entity};`);
    return r;
  };

  const app = push(`IFCAPPLICATION($,'1.0','FORMA','FORMA')`);
  const person = push(`IFCPERSON($,$,'FORMA',$,$,$,$,$)`);
  const org = push(`IFCORGANIZATION($,'FORMA',$,$,$)`);
  const personOrg = push(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const owner = push(
    `IFCOWNERHISTORY(${personOrg},${app},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})`,
  );

  const geoCtx = push(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((0.,0.,0.)),$,$),$)`,
  );
  const bodyCtx = push(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${geoCtx},0.01,.MODEL_VIEW.,$)`,
  );

  const unitLen = push(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
  const units = push(`IFCUNITASSIGNMENT((${unitLen}))`);

  const world = push(`IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((0.,0.,0.)),$,$)`);
  const worldPlacement = push(`IFCLOCALPLACEMENT($,${world})`);

  const projectRef = push(
    `IFCPROJECT('${guid(project.id)}',${owner},'${esc(project.name)}',$,$,$,$,(${geoCtx}),${units})`,
  );

  const site = push(
    `IFCSITE('${guid(project.id + "-site")}',${owner},'Site',$,$,${worldPlacement},$,$,.ELEMENT.,(0.,0.),(0.,0.),0.,$,$)`,
  );
  push(`IFCRELAGGREGATES('${guid()}',${owner},$,$,${projectRef},(${site}))`);

  const building = push(
    `IFCBUILDING('${guid(project.id + "-bldg")}',${owner},'${esc(project.name)}',$,$,${worldPlacement},$,$,.ELEMENT.,$,$,$)`,
  );
  push(`IFCRELAGGREGATES('${guid()}',${owner},$,$,${site},(${building}))`);

  const storeyRefs: string[] = [];
  const storeyById: Record<string, string> = {};
  for (const st of project.stories) {
    const origin = push(`IFCCARTESIANPOINT((0.,0.,${num(st.elevation)}))`);
    const axis = push(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
    const place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
    const storey = push(
      `IFCBUILDINGSTOREY('${guid(st.id)}',${owner},'${esc(st.name)}',$,$,${place},$,$,.ELEMENT.,${num(st.elevation)})`,
    );
    storeyById[st.id] = storey;
    storeyRefs.push(storey);
  }
  if (storeyRefs.length) {
    push(`IFCRELAGGREGATES('${guid()}',${owner},$,$,${building},(${storeyRefs.join(",")}))`);
  }

  const productInStorey = new Map<string, string[]>();
  const addToStorey = (storyId: string, prod: string) => {
    const list = productInStorey.get(storyId) ?? [];
    list.push(prod);
    productInStorey.set(storyId, list);
  };

  for (const w of project.walls) {
    const len = wallLength(w);
    if (len < 0.05) continue;
    const mid = wallMid(w);
    const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
    const z0 = elevOf(w.storyId) + (w.baseOffset ?? 0);
    const solid = extrudedBox(push, bodyCtx, len, w.thickness, w.height);
    const origin = push(`IFCCARTESIANPOINT((${num(mid.x)},${num(mid.y)},${num(z0)}))`);
    const zDir = push(`IFCDIRECTION((0.,0.,1.))`);
    const xDir = push(`IFCDIRECTION((${num(Math.cos(ang))},${num(Math.sin(ang))},0.))`);
    const axis = push(`IFCAXIS2PLACEMENT3D(${origin},${zDir},${xDir})`);
    const place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
    const wall = push(
      `IFCWALLSTANDARDCASE('${guid(w.id)}',${owner},'Wall',$,$,${place},${solid},$)`,
    );
    addToStorey(w.storyId, wall);

    for (const o of project.openings.filter((op) => op.wallId === w.id)) {
      const t = o.t;
      const ox = w.a.x + (w.b.x - w.a.x) * t;
      const oy = w.a.y + (w.b.y - w.a.y) * t;
      const oSolid = extrudedBox(push, bodyCtx, o.width, w.thickness + 0.05, o.height);
      const oOrigin = push(
        `IFCCARTESIANPOINT((${num(ox)},${num(oy)},${num(z0 + o.sill)}))`,
      );
      const oAxis = push(`IFCAXIS2PLACEMENT3D(${oOrigin},${zDir},${xDir})`);
      const oPlace = push(`IFCLOCALPLACEMENT(${worldPlacement},${oAxis})`);
      const opening = push(
        `IFCOPENINGELEMENT('${guid(o.id)}',${owner},'${o.kind}',$,$,${oPlace},${oSolid},$)`,
      );
      push(`IFCRELVOIDSELEMENT('${guid()}',${owner},$,$,${wall},${opening})`);
      const fillType = o.kind === "door" ? "IFCDOOR" : "IFCWINDOW";
      const fill = push(
        `${fillType}('${guid(o.id + "-fill")}',${owner},'${o.kind}',$,$,${oPlace},${oSolid},$)`,
      );
      push(`IFCRELFILLSELEMENT('${guid()}',${owner},$,$,${opening},${fill})`);
      addToStorey(w.storyId, fill);
    }
  }

  for (const s of project.slabs) {
    const area = polygonArea(s.polygon);
    if (area < 0.05 || s.polygon.length < 3) continue;
    const z0 = elevOf(s.storyId);
    const solid = extrudedPolygon(push, bodyCtx, s.polygon, s.thickness);
    const origin = push(`IFCCARTESIANPOINT((0.,0.,${num(z0)}))`);
    const axis = push(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
    const place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
    const slab = push(
      `IFCSLAB('${guid(s.id)}',${owner},'Slab',$,$,${place},${solid},$,.FLOOR.)`,
    );
    addToStorey(s.storyId, slab);
  }

  for (const r of project.roofs) {
    if (r.polygon.length < 3 && r.kind !== "multi") continue;
    const story = project.stories.find((s) => s.id === r.storyId);
    const z0 = (story?.elevation ?? 0) + (story?.height ?? 2.8);
    const faces = roofFaces(r, z0);
    // One IFCROOF product per pitch plane — true polygon footprint (not bbox-only).
    for (const f of faces) {
      const footprint = faceFootprint(f);
      if (footprint.length < 3) continue;
      const thick = r.thickness;
      let solid: string;
      let place: string;
      // Cote du plan du pan à un point du plan XY, et enfoncement nécessaire
      // pour qu'une trémie verticale traverse la dalle inclinée.
      let planeZAt: (p: Vec2) => number;
      let pierce: number;

      if (r.kind === "flat") {
        solid = extrudedPolygon(push, bodyCtx, footprint, thick);
        const base = Math.max(z0, faceBaseZ(f) - thick * 0.15);
        const origin = push(`IFCCARTESIANPOINT((0.,0.,${num(base)}))`);
        const axis = push(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
        place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
        planeZAt = () => base;
        pierce = 0;
      } else {
        // Projeter le pan sur XY et le reposer à sa cote moyenne sortait toutes
        // les pentes à plat : les deux versants d'une bicorne se superposaient
        // au même Z, faîtage et égout perdus. Le solide est donc bâti dans le
        // plan du pan, extrudé le long de sa normale.
        const n = faceNormal(f.corners);
        const xDir = eaveDirection(n, f.corners);
        const yDir = cross3(n, xDir);
        const low = lowestCorner(f.corners);
        // Origine sous le pan : le plan du modèle reste la face supérieure, donc
        // le faîtage exporté est exactement celui du modèle.
        const o = {
          x: low.x - n.x * thick,
          y: low.y - n.y * thick,
          z: low.z - n.z * thick,
        };
        const profile: Vec2[] = f.corners.map((c) => {
          const d = { x: c.x - low.x, y: c.y - low.y, z: c.z - low.z };
          return { x: dot3(d, xDir), y: dot3(d, yDir) };
        });
        // La longueur de rampant du profil est l'hypoténuse, pas sa projection.
        solid = extrudedPolygon(push, bodyCtx, profile, thick);
        const origin = push(
          `IFCCARTESIANPOINT((${num(o.x)},${num(o.y)},${num(o.z)}))`,
        );
        const axisDir = push(`IFCDIRECTION((${num(n.x)},${num(n.y)},${num(n.z)}))`);
        const refDir = push(
          `IFCDIRECTION((${num(xDir.x)},${num(xDir.y)},${num(xDir.z)}))`,
        );
        const axis = push(`IFCAXIS2PLACEMENT3D(${origin},${axisDir},${refDir})`);
        place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
        planeZAt = (p) => low.z - (n.x * (p.x - low.x) + n.y * (p.y - low.y)) / n.z;
        pierce = thick / Math.max(0.2, n.z) + 0.1;
      }

      const roof = push(
        `IFCROOF('${guid(f.id)}',${owner},'Roof ${esc(r.kind)}',$,$,${place},${solid},$,.${f.ifcType}.)`,
      );
      addToStorey(r.storyId, roof);

      // Skylight / roof openings: furniture kind skylight inside this face footprint.
      for (const furn of project.furniture) {
        if (furn.storyId !== r.storyId) continue;
        if (furn.kind !== "skylight") continue;
        if (!pointInPolygon(furn.position, footprint)) continue;
        const ow = Math.max(0.4, furn.w);
        const od = Math.max(0.4, furn.d);
        const top = planeZAt(furn.position);
        const oSolid = extrudedBox(push, bodyCtx, ow, od, pierce > 0 ? pierce * 2 : thick + 0.05);
        const oOrigin = push(
          `IFCCARTESIANPOINT((${num(furn.position.x)},${num(furn.position.y)},${num(top - pierce)}))`,
        );
        const oAxis = push(`IFCAXIS2PLACEMENT3D(${oOrigin},$,$)`);
        const oPlace = push(`IFCLOCALPLACEMENT(${worldPlacement},${oAxis})`);
        const opening = push(
          `IFCOPENINGELEMENT('${guid(furn.id + "-roof-open")}',${owner},'skylight',$,$,${oPlace},${oSolid},$)`,
        );
        push(`IFCRELVOIDSELEMENT('${guid()}',${owner},$,$,${roof},${opening})`);
      }
    }
  }

  for (const c of project.columns) {
    const z0 = elevOf(c.storyId);
    const solid = extrudedBox(push, bodyCtx, c.width, c.depth, c.height);
    const origin = push(
      `IFCCARTESIANPOINT((${num(c.position.x)},${num(c.position.y)},${num(z0)}))`,
    );
    const axis = push(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
    const place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
    const col = push(
      `IFCCOLUMN('${guid(c.id)}',${owner},'Column',$,$,${place},${solid},$)`,
    );
    addToStorey(c.storyId, col);
  }

  for (const st of project.stairs) {
    const z0 = elevOf(st.storyId);
    const ang = st.direction;
    const cx = st.origin.x + Math.cos(ang) * (st.run / 2);
    const cy = st.origin.y + Math.sin(ang) * (st.run / 2);
    const solid = extrudedBox(push, bodyCtx, st.run, st.width, Math.max(0.2, st.rise));
    const origin = push(`IFCCARTESIANPOINT((${num(cx)},${num(cy)},${num(z0)}))`);
    const zDir = push(`IFCDIRECTION((0.,0.,1.))`);
    const xDir = push(`IFCDIRECTION((${num(Math.cos(ang))},${num(Math.sin(ang))},0.))`);
    const axis = push(`IFCAXIS2PLACEMENT3D(${origin},${zDir},${xDir})`);
    const place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
    const stair = push(
      `IFCSTAIR('${guid(st.id)}',${owner},'Stair',$,$,${place},${solid},$,.STRAIGHT_RUN_STAIR.)`,
    );
    addToStorey(st.storyId, stair);
  }

  for (const room of project.rooms) {
    if (room.polygon.length < 3) continue;
    const z0 = elevOf(room.storyId);
    const h = room.clearHeight ?? heightOf(room.storyId);
    const solid = extrudedPolygon(push, bodyCtx, room.polygon, h);
    const origin = push(`IFCCARTESIANPOINT((0.,0.,${num(z0)}))`);
    const axis = push(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
    const place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
    const space = push(
      `IFCSPACE('${guid(room.id)}',${owner},'${esc(room.name)}',$,$,${place},${solid},$,.ELEMENT.,.INTERNAL.,$)`,
    );
    addToStorey(room.storyId, space);
  }

  for (const [storyId, prods] of productInStorey) {
    const storey = storeyById[storyId];
    if (!storey || !prods.length) continue;
    push(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',${owner},$,$,(${prods.join(",")}),${storey})`,
    );
  }

  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');",
    `FILE_NAME('${esc(project.name)}.ifc','${new Date().toISOString()}',('FORMA'),('FORMA'),'FORMA IFC subset','FORMA','');`,
    "FILE_SCHEMA(('IFC2X3'));",
    "ENDSEC;",
    "DATA;",
    ...lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
  ].join("\n");
}

function num(v: number): string {
  if (!Number.isFinite(v)) return "0.";
  const s = v.toFixed(6).replace(/\.?0+$/, "");
  return s.includes(".") ? s : `${s}.`;
}

/** Stable-ish IFC GUID from seed, else random. */
function guid(seed?: string): string {
  const hex = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  if (!seed) {
    let s = "";
    for (let i = 0; i < 22; i++) s += hex[(Math.random() * 64) | 0]!;
    return s;
  }
  let h1 = 2166136261;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ (c + i * 13), 2246822519);
  }
  let s = "";
  let a = h1 >>> 0;
  let b = h2 >>> 0;
  for (let i = 0; i < 22; i++) {
    const mix = (a + b * (i + 1)) >>> 0;
    s += hex[mix % 64]!;
    a = Math.imul(a, 1664525) + 1013904223;
    b = Math.imul(b ^ mix, 22695477) + 1;
  }
  return s;
}

type Vec3 = { x: number; y: number; z: number };

const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

function unit3(v: Vec3): Vec3 | null {
  const l = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(l) || l < 1e-9) return null;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Normale du polygone 3D (Newell), toujours orientée vers le haut. */
function faceNormal(corners: Vec3[]): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const n = unit3({ x: nx, y: ny, z: nz });
  if (!n) return { x: 0, y: 0, z: 1 };
  return n.z < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n;
}

/**
 * Axe X local du pan : l'horizontale de son plan, c'est-à-dire la ligne
 * d'égout. IFCAXIS2PLACEMENT3D exige un RefDirection non colinéaire à l'axe,
 * d'où le Gram-Schmidt final — et un repli sur une arête pour un pan plat.
 */
function eaveDirection(n: Vec3, corners: Vec3[]): Vec3 {
  let ref = unit3(cross3({ x: 0, y: 0, z: 1 }, n));
  if (!ref) {
    for (let i = 0; i < corners.length && !ref; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % corners.length]!;
      ref = unit3({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
    }
  }
  if (!ref) ref = { x: 1, y: 0, z: 0 };
  const d = dot3(ref, n);
  return (
    unit3({ x: ref.x - n.x * d, y: ref.y - n.y * d, z: ref.z - n.z * d }) ?? {
      x: 1,
      y: 0,
      z: 0,
    }
  );
}

/** Coin bas du pan — origine du repère local, déterministe en cas d'égalité. */
function lowestCorner(corners: Vec3[]): Vec3 {
  let best = corners[0] ?? { x: 0, y: 0, z: 0 };
  for (const c of corners) {
    if (
      c.z < best.z - 1e-9 ||
      (Math.abs(c.z - best.z) <= 1e-9 &&
        (c.x < best.x - 1e-9 || (Math.abs(c.x - best.x) <= 1e-9 && c.y < best.y - 1e-9)))
    ) {
      best = c;
    }
  }
  return best;
}

function extrudedBox(
  push: (e: string) => string,
  bodyCtx: string,
  dx: number,
  dy: number,
  dz: number,
): string {
  const hx = dx / 2;
  const hy = dy / 2;
  const pts: Vec2[] = [
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy },
  ];
  return extrudedPolygon(push, bodyCtx, pts, dz);
}

function extrudedPolygon(
  push: (e: string) => string,
  bodyCtx: string,
  polygon: Vec2[],
  dz: number,
): string {
  const refs: string[] = [];
  for (const p of polygon) {
    refs.push(push(`IFCCARTESIANPOINT((${num(p.x)},${num(p.y)}))`));
  }
  // Close loop
  refs.push(refs[0]!);
  const poly = push(`IFCPOLYLINE((${refs.join(",")}))`);
  const bound = push(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly})`);
  const pos = push(`IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((0.,0.,0.)),$,$)`);
  const solid = push(
    `IFCEXTRUDEDAREASOLID(${bound},${pos},IFCDIRECTION((0.,0.,1.)),${num(dz)})`,
  );
  const shape = push(`IFCSHAPEREPRESENTATION(${bodyCtx},'Body','SweptSolid',(${solid}))`);
  return push(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shape}))`);
}
