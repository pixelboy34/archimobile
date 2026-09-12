import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { cloneProject } from "@/lib/bim/builder";
import { MATERIAL_COLORS, ROOM_HATCH, resolveMaterial } from "@/lib/bim/materials";
import { OBJECT_MESH } from "@/lib/bim/catalog";
import {
  dist,
  distToSegment,
  findWallAt,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  projectBounds,
  snapVec,
  wallLength,
  wallAngle,
  wallNormalOffset,
} from "@/lib/bim/geometry";
import { isBearingWall } from "@/lib/bim/structure";
import type { Project, Tool, Vec2 } from "@/lib/bim/types";
import { snapDetail } from "@/lib/bim/snap";
import { orthoPoint, splitWallAt } from "@/lib/cad/ops";
import { useStudio } from "@/lib/store/project-store";

interface Cam {
  x: number;
  y: number;
  scale: number;
}

const underlayCache = new Map<string, HTMLImageElement | "loading" | "error">();

function getUnderlayImage(src: string): HTMLImageElement | null {
  const hit = underlayCache.get(src);
  if (hit instanceof HTMLImageElement) return hit;
  if (hit === "loading" || hit === "error") return null;
  underlayCache.set(src, "loading");
  const img = new Image();
  img.onload = () => underlayCache.set(src, img);
  img.onerror = () => underlayCache.set(src, "error");
  img.src = src;
  return null;
}

function worldFromEvent(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  cam: Cam,
): Vec2 {
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  return {
    x: cam.x + (sx - canvas.clientWidth / 2) / cam.scale,
    y: cam.y - (sy - canvas.clientHeight / 2) / cam.scale,
  };
}


function roleTintHex(hex: string, role?: string): string {
  if (!role || role === "interior") return hex;
  const n = hex.replace("#", "");
  if (n.length !== 6) return hex;
  let r = parseInt(n.slice(0, 2), 16);
  let g = parseInt(n.slice(2, 4), 16);
  let b = parseInt(n.slice(4, 6), 16);
  if (role === "exterior") {
    // cooler / cyan lean
    r = Math.max(0, Math.min(255, Math.round(r * 0.88)));
    g = Math.max(0, Math.min(255, Math.round(g * 1.02 + 8)));
    b = Math.max(0, Math.min(255, Math.round(b * 1.12 + 14)));
  } else if (role === "party") {
    // warmer
    r = Math.max(0, Math.min(255, Math.round(r * 1.1 + 12)));
    g = Math.max(0, Math.min(255, Math.round(g * 0.95)));
    b = Math.max(0, Math.min(255, Math.round(b * 0.82)));
  }
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function Plan2D({
  project,
  storyId,
  tool,
  snap,
  grid,
  selectedIds,
  onSelect,
  onWall,
  onOpening,
  onFurniture,
  onColumn,
  onStair,
  onSlab,
  onRoof,
  onDeletePoint,
}: {
  project: Project;
  storyId: string;
  tool: Tool;
  snap: boolean;
  grid: boolean;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onWall: (a: Vec2, b: Vec2) => void;
  onOpening: (kind: "door" | "window", p: Vec2) => void;
  onFurniture: (p: Vec2) => void;
  onColumn: (p: Vec2) => void;
  onStair: (p: Vec2) => void;
  onSlab: (p: Vec2) => void;
  onRoof: (p: Vec2) => void;
  onDeletePoint: (p: Vec2) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Cam>({ x: 8, y: 6, scale: 28 });
  const drag = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null);
  const hover = useRef<Vec2 | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; midX: number; midY: number; camX: number; camY: number } | null>(null);
  const draft = useStudio((s) => s.draft);
  const measure = useStudio((s) => s.measure);
  const ortho = useStudio((s) => s.ortho);
  const placeAt = useStudio((s) => s.placeAt);
  const addStroke = useStudio((s) => s.addStroke);
  const beginEdit = useStudio((s) => s.beginEdit);
  const moveSelected = useStudio((s) => s.moveSelected);
  const rotateSelected = useStudio((s) => s.rotateSelected);
  const splitWall = useStudio((s) => s.splitWallAt);
  const ink = useRef<Vec2[]>([]);
  const moveDrag = useRef<{ last: Vec2 } | null>(null);
  const lastTap = useRef(0);
  const snapStep = useStudio((s) => s.snapStep);
  const model = useRef({ project, storyId, tool, snap, grid, selectedIds, draft, measure, ortho, snapStep });
  model.current = { project, storyId, tool, snap, grid, selectedIds, draft, measure, ortho, snapStep };

  useEffect(() => {
    const b = projectBounds(project, storyId);
    cam.current.x = (b.min.x + b.max.x) / 2;
    cam.current.y = (b.min.y + b.max.y) / 2;
    const canvas = ref.current;
    const w = canvas?.clientWidth || 390;
    const h = canvas?.clientHeight || 560;
    const sx = Math.max(8, b.max.x - b.min.x + 8);
    const sy = Math.max(8, b.max.y - b.min.y + 8);
    cam.current.scale = Math.max(2.4, Math.min(72, 0.9 * Math.min(w / sx, h / sy)));
  }, [project.id, storyId]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    let alive = true;

    const draw = () => {
      if (!alive) return;
      const { project: proj, storyId: sid, grid: showGrid, selectedIds: sel, draft: dr, measure: meas } =
        model.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 2 || h < 2) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0a1118";
      ctx.fillRect(0, 0, w, h);

      const toS = (p: Vec2) => ({
        x: w / 2 + (p.x - cam.current.x) * cam.current.scale,
        y: h / 2 - (p.y - cam.current.y) * cam.current.scale,
      });

      if (showGrid) {
        const step = cam.current.scale >= 48 ? Math.max(0.25, model.current.snapStep) : cam.current.scale >= 28 ? 1 : 5;
        ctx.beginPath();
        const left = cam.current.x - w / 2 / cam.current.scale;
        const right = cam.current.x + w / 2 / cam.current.scale;
        const bottom = cam.current.y - h / 2 / cam.current.scale;
        const top = cam.current.y + h / 2 / cam.current.scale;
        const x0 = Math.floor(left / step) * step;
        const y0 = Math.floor(bottom / step) * step;
        for (let x = x0; x <= right; x += step) {
          const s = toS({ x, y: 0 });
          ctx.moveTo(s.x, 0);
          ctx.lineTo(s.x, h);
        }
        for (let y = y0; y <= top; y += step) {
          const s = toS({ x: 0, y });
          ctx.moveTo(0, s.y);
          ctx.lineTo(w, s.y);
        }
        ctx.strokeStyle = "rgba(110, 208, 195, 0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const underlay = proj.surveyUnderlay;
      if (underlay && underlay.storyId === sid && underlay.src) {
        const img = getUnderlayImage(underlay.src);
        if (img && img.naturalWidth > 0) {
          const nw = underlay.naturalWidth ?? img.naturalWidth;
          const nh = underlay.naturalHeight ?? img.naturalHeight;
          const aspect = nh / Math.max(1, nw);
          const sc = cam.current.scale;
          const c = toS(underlay.offset);
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(-underlay.rotation);
          // Pas de scale(1,-1) : underlayPixelToWorld ne retourne pas l'image, et le
          // flip peignait le calque en symétrie autour de y = offset.y — jusqu'à 48 m
          // d'écart en portrait 1:4, donc des traits extraits en haut du scan collés en
          // bas de la maquette. toS() porte déjà l'inversion écran.
          ctx.globalAlpha = Math.max(0.05, Math.min(1, underlay.opacity));
          const wPx = underlay.scale * sc;
          const hPx = underlay.scale * aspect * sc;
          ctx.drawImage(img, -wPx / 2, -hPx / 2, wPx, hPx);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }

      const parcelRing = proj.meta.parcelle?.ring;
      if (parcelRing && parcelRing.length >= 3) {
        ctx.beginPath();
        parcelRing.forEach((pt, i) => {
          const s = toS({ x: pt[0], y: pt[1] });
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = "rgba(110, 208, 195, 0.72)";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(110, 208, 195, 0.04)";
        ctx.fill();
      }

      const rooms = proj.rooms.filter((r) => r.storyId === sid);
      for (const r of rooms) {
        if (r.polygon.length < 3) continue;
        ctx.beginPath();
        r.polygon.forEach((p, i) => {
          const s = toS(p);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.fillStyle = ROOM_HATCH[r.function] ?? "#c4bfb4";
        ctx.globalAlpha = 0.12;
        ctx.fill();
        ctx.globalAlpha = 1;
        const c = toS(polygonCentroid(r.polygon));
        ctx.fillStyle = "#a8b6b8";
        ctx.font = "500 11px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(r.name, c.x, c.y - 5);
        ctx.fillStyle = "#6e8286";
        ctx.font = "500 9px IBM Plex Mono, monospace";
        ctx.fillText(`${polygonArea(r.polygon).toFixed(1)} m²`, c.x, c.y + 8);
      }

      const walls = proj.walls.filter((wl) => wl.storyId === sid);
      for (const wall of walls) {
        const off = wallNormalOffset(wall);
        const aW = { x: wall.a.x + off.x, y: wall.a.y + off.y };
        const bW = { x: wall.b.x + off.x, y: wall.b.y + off.y };
        const a = toS(aW);
        const b = toS(bW);
        const bearing = isBearingWall(wall);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = sel.includes(wall.id)
          ? "#6ed0c3"
          : bearing
            ? "#7a5a45"
            : roleTintHex(resolveMaterial(wall.materialId, proj.materials).color, wall.role);
        ctx.lineWidth = Math.max(bearing ? 5 : 2.5, wall.thickness * cam.current.scale);
        ctx.lineCap = "square";
        ctx.globalAlpha = sel.includes(wall.id) ? 1 : bearing ? 1 : 0.92;
        ctx.stroke();
        ctx.globalAlpha = 1;
        const insM = (wall.insulationMm ?? 0) / 1000;
        if (insM > 0.004) {
          const ang = wallAngle(wall);
          const ux = Math.sin(ang);
          const uy = -Math.cos(ang);
          const d = wall.thickness / 2 + insM;
          const aI = toS({ x: aW.x - ux * d, y: aW.y - uy * d });
          const bI = toS({ x: bW.x - ux * d, y: bW.y - uy * d });
          ctx.beginPath();
          ctx.moveTo(aI.x, aI.y);
          ctx.lineTo(bI.x, bI.y);
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = "rgba(216,196,138,0.85)";
          ctx.lineWidth = Math.max(1.5, insM * cam.current.scale);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (wall.fireRating && wall.fireRating !== "none") {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = "rgba(196,92,74,0.55)";
          ctx.lineWidth = 1.25;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (sel.includes(wall.id) || cam.current.scale >= 30) {
          const mid = toS({ x: (aW.x + bW.x) / 2, y: (aW.y + bW.y) / 2 });
          ctx.fillStyle = sel.includes(wall.id) ? "#6ed0c3" : "#8a9ea2";
          ctx.font = "500 11px IBM Plex Mono, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${wallLength(wall).toFixed(2)} m`, mid.x, mid.y - 10);
        }
      }

      for (const o of proj.openings) {
        const wall = walls.find((wl) => wl.id === o.wallId);
        if (!wall) continue;
        const off = wallNormalOffset(wall);
        const t = o.t;
        const px = wall.a.x + (wall.b.x - wall.a.x) * t + off.x;
        const py = wall.a.y + (wall.b.y - wall.a.y) * t + off.y;
        const s = toS({ x: px, y: py });
        const ang = wallAngle(wall);
        const sc = cam.current.scale;
        if (o.kind === "door") {
          const dir = o.swing === "right" ? 1 : -1;
          const hx = px - Math.cos(ang) * (o.width / 2) * dir;
          const hy = py - Math.sin(ang) * (o.width / 2) * dir;
          const hs = toS({ x: hx, y: hy });
          const r = o.width * sc;
          const start = -ang + (dir > 0 ? Math.PI : 0);
          ctx.beginPath();
          ctx.moveTo(hs.x, hs.y);
          ctx.arc(hs.x, hs.y, r, start, start + dir * (Math.PI / 2), dir < 0);
          ctx.strokeStyle = sel.includes(o.id) ? "#6ed0c3" : "rgba(160,120,82,0.9)";
          ctx.lineWidth = 1.35;
          ctx.stroke();
          // leaf line
          const leafAng = ang + dir * (Math.PI / 2);
          const lx = hx + Math.cos(leafAng) * o.width;
          const ly = hy + Math.sin(leafAng) * o.width;
          const ls = toS({ x: lx, y: ly });
          ctx.beginPath();
          ctx.moveTo(hs.x, hs.y);
          ctx.lineTo(ls.x, ls.y);
          ctx.strokeStyle = sel.includes(o.id) ? "#6ed0c3" : "rgba(160,120,82,1)";
          ctx.lineWidth = 1.75;
          ctx.stroke();
        } else {
          const glaze =
            o.glazing === "single" ? "#a8d4e8" : o.glazing === "triple" ? "#5f8fa8" : "#7a9e96";
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(-ang);
          ctx.strokeStyle = glaze;
          ctx.lineWidth = o.glazing === "triple" ? 2.4 : o.glazing === "single" ? 1.2 : 1.5;
          ctx.strokeRect((-o.width * sc) / 2, -3, o.width * sc, 6);
          if (o.glazing === "triple" || o.glazing === "double") {
            ctx.strokeRect((-o.width * sc) / 2, -1.2, o.width * sc, 2.4);
          }
          ctx.restore();
        }
      }

      for (const f of proj.furniture.filter((x) => x.storyId === sid)) {
        const s = toS(f.position);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(-f.rotation);
        ctx.fillStyle = sel.includes(f.id)
          ? "#7a9e96"
          : MATERIAL_COLORS[OBJECT_MESH[f.kind]?.mat ?? "wood"] ?? "rgba(232,228,217,0.35)";
        ctx.fillRect(
          (-f.w * cam.current.scale) / 2,
          (-f.d * cam.current.scale) / 2,
          f.w * cam.current.scale,
          f.d * cam.current.scale,
        );
        ctx.restore();
      }

      for (const c of proj.columns.filter((x) => x.storyId === sid)) {
        const s = toS(c.position);
        const sc = cam.current.scale;
        ctx.fillStyle = sel.includes(c.id) ? "#7a9e96" : "#9a958c";
        ctx.fillRect(s.x - (c.width * sc) / 2, s.y - (c.depth * sc) / 2, c.width * sc, c.depth * sc);
      }
      for (const st of proj.stairs.filter((x) => x.storyId === sid)) {
        const s = toS(st.origin);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(-st.direction);
        ctx.strokeStyle = sel.includes(st.id) ? "#7a9e96" : "#c4bfb4";
        ctx.strokeRect(0, (-st.width * cam.current.scale) / 2, st.run * cam.current.scale, st.width * cam.current.scale);
        ctx.restore();
      }

      if (dr && hover.current) {
        const hoverPt = model.current.ortho ? orthoPoint(dr, hover.current) : hover.current;
        const a = toS(dr);
        const b = toS(hoverPt);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = "#7a9e96";
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f3f1ec";
        ctx.font = "500 11px IBM Plex Mono, monospace";
        ctx.fillText(`${dist(dr, hoverPt).toFixed(2)} m`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 8);
      }
      if (dr && hover.current && model.current.tool === "rect") {
        const a = toS(dr);
        const b = toS(hover.current);
        ctx.strokeStyle = "#7a9e96";
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx.setLineDash([]);
        const w = Math.abs(hover.current.x - dr.x);
        const d = Math.abs(hover.current.y - dr.y);
        ctx.fillStyle = "#f3f1ec";
        ctx.font = "500 11px IBM Plex Mono, monospace";
        ctx.fillText(`${w.toFixed(2)} × ${d.toFixed(2)} m`, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      if (hover.current && (model.current.tool === "wall" || model.current.tool === "rect" || model.current.tool === "measure")) {
        const snap = snapDetail(hover.current, proj, sid, model.current.snap, 0.35, model.current.snapStep);
        const spt = toS(snap.point);
        ctx.beginPath();
        if (snap.kind === "end") {
          ctx.rect(spt.x - 5, spt.y - 5, 10, 10);
        } else {
          ctx.arc(spt.x, spt.y, 5, 0, Math.PI * 2);
        }
        ctx.strokeStyle = snap.kind === "none" ? "#5c5a54" : "#7a9e96";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (hover.current && (model.current.tool === "window" || model.current.tool === "door")) {
        const hit = findWallAt(proj, sid, hover.current, 0.6);
        if (hit) {
          const wall = hit.wall;
          const off = wallNormalOffset(wall);
          const px = wall.a.x + (wall.b.x - wall.a.x) * hit.t + off.x;
          const py = wall.a.y + (wall.b.y - wall.a.y) * hit.t + off.y;
          const ang = wallAngle(wall);
          const sc = cam.current.scale;
          const ow = model.current.tool === "door" ? 0.9 : 1.4;
          const s = toS({ x: px, y: py });
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(-ang);
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = "#6ed0c3";
          ctx.fillStyle = "rgba(110, 208, 195, 0.18)";
          ctx.lineWidth = 2;
          ctx.fillRect((-ow * sc) / 2, -5, ow * sc, 10);
          ctx.strokeRect((-ow * sc) / 2, -5, ow * sc, 10);
          ctx.restore();
          ctx.globalAlpha = 1;
          // façade snap hint
          ctx.beginPath();
          ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#6ed0c3";
          ctx.fill();
        }
      }
      if (meas) {
        const a = toS(meas.a);
        const b = toS(meas.b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = "#e8e4d9";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#f3f1ec";
        ctx.font = "500 11px IBM Plex Mono, monospace";
        ctx.fillText(`${dist(meas.a, meas.b).toFixed(2)} m`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 8);
      }

      const layers = proj.layers ?? [];
      const visible = new Set(layers.filter((l) => l.visible).map((l) => l.id));
      for (const sk of proj.strokes ?? []) {
        if (sk.storyId !== sid || sk.points.length < 2) continue;
        if (sk.layerId && visible.size && !visible.has(sk.layerId)) continue;
        const layer = layers.find((l) => l.id === sk.layerId);
        ctx.beginPath();
        sk.points.forEach((pt, i) => {
          const s = toS(pt);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.strokeStyle = sk.color;
        ctx.globalAlpha = layer?.opacity ?? 1;
        ctx.lineWidth = Math.max(1.5, sk.width * cam.current.scale);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const live = ink.current;
      if (live.length > 1) {
        ctx.beginPath();
        live.forEach((pt, i) => {
          const s = toS(pt);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.strokeStyle = "#e8e4d9";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      const survey = (proj.survey ?? []).filter((sv) => sv.storyId === sid);
      if (survey.length) {
        ctx.beginPath();
        survey.forEach((sv, i) => {
          const s = toS(sv.position);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.strokeStyle = "#c4a35a";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < survey.length; i++) {
          const s = toS(survey[i]!.position);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#c4a35a";
          ctx.fill();
          if (i > 0) {
            const a = survey[i - 1]!.position;
            const b = survey[i]!.position;
            const mid = toS({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            ctx.fillStyle = "#e8e4d9";
            ctx.font = "500 11px IBM Plex Mono, monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${dist(a, b).toFixed(2)} m`, mid.x, mid.y - 8);
          }
        }
      }

      ctx.fillStyle = "#7a9e96";
      ctx.font = "600 10px Outfit, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("N", 18, 28);
      ctx.beginPath();
      ctx.moveTo(22, 34);
      ctx.lineTo(22, 52);
      ctx.strokeStyle = "#7a9e96";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const meters = cam.current.scale >= 40 ? 2 : cam.current.scale >= 22 ? 5 : 10;
      const bar = meters * cam.current.scale;
      const bx = 18;
      const by = h - 22;
      ctx.strokeStyle = "#e8e4d9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + bar, by);
      ctx.moveTo(bx, by - 4);
      ctx.lineTo(bx, by + 4);
      ctx.moveTo(bx + bar, by - 4);
      ctx.lineTo(bx + bar, by + 4);
      ctx.stroke();
      ctx.fillStyle = "#c4bfb4";
      ctx.font = "500 10px IBM Plex Mono, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${meters} m`, bx, by - 8);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const hit = (p: Vec2): string | null => {
    const { project: proj, storyId: sid } = model.current;
    let bestId: string | null = null;
    let bestD = Infinity;
    const consider = (id: string, d: number) => {
      if (d < bestD) {
        bestD = d;
        bestId = id;
      }
    };
    for (const o of proj.openings) {
      const wall = proj.walls.find((w) => w.id === o.wallId);
      if (!wall || wall.storyId !== sid) continue;
      const px = wall.a.x + (wall.b.x - wall.a.x) * o.t;
      const py = wall.a.y + (wall.b.y - wall.a.y) * o.t;
      const d = dist(p, { x: px, y: py });
      if (d < 0.45) consider(o.id, d);
    }
    for (const f of proj.furniture.filter((x) => x.storyId === sid)) {
      const d = dist(p, f.position);
      if (d < Math.max(0.5, Math.min(f.w, f.d) * 0.6)) consider(f.id, d);
    }
    for (const c of proj.columns.filter((x) => x.storyId === sid)) {
      const d = dist(p, c.position);
      if (d < 0.5) consider(c.id, d);
    }
    for (const st of proj.stairs.filter((x) => x.storyId === sid)) {
      const d = dist(p, st.origin);
      if (d < 0.8) consider(st.id, d);
    }
    for (const w of proj.walls.filter((x) => x.storyId === sid)) {
      const h = distToSegment(p, w.a, w.b);
      if (h.dist < 0.4) consider(w.id, h.dist);
    }
    for (const r of proj.rooms.filter((x) => x.storyId === sid)) {
      if (pointInPolygon(p, r.polygon)) {
        const c = polygonCentroid(r.polygon);
        consider(r.id, dist(p, c) * 0.25);
      }
    }
    for (const sl of proj.slabs.filter((x) => x.storyId === sid)) {
      if (pointInPolygon(p, sl.polygon)) consider(sl.id, 1.2);
    }
    for (const rf of proj.roofs.filter((x) => x.storyId === sid)) {
      if (pointInPolygon(p, rf.polygon)) consider(rf.id, 1.4);
    }
    return bestId;
  };

  return (
    <canvas
      ref={ref}
      className="studio-canvas h-full w-full touch-none"
      onWheel={(e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        cam.current.scale = Math.min(110, Math.max(2.4, cam.current.scale * factor));
      }}
      onPointerDown={(e) => {
        const canvas = ref.current!;
        canvas.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          const pts = [...pointers.current.values()];
          pinch.current = {
            dist: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y),
            scale: cam.current.scale,
            midX: (pts[0]!.x + pts[1]!.x) / 2,
            midY: (pts[0]!.y + pts[1]!.y) / 2,
            camX: cam.current.x,
            camY: cam.current.y,
          };
          return;
        }
        const p = worldFromEvent(e, canvas, cam.current);
        const wp = model.current.snap ? snapVec(p, model.current.snapStep) : p;
        const currentTool = model.current.tool;
        if (currentTool === "pen") {
          ink.current = [wp];
          return;
        }
        if (currentTool === "select" || e.button === 1 || e.button === 2 || e.altKey || e.shiftKey) {
          const id = hit(p);
          const now = performance.now();
          if (id && currentTool === "select" && now - lastTap.current < 320) {
            const isWall = model.current.project.walls.some((w) => w.id === id);
            if (isWall) {
              // L'identifiant du mur touché est transmis : sans lui la coupe
              // redéduit sa cible par proximité et peut prendre un mur voisin.
              // C'est le store qui joue l'essai à blanc et annonce un refus ;
              // le rejouer ici clonait la maquette une seconde fois par appui.
              splitWall(p, id);
            } else rotateSelected(Math.PI / 2);
            lastTap.current = 0;
            return;
          }
          lastTap.current = now;
          if (id && currentTool === "select" && model.current.selectedIds.includes(id)) {
            beginEdit();
            moveDrag.current = { last: p };
            return;
          }
          drag.current = { x: e.clientX, y: e.clientY, camX: cam.current.x, camY: cam.current.y };
          if (id && currentTool === "select") onSelect([id]);
          else if (currentTool === "select") onSelect([]);
          return;
        }
        placeAt(wp);
      }}
      onPointerMove={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const canvas = ref.current!;
        hover.current = worldFromEvent(e, canvas, cam.current);
        if (moveDrag.current) {
          const p = hover.current;
          moveSelected(p.x - moveDrag.current.last.x, p.y - moveDrag.current.last.y);
          moveDrag.current.last = p;
          return;
        }
        if (model.current.tool === "pen" && ink.current.length) {
          const p = worldFromEvent(e, canvas, cam.current);
          ink.current = [...ink.current, p];
          return;
        }
        if (pinch.current && pointers.current.size >= 2) {
          const pts = [...pointers.current.values()];
          const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
          cam.current.scale = Math.min(
            110,
            Math.max(2.4, pinch.current.scale * (d / pinch.current.dist)),
          );
          const midX = (pts[0]!.x + pts[1]!.x) / 2;
          const midY = (pts[0]!.y + pts[1]!.y) / 2;
          cam.current.x = pinch.current.camX - (midX - pinch.current.midX) / cam.current.scale;
          cam.current.y = pinch.current.camY + (midY - pinch.current.midY) / cam.current.scale;
          return;
        }
        if (drag.current) {
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          cam.current.x = drag.current.camX - dx / cam.current.scale;
          cam.current.y = drag.current.camY + dy / cam.current.scale;
        }
      }}
      onPointerUp={(e) => {
        if (ink.current.length > 1) addStroke(ink.current);
        ink.current = [];
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        drag.current = null;
        moveDrag.current = null;
      }}
    />
  );
}
