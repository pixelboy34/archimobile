import type { TextureKind } from "@/lib/bim/types";

function hash(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, oct = 4): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * valueNoise(x * f, y * f);
    a *= 0.5;
    f *= 2;
  }
  return v;
}

export function paintTexture(
  ctx: CanvasRenderingContext2D,
  kind: TextureKind,
  size: number,
): void {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const set = (i: number, g: number) => {
    const v = Math.max(0, Math.min(255, g | 0));
    const p = i * 4;
    d[p] = v;
    d[p + 1] = v;
    d[p + 2] = v;
    d[p + 3] = 255;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      let g = 200;
      if (kind === "smooth") {
        g = 235;
      } else if (kind === "plaster") {
        g = 210 + fbm(u * 18, v * 18, 5) * 40 - 12;
      } else if (kind === "concrete") {
        const n = fbm(u * 10, v * 10, 5);
        const speck = hash((x / 2) | 0, (y / 2) | 0) > 0.94 ? -50 : 0;
        g = 168 + n * 55 + speck;
      } else if (kind === "wood") {
        const grain = Math.sin((u * 14 + fbm(u * 3, v * 22, 3) * 1.4) * Math.PI * 2);
        g = 150 + grain * 38 + fbm(u * 4, v * 30, 3) * 20;
      } else if (kind === "brick") {
        const bw = size / 4;
        const bh = size / 8;
        const grout = Math.max(2, size * 0.018);
        const row = Math.floor(y / bh);
        const off = row % 2 ? bw * 0.5 : 0;
        const lx = (x + off) % bw;
        const ly = y % bh;
        const bx = Math.floor((x + off) / bw);
        if (lx < grout || ly < grout) g = 92;
        else g = 155 + hash(bx, row) * 50;
      } else if (kind === "stone") {
        const cells = 7;
        const cx = Math.floor(u * cells);
        const cy = Math.floor(v * cells);
        let min = 99;
        let second = 99;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const ix = cx + ox;
            const iy = cy + oy;
            const px = (ix + hash(ix, iy)) / cells;
            const py = (iy + hash(ix + 9, iy + 3)) / cells;
            const dist = Math.hypot(u - px, v - py);
            if (dist < min) {
              second = min;
              min = dist;
            } else if (dist < second) second = dist;
          }
        }
        const edge = Math.max(0, 0.035 - (second - min));
        g = edge > 0 ? 110 : 150 + hash(cx, cy) * 55 + fbm(u * 8, v * 8, 2) * 18;
      } else if (kind === "terracotta") {
        const tw = size / 5;
        const th = size / 3.2;
        const col = Math.floor(x / tw);
        const row = Math.floor(y / th);
        const lx = x - col * tw;
        const ly = y - row * th;
        const overlap = th * 0.12;
        if (ly < overlap || lx < 2 || lx > tw - 2) g = 96;
        else g = 148 + hash(col, row) * 40 + Math.sin((lx / tw) * Math.PI) * 12;
      } else if (kind === "metal") {
        g = 150 + Math.sin(v * 90 + fbm(u * 8, v * 40, 2) * 4) * 28 + fbm(u * 20, v * 2, 2) * 16;
      } else if (kind === "water") {
        g = 140 + Math.sin(u * 18 + v * 6) * 18 + Math.sin(u * 7 - v * 14) * 14 + fbm(u * 6, v * 6, 3) * 20;
      } else if (kind === "vegetation") {
        const clump = fbm(u * 9, v * 9, 4);
        g = clump > 0.55 ? 90 + clump * 80 : 70 + clump * 40;
        if (hash(x, y) > 0.97) g += 40;
      } else if (kind === "glass") {
        g = 210 + Math.sin(u * 6 + v * 2) * 10 + fbm(u * 3, v * 3, 2) * 12;
      }
      set(i, g);
    }
  }
  ctx.putImageData(img, 0, 0);
}

const canvasCache = new Map<string, HTMLCanvasElement>();

export function textureCanvas(kind: TextureKind, size: number): HTMLCanvasElement {
  const key = `${kind}:${size}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  paintTexture(ctx, kind, size);
  canvasCache.set(key, c);
  return c;
}

export function paintSwatch(
  canvas: HTMLCanvasElement,
  kind: TextureKind,
  color: string,
): void {
  const size = canvas.width;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(textureCanvas(kind, 128), 0, 0, size, size);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
}
