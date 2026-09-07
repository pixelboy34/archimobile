/**
 * Relevé photo / plan scanné → underlay + extraction semi-auto de traits (client-only).
 * L’image n’entre jamais dans IFC/DXF — champ Project.surveyUnderlay uniquement.
 */
import type { SurveyUnderlay, Vec2 } from "./types";

const MAX_EDGE = 1600;
const MAX_DATA_URL = 1_800_000;

export type UnderlaySrcResult = {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  ephemeral: boolean;
};

/** Pixel → monde via paramètres underlay (centre = offset, largeur = scale). */
export function underlayPixelToWorld(
  u: Pick<SurveyUnderlay, "scale" | "rotation" | "offset" | "naturalWidth" | "naturalHeight">,
  px: number,
  py: number,
): Vec2 {
  const nw = Math.max(1, u.naturalWidth ?? 1);
  const nh = Math.max(1, u.naturalHeight ?? 1);
  const aspect = nh / nw;
  const nx = px / nw - 0.5;
  const ny = 0.5 - py / nh;
  const lx = nx * u.scale;
  const ly = ny * u.scale * aspect;
  const c = Math.cos(u.rotation);
  const s = Math.sin(u.rotation);
  return {
    x: u.offset.x + lx * c - ly * s,
    y: u.offset.y + lx * s + ly * c,
  };
}

export function defaultUnderlay(
  storyId: string,
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  ephemeral = false,
): SurveyUnderlay {
  return {
    storyId,
    src,
    opacity: 0.55,
    scale: 12,
    rotation: 0,
    offset: { x: 6, y: 5 },
    naturalWidth,
    naturalHeight,
    ephemeral,
  };
}

/** Compresse un File en JPEG data URL (ou blob URL si trop gros). */
export async function fileToUnderlaySrc(file: File): Promise<UnderlaySrcResult> {
  const bitmap = await createImageBitmap(file);
  const { width: ow, height: oh } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(ow, oh));
  const w = Math.max(1, Math.round(ow * scale));
  const h = Math.max(1, Math.round(oh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas indisponible");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let quality = 0.72;
  let src = canvas.toDataURL("image/jpeg", quality);
  while (src.length > MAX_DATA_URL && quality > 0.4) {
    quality -= 0.1;
    src = canvas.toDataURL("image/jpeg", quality);
  }
  if (src.length > MAX_DATA_URL) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.55),
    );
    if (blob) {
      return {
        src: URL.createObjectURL(blob),
        naturalWidth: w,
        naturalHeight: h,
        ephemeral: true,
      };
    }
  }
  return { src, naturalWidth: w, naturalHeight: h, ephemeral: false };
}

function idx(x: number, y: number, w: number) {
  return y * w + x;
}

/** Niveaux de gris 0–255. */
export function imageDataToGray(data: ImageData): Float32Array {
  const { width: w, height: h, data: px } = data;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    gray[p] = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
  }
  return gray;
}

/** Flou boîte 3×3. */
export function boxBlur3(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += gray[idx(xx, yy, w)]!;
          n++;
        }
      }
      out[idx(x, y, w)] = sum / n;
    }
  }
  return out;
}

/** Magnitude Sobel normalisée 0–1. */
export function sobelMagnitude(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  let max = 1e-6;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[idx(x - 1, y - 1, w)]! +
        gray[idx(x + 1, y - 1, w)]! +
        -2 * gray[idx(x - 1, y, w)]! +
        2 * gray[idx(x + 1, y, w)]! +
        -gray[idx(x - 1, y + 1, w)]! +
        gray[idx(x + 1, y + 1, w)]!;
      const gy =
        -gray[idx(x - 1, y - 1, w)]! -
        2 * gray[idx(x, y - 1, w)]! -
        gray[idx(x + 1, y - 1, w)]! +
        gray[idx(x - 1, y + 1, w)]! +
        2 * gray[idx(x, y + 1, w)]! +
        gray[idx(x + 1, y + 1, w)]!;
      const m = Math.hypot(gx, gy);
      out[idx(x, y, w)] = m;
      if (m > max) max = m;
    }
  }
  for (let i = 0; i < out.length; i++) out[i]! /= max;
  return out;
}

/** Seuil adaptatif (percentile) → masque booléen. */
export function thresholdEdges(
  mag: Float32Array,
  percentile = 0.88,
): Uint8Array {
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(mag.length / 4000));
  for (let i = 0; i < mag.length; i += step) {
    const v = mag[i]!;
    if (v > 0.02) sample.push(v);
  }
  sample.sort((a, b) => a - b);
  const t =
    sample.length === 0
      ? 0.35
      : sample[Math.min(sample.length - 1, Math.floor(sample.length * percentile))]!;
  const mask = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) mask[i] = mag[i]! >= t ? 1 : 0;
  return mask;
}

const N8: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Chaînes de pixels arête (8-connexité), simplifiées. */
export function tracePolylines(
  mask: Uint8Array,
  w: number,
  h: number,
  minLen = 12,
): Vec2[][] {
  const visited = new Uint8Array(mask.length);
  const chains: Vec2[][] = [];

  const neighbors = (x: number, y: number): [number, number][] => {
    const out: [number, number][] = [];
    for (const [dx, dy] of N8) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const i = idx(xx, yy, w);
      if (mask[i] && !visited[i]) out.push([xx, yy]);
    }
    return out;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = idx(x, y, w);
      if (!mask[start] || visited[start]) continue;
      const degree = neighbors(x, y).length;
      // préférer démarrer aux extrémités
      if (degree > 1) continue;

      const chain: Vec2[] = [];
      let cx = x;
      let cy = y;
      for (;;) {
        const i = idx(cx, cy, w);
        if (visited[i]) break;
        visited[i] = 1;
        chain.push({ x: cx, y: cy });
        const n = neighbors(cx, cy);
        if (!n.length) break;
        // choisir le voisin le plus aligné
        let best = n[0]!;
        if (chain.length >= 2) {
          const prev = chain[chain.length - 2]!;
          const vx = cx - prev.x;
          const vy = cy - prev.y;
          let bestDot = -Infinity;
          for (const cand of n) {
            const dx = cand[0] - cx;
            const dy = cand[1] - cy;
            const dot = dx * vx + dy * vy;
            if (dot > bestDot) {
              bestDot = dot;
              best = cand;
            }
          }
        }
        cx = best[0];
        cy = best[1];
      }
      if (chain.length >= minLen) chains.push(simplifyPolyline(chain, 1.8));
    }
  }

  // second pass: remaining blobs (loops)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = idx(x, y, w);
      if (!mask[start] || visited[start]) continue;
      const chain: Vec2[] = [];
      let cx = x;
      let cy = y;
      for (;;) {
        const i = idx(cx, cy, w);
        if (visited[i]) break;
        visited[i] = 1;
        chain.push({ x: cx, y: cy });
        const n = neighbors(cx, cy);
        if (!n.length) break;
        cx = n[0]![0];
        cy = n[0]![1];
      }
      if (chain.length >= minLen) chains.push(simplifyPolyline(chain, 1.8));
    }
  }
  return chains;
}

function dist2(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Douglas–Peucker (epsilon en pixels). */
export function simplifyPolyline(pts: Vec2[], epsilon: number): Vec2[] {
  if (pts.length < 3) return pts.map((p) => ({ ...p }));
  const sq = epsilon * epsilon;

  const recurse = (start: number, end: number, out: Vec2[]) => {
    let maxD = 0;
    let idxMax = start;
    const a = pts[start]!;
    const b = pts[end]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ab2 = abx * abx + aby * aby || 1e-9;
    for (let i = start + 1; i < end; i++) {
      const p = pts[i]!;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2));
      const proj = { x: a.x + t * abx, y: a.y + t * aby };
      const d = dist2(p, proj);
      if (d > maxD) {
        maxD = d;
        idxMax = i;
      }
    }
    if (maxD > sq) {
      recurse(start, idxMax, out);
      out.pop();
      recurse(idxMax, end, out);
    } else {
      out.push({ ...a }, { ...b });
    }
  };

  const out: Vec2[] = [];
  recurse(0, pts.length - 1, out);
  // dédup consecutive
  const dedup: Vec2[] = [];
  for (const p of out) {
    if (!dedup.length || dist2(dedup[dedup.length - 1]!, p) > 0.25) dedup.push(p);
  }
  return dedup;
}

export type ExtractStrokesResult = {
  polylines: Vec2[][];
  edgeCount: number;
};

/**
 * ImageData → polylines monde (via underlay).
 * Downscale interne pour rester rapide.
 */
export function extractStrokesFromImageData(
  data: ImageData,
  underlay: SurveyUnderlay,
  opts?: { maxDim?: number; minPixelLen?: number },
): ExtractStrokesResult {
  const maxDim = opts?.maxDim ?? 640;
  const { width: ow, height: oh } = data;
  const factor = Math.min(1, maxDim / Math.max(ow, oh));
  let gray: Float32Array;
  let w = ow;
  let h = oh;
  let work: ImageData = data;

  if (factor < 0.999) {
    w = Math.max(1, Math.round(ow * factor));
    h = Math.max(1, Math.round(oh * factor));
    // resample manually (nearest)
    const src = data.data;
    const dst = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(oh - 1, Math.floor(y / factor));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(ow - 1, Math.floor(x / factor));
        const si = (sy * ow + sx) * 4;
        const di = (y * w + x) * 4;
        dst[di] = src[si]!;
        dst[di + 1] = src[si + 1]!;
        dst[di + 2] = src[si + 2]!;
        dst[di + 3] = src[si + 3]!;
      }
    }
    work = new ImageData(dst, w, h);
  }

  gray = boxBlur3(imageDataToGray(work), w, h);
  const mag = sobelMagnitude(gray, w, h);
  const mask = thresholdEdges(mag, 0.9);
  let edgeCount = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) edgeCount++;

  const minLen = opts?.minPixelLen ?? Math.max(10, Math.round(Math.min(w, h) * 0.04));
  const pixelChains = tracePolylines(mask, w, h, minLen);

  const u: SurveyUnderlay = {
    ...underlay,
    naturalWidth: underlay.naturalWidth ?? ow,
    naturalHeight: underlay.naturalHeight ?? oh,
  };

  // map processing pixels → original image pixels → world
  const polylines = pixelChains.map((chain) =>
    chain.map((p) => {
      const ox = p.x / factor;
      const oy = p.y / factor;
      return underlayPixelToWorld(u, ox, oy);
    }),
  );

  return { polylines, edgeCount };
}

/** Charge src dans un canvas offscreen et extrait. */
export async function extractStrokesFromUnderlay(
  underlay: SurveyUnderlay,
): Promise<ExtractStrokesResult> {
  const img = await loadImage(underlay.src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { polylines: [], edgeCount: 0 };
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const u = {
    ...underlay,
    naturalWidth: underlay.naturalWidth ?? canvas.width,
    naturalHeight: underlay.naturalHeight ?? canvas.height,
  };
  return extractStrokesFromImageData(data, u);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image underlay illisible"));
    img.src = src;
  });
}
