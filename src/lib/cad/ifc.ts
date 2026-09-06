import { polygonArea, wallLength, wallMid } from "../bim/geometry";
import type { Project } from "../bim/types";

/** Minimal IFC2X3 CoordinationView subset for walls, slabs, openings, columns, stories. */
export function exportIfc(project: Project): string {
  const lines: string[] = [];
  let n = 0;
  const id = () => `#${++n}`;
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "''");
  const elevOf = (storyId: string) => project.stories.find((s) => s.id === storyId)?.elevation ?? 0;

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
    `IFCPROJECT('${guid()}',${owner},'${esc(project.name)}',$,$,$,$,(${geoCtx}),${units})`,
  );

  const site = push(
    `IFCSITE('${guid()}',${owner},'Site',$,$,${worldPlacement},$,$,.ELEMENT.,(0.,0.),(0.,0.),0.,$,$)`,
  );
  push(`IFCRELAGGREGATES('${guid()}',${owner},$,$,${projectRef},(${site}))`);

  const building = push(
    `IFCBUILDING('${guid()}',${owner},'${esc(project.name)}',$,$,${worldPlacement},$,$,.ELEMENT.,$,$,$)`,
  );
  push(`IFCRELAGGREGATES('${guid()}',${owner},$,$,${site},(${building}))`);

  const storeyRefs: string[] = [];
  const storeyById: Record<string, string> = {};
  for (const st of project.stories) {
    const origin = push(`IFCCARTESIANPOINT((0.,0.,${num(st.elevation)}))`);
    const axis = push(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
    const place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
    const storey = push(
      `IFCBUILDINGSTOREY('${guid()}',${owner},'${esc(st.name)}',$,$,${place},$,$,.ELEMENT.,${num(st.elevation)})`,
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
      `IFCWALLSTANDARDCASE('${guid()}',${owner},'Wall',$,$,${place},${solid},$)`,
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
        `IFCOPENINGELEMENT('${guid()}',${owner},'${o.kind}',$,$,${oPlace},${oSolid},$)`,
      );
      push(`IFCRELVOIDSELEMENT('${guid()}',${owner},$,$,${wall},${opening})`);
      const fillType = o.kind === "door" ? "IFCDOOR" : "IFCWINDOW";
      const fill = push(
        `${fillType}('${guid()}',${owner},'${o.kind}',$,$,${oPlace},${oSolid},$)`,
      );
      push(`IFCRELFILLSELEMENT('${guid()}',${owner},$,$,${opening},${fill})`);
      addToStorey(w.storyId, fill);
    }
  }

  for (const s of project.slabs) {
    const area = polygonArea(s.polygon);
    if (area < 0.05) continue;
    const cx = s.polygon.reduce((a, p) => a + p.x, 0) / s.polygon.length;
    const cy = s.polygon.reduce((a, p) => a + p.y, 0) / s.polygon.length;
    const side = Math.sqrt(Math.max(area, 0.01));
    const z0 = elevOf(s.storyId);
    const solid = extrudedBox(push, bodyCtx, side, side, s.thickness);
    const origin = push(`IFCCARTESIANPOINT((${num(cx)},${num(cy)},${num(z0)}))`);
    const axis = push(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
    const place = push(`IFCLOCALPLACEMENT(${worldPlacement},${axis})`);
    const slab = push(
      `IFCSLAB('${guid()}',${owner},'Slab',$,$,${place},${solid},$,.FLOOR.)`,
    );
    addToStorey(s.storyId, slab);
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
      `IFCCOLUMN('${guid()}',${owner},'Column',$,$,${place},${solid},$)`,
    );
    addToStorey(c.storyId, col);
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

function guid(): string {
  const hex = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  let s = "";
  for (let i = 0; i < 22; i++) s += hex[(Math.random() * 64) | 0]!;
  return s;
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
  const p1 = push(`IFCCARTESIANPOINT((${num(-hx)},${num(-hy)}))`);
  const p2 = push(`IFCCARTESIANPOINT((${num(hx)},${num(-hy)}))`);
  const p3 = push(`IFCCARTESIANPOINT((${num(hx)},${num(hy)}))`);
  const p4 = push(`IFCCARTESIANPOINT((${num(-hx)},${num(hy)}))`);
  const poly = push(`IFCPOLYLINE((${p1},${p2},${p3},${p4},${p1}))`);
  const bound = push(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly})`);
  const pos = push(`IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT((0.,0.,0.)),$,$)`);
  const solid = push(
    `IFCEXTRUDEDAREASOLID(${bound},${pos},IFCDIRECTION((0.,0.,1.)),${num(dz)})`,
  );
  const shape = push(`IFCSHAPEREPRESENTATION(${bodyCtx},'Body','SweptSolid',(${solid}))`);
  return push(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shape}))`);
}
