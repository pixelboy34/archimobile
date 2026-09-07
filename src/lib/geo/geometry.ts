/** WGS84 helpers for cadastre polygons (équirectangulaire locale). */

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LON_EQ = 111_320;

export function lonLatToLocalM(
  lon: number,
  lat: number,
  originLon: number,
  originLat: number,
): [number, number] {
  const cos = Math.cos((originLat * Math.PI) / 180);
  const x = (lon - originLon) * M_PER_DEG_LON_EQ * cos;
  const y = (lat - originLat) * M_PER_DEG_LAT;
  return [x, y];
}

export function ringCentroidLonLat(ring: [number, number][]): { lon: number; lat: number } {
  if (ring.length === 0) return { lon: 0, lat: 0 };
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = ring.length;
  const closed =
    n > 1 && ring[0]![0] === ring[n - 1]![0] && ring[0]![1] === ring[n - 1]![1];
  const end = closed ? n - 1 : n;
  for (let i = 0; i < end; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[(i + 1) % end]!;
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-14) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < end; i++) {
      sx += ring[i]![0];
      sy += ring[i]![1];
    }
    return { lon: sx / end, lat: sy / end };
  }
  return { lon: cx / (6 * a), lat: cy / (6 * a) };
}

/** Shoelace area in m² from local meter ring. */
export function ringAreaM2(ringLocal: [number, number][]): number {
  if (ringLocal.length < 3) return 0;
  let a = 0;
  const n = ringLocal.length;
  const closed =
    n > 1 &&
    ringLocal[0]![0] === ringLocal[n - 1]![0] &&
    ringLocal[0]![1] === ringLocal[n - 1]![1];
  const end = closed ? n - 1 : n;
  for (let i = 0; i < end; i++) {
    const [x0, y0] = ringLocal[i]!;
    const [x1, y1] = ringLocal[(i + 1) % end]!;
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) * 0.5;
}

export function wgs84RingToLocal(
  ringWgs84: [number, number][],
  origin?: { lon: number; lat: number },
): { ringLocalM: [number, number][]; centroid: { lon: number; lat: number }; areaM2: number } {
  const centroid = origin ?? ringCentroidLonLat(ringWgs84);
  const ringLocalM = ringWgs84.map(([lon, lat]) =>
    lonLatToLocalM(lon, lat, centroid.lon, centroid.lat),
  ) as [number, number][];
  return { ringLocalM, centroid, areaM2: ringAreaM2(ringLocalM) };
}

/** Drop duplicate closing vertex for storage / drawing. */
export function openRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring.slice() as [number, number][];
  const a = ring[0]!;
  const b = ring[ring.length - 1]!;
  if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1) as [number, number][];
  return ring.slice() as [number, number][];
}
