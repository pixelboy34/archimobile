import { boundsOf } from "../bim/geometry";
import type { Roof, Vec2 } from "../bim/types";

/** One planar roof face with 3D corners (x/y plan, z elev). */
export type RoofFace = {
  id: string;
  corners: { x: number; y: number; z: number }[];
  pitch: number;
  /** IFC PredefinedType fragment without dots */
  ifcType: "FLAT_ROOF" | "GABLE_ROOF" | "HIP_ROOF" | "SHED_ROOF" | "NOTDEFINED";
};

function expandRect(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  o: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  return { minX: minX - o, minY: minY - o, maxX: maxX + o, maxY: maxY + o };
}

function face(
  id: string,
  pts: { x: number; y: number; z: number }[],
  pitch: number,
  ifcType: RoofFace["ifcType"],
): RoofFace {
  return { id, corners: pts, pitch, ifcType };
}

/** Horizontal footprint of a face (XY), for IFC ArbitraryClosedProfileDef. */
export function faceFootprint(f: RoofFace): Vec2[] {
  return f.corners.map((c) => ({ x: c.x, y: c.y }));
}

/** Mean Z of face corners. */
export function faceBaseZ(f: RoofFace): number {
  if (!f.corners.length) return 0;
  return f.corners.reduce((s, c) => s + c.z, 0) / f.corners.length;
}

/**
 * Decompose a Roof into planar pitch faces with true 3D corners.
 * Used by IFC (per-plane IFCROOF + polygon profile), DXF (3DFACE / elevated poly),
 * and optional multi-pitch viz.
 */
export function roofFaces(roof: Roof, baseZ: number): RoofFace[] {
  const b = boundsOf(roof.polygon);
  const o = roof.overhang ?? 0;
  const r = expandRect(b.min.x, b.min.y, b.max.x, b.max.y, o);
  const w = r.maxX - r.minX;
  const d = r.maxY - r.minY;
  const alongX = w >= d;
  const pitchRad = (roof.pitch * Math.PI) / 180;
  const halfSpan = (alongX ? d : w) / 2;
  const rise = Math.tan(pitchRad) * halfSpan;
  const z0 = baseZ;
  const ridgeZ = z0 + Math.max(roof.thickness, rise);

  if (roof.kind === "flat") {
    const z = z0 + roof.thickness;
    const poly =
      roof.polygon.length >= 3
        ? roof.polygon.map((p) => ({ x: p.x, y: p.y, z }))
        : [
            { x: r.minX, y: r.minY, z },
            { x: r.maxX, y: r.minY, z },
            { x: r.maxX, y: r.maxY, z },
            { x: r.minX, y: r.maxY, z },
          ];
    return [face(`${roof.id}-f0`, poly, roof.pitch, "FLAT_ROOF")];
  }

  if (roof.kind === "shed") {
    const zLow = z0 + roof.thickness;
    const zHigh = z0 + Math.max(roof.thickness, Math.tan(pitchRad) * (alongX ? d : w));
    const pts = alongX
      ? [
          { x: r.minX, y: r.minY, z: zLow },
          { x: r.maxX, y: r.minY, z: zLow },
          { x: r.maxX, y: r.maxY, z: zHigh },
          { x: r.minX, y: r.maxY, z: zHigh },
        ]
      : [
          { x: r.minX, y: r.minY, z: zLow },
          { x: r.maxX, y: r.minY, z: zHigh },
          { x: r.maxX, y: r.maxY, z: zHigh },
          { x: r.minX, y: r.maxY, z: zLow },
        ];
    return [face(`${roof.id}-f0`, pts, roof.pitch, "SHED_ROOF")];
  }

  if (roof.kind === "gable") {
    const mid = alongX ? (r.minY + r.maxY) / 2 : (r.minX + r.maxX) / 2;
    if (alongX) {
      return [
        face(
          `${roof.id}-a`,
          [
            { x: r.minX, y: r.minY, z: z0 + roof.thickness },
            { x: r.maxX, y: r.minY, z: z0 + roof.thickness },
            { x: r.maxX, y: mid, z: ridgeZ },
            { x: r.minX, y: mid, z: ridgeZ },
          ],
          roof.pitch,
          "GABLE_ROOF",
        ),
        face(
          `${roof.id}-b`,
          [
            { x: r.minX, y: mid, z: ridgeZ },
            { x: r.maxX, y: mid, z: ridgeZ },
            { x: r.maxX, y: r.maxY, z: z0 + roof.thickness },
            { x: r.minX, y: r.maxY, z: z0 + roof.thickness },
          ],
          roof.pitch,
          "GABLE_ROOF",
        ),
      ];
    }
    return [
      face(
        `${roof.id}-a`,
        [
          { x: r.minX, y: r.minY, z: z0 + roof.thickness },
          { x: mid, y: r.minY, z: ridgeZ },
          { x: mid, y: r.maxY, z: ridgeZ },
          { x: r.minX, y: r.maxY, z: z0 + roof.thickness },
        ],
        roof.pitch,
        "GABLE_ROOF",
      ),
      face(
        `${roof.id}-b`,
        [
          { x: mid, y: r.minY, z: ridgeZ },
          { x: r.maxX, y: r.minY, z: z0 + roof.thickness },
          { x: r.maxX, y: r.maxY, z: z0 + roof.thickness },
          { x: mid, y: r.maxY, z: ridgeZ },
        ],
        roof.pitch,
        "GABLE_ROOF",
      ),
    ];
  }

  if (roof.kind === "hip") {
    const inset = Math.min(w, d) * 0.22;
    const ix0 = r.minX + inset;
    const ix1 = r.maxX - inset;
    const iy0 = r.minY + inset;
    const iy1 = r.maxY - inset;
    const ez = z0 + roof.thickness;
    const faces: RoofFace[] = [
      face(
        `${roof.id}-n`,
        [
          { x: r.minX, y: r.minY, z: ez },
          { x: r.maxX, y: r.minY, z: ez },
          { x: ix1, y: iy0, z: ridgeZ },
          { x: ix0, y: iy0, z: ridgeZ },
        ],
        roof.pitch,
        "HIP_ROOF",
      ),
      face(
        `${roof.id}-s`,
        [
          { x: r.minX, y: r.maxY, z: ez },
          { x: ix0, y: iy1, z: ridgeZ },
          { x: ix1, y: iy1, z: ridgeZ },
          { x: r.maxX, y: r.maxY, z: ez },
        ],
        roof.pitch,
        "HIP_ROOF",
      ),
      face(
        `${roof.id}-w`,
        [
          { x: r.minX, y: r.minY, z: ez },
          { x: ix0, y: iy0, z: ridgeZ },
          { x: ix0, y: iy1, z: ridgeZ },
          { x: r.minX, y: r.maxY, z: ez },
        ],
        roof.pitch,
        "HIP_ROOF",
      ),
      face(
        `${roof.id}-e`,
        [
          { x: r.maxX, y: r.minY, z: ez },
          { x: r.maxX, y: r.maxY, z: ez },
          { x: ix1, y: iy1, z: ridgeZ },
          { x: ix1, y: iy0, z: ridgeZ },
        ],
        roof.pitch,
        "HIP_ROOF",
      ),
    ];
    return faces;
  }

  // multi: compound — alternating shed strips (or two gables) from pitches[]
  const pitches =
    roof.pitches && roof.pitches.length >= 2
      ? roof.pitches
      : [roof.pitch, roof.pitch];
  const n = Math.max(2, pitches.length);
  const out: RoofFace[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const pDeg = pitches[i] ?? roof.pitch;
    const pRad = (pDeg * Math.PI) / 180;
    if (alongX) {
      const y0 = r.minY + d * t0;
      const y1 = r.minY + d * t1;
      const span = y1 - y0;
      const localRise = Math.tan(pRad) * (span / 2);
      const zEave = z0 + roof.thickness;
      const zRidge = z0 + Math.max(roof.thickness, localRise);
      const ym = (y0 + y1) / 2;
      // mini-gable strip
      out.push(
        face(
          `${roof.id}-m${i}a`,
          [
            { x: r.minX, y: y0, z: zEave },
            { x: r.maxX, y: y0, z: zEave },
            { x: r.maxX, y: ym, z: zRidge },
            { x: r.minX, y: ym, z: zRidge },
          ],
          pDeg,
          "GABLE_ROOF",
        ),
        face(
          `${roof.id}-m${i}b`,
          [
            { x: r.minX, y: ym, z: zRidge },
            { x: r.maxX, y: ym, z: zRidge },
            { x: r.maxX, y: y1, z: zEave },
            { x: r.minX, y: y1, z: zEave },
          ],
          pDeg,
          "GABLE_ROOF",
        ),
      );
    } else {
      const x0 = r.minX + w * t0;
      const x1 = r.minX + w * t1;
      const span = x1 - x0;
      const localRise = Math.tan(pRad) * (span / 2);
      const zEave = z0 + roof.thickness;
      const zRidge = z0 + Math.max(roof.thickness, localRise);
      const xm = (x0 + x1) / 2;
      out.push(
        face(
          `${roof.id}-m${i}a`,
          [
            { x: x0, y: r.minY, z: zEave },
            { x: xm, y: r.minY, z: zRidge },
            { x: xm, y: r.maxY, z: zRidge },
            { x: x0, y: r.maxY, z: zEave },
          ],
          pDeg,
          "GABLE_ROOF",
        ),
        face(
          `${roof.id}-m${i}b`,
          [
            { x: xm, y: r.minY, z: zRidge },
            { x: x1, y: r.minY, z: zEave },
            { x: x1, y: r.maxY, z: zEave },
            { x: xm, y: r.maxY, z: zRidge },
          ],
          pDeg,
          "GABLE_ROOF",
        ),
      );
    }
  }
  return out;
}

/** Point-in-polygon (ray cast) for skylight / opening tests. */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersect =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-12) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}
