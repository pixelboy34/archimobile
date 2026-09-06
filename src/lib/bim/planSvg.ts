import {
  lerp,
  polygonArea,
  polygonCentroid,
  projectBounds,
  wallAngle,
  wallLength,
  wallSolidSegments,
} from "./geometry";
import type { Opening, Project, Story, Vec2, Wall } from "./types";

const ACCENT = "#6ed0c3";
const INK = "#1a1916";
const MUTED = "#5c5a54";
const FILL_ROOM = "#f4f1ea";
const FILL_WALL = "#1a1916";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function storyRoleLabel(story: Story, index: number, stories: Story[]): string {
  if (story.role === "basement") return "SS";
  if (story.role === "ground") return "RDC";
  if (story.role === "attic") return "Attique";
  if (story.name) return story.name;
  const groundIdx = stories.findIndex((s) => s.role === "ground" || (s.elevation >= -0.05 && s.elevation < 0.6));
  const g = groundIdx >= 0 ? groundIdx : 0;
  const n = index - g;
  if (n <= 0) return "RDC";
  if (story.elevation < -0.05) return "SS";
  return `R+${n}`;
}

export function aboveGroundHeight(project: Project): number {
  let max = 0;
  for (const s of project.stories) {
    if (s.elevation + s.height > max) max = s.elevation + s.height;
  }
  return Math.max(0, max);
}

/** World → SVG (Y flipped). */
function makeMapper(min: Vec2, max: Vec2, pad: number, W: number, H: number) {
  const bw = Math.max(0.5, max.x - min.x);
  const bh = Math.max(0.5, max.y - min.y);
  const scale = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
  const ox = (W - bw * scale) / 2;
  const oy = (H - bh * scale) / 2;
  const map = (p: Vec2): Vec2 => ({
    x: ox + (p.x - min.x) * scale,
    y: H - (oy + (p.y - min.y) * scale),
  });
  return { map, scale };
}

function polyPoints(pts: Vec2[], map: (p: Vec2) => Vec2): string {
  return pts.map((p) => {
    const m = map(p);
    return `${m.x.toFixed(1)},${m.y.toFixed(1)}`;
  }).join(" ");
}

function northArrow(cx: number, cy: number, northDeg: number): string {
  const rad = ((northDeg ?? 0) * Math.PI) / 180;
  // Plan: +Y is north in world; after flip, world +Y points up in SVG already via our flip.
  // Rotate arrow so tip points to project north.
  const tipX = cx + Math.sin(rad) * 18;
  const tipY = cy - Math.cos(rad) * 18;
  const baseLx = cx + Math.sin(rad + 2.5) * 10;
  const baseLy = cy - Math.cos(rad + 2.5) * 10;
  const baseRx = cx + Math.sin(rad - 2.5) * 10;
  const baseRy = cy - Math.cos(rad - 2.5) * 10;
  return [
    `<g class="north">`,
    `<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${MUTED}" stroke-width="1"/>`,
    `<polygon points="${tipX.toFixed(1)},${tipY.toFixed(1)} ${baseLx.toFixed(1)},${baseLy.toFixed(1)} ${baseRx.toFixed(1)},${baseRy.toFixed(1)}" fill="${INK}"/>`,
    `<text x="${cx}" y="${cy + 28}" text-anchor="middle" font-size="9" fill="${MUTED}" font-family="system-ui,sans-serif">N</text>`,
    `</g>`,
  ].join("");
}

function scaleBar(x: number, y: number, scale: number): string {
  // Prefer 1, 2, 5, 10 m bar
  const candidates = [1, 2, 5, 10, 20];
  let meters = 5;
  for (const c of candidates) {
    if (c * scale >= 40 && c * scale <= 120) {
      meters = c;
      break;
    }
    meters = c;
  }
  const px = meters * scale;
  return [
    `<g class="scale">`,
    `<line x1="${x}" y1="${y}" x2="${x + px}" y2="${y}" stroke="${INK}" stroke-width="1.5"/>`,
    `<line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="${INK}" stroke-width="1.5"/>`,
    `<line x1="${x + px}" y1="${y - 4}" x2="${x + px}" y2="${y + 4}" stroke="${INK}" stroke-width="1.5"/>`,
    `<text x="${x + px / 2}" y="${y + 14}" text-anchor="middle" font-size="9" fill="${MUTED}" font-family="system-ui,sans-serif" font-variant-numeric="tabular-nums">${meters} m</text>`,
    `</g>`,
  ].join("");
}

function wallStroke(wall: Wall, openings: Opening[], map: (p: Vec2) => Vec2, scale: number): string {
  const segs = wallSolidSegments(wall, openings);
  const sw = Math.max(1.2, wall.thickness * scale);
  const parts: string[] = [];
  for (const seg of segs) {
    const a = map(seg.a);
    const b = map(seg.b);
    parts.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${FILL_WALL}" stroke-width="${sw.toFixed(1)}" stroke-linecap="square"/>`,
    );
  }
  // Opening ticks (doors/windows as thin gap markers)
  for (const o of openings) {
    if (o.wallId !== wall.id) continue;
    const len = wallLength(wall);
    if (len < 0.05) continue;
    const half = o.width / 2 / len;
    const t0 = Math.max(0, o.t - half);
    const t1 = Math.min(1, o.t + half);
    const a = map(lerp(wall.a, wall.b, t0));
    const b = map(lerp(wall.a, wall.b, t1));
    const col = o.kind === "door" ? MUTED : ACCENT;
    parts.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${col}" stroke-width="${Math.max(1, sw * 0.35).toFixed(1)}" stroke-dasharray="${o.kind === "door" ? "0" : "3 2"}" opacity="0.85"/>`,
    );
  }
  return parts.join("");
}

export function buildPlanSvg(project: Project, story: Story, opts?: { width?: number; height?: number }): string {
  const W = opts?.width ?? 700;
  const H = opts?.height ?? 520;
  const pad = 48;
  const b = projectBounds(project, story.id);
  const margin = 0.6;
  const min = { x: b.min.x - margin, y: b.min.y - margin };
  const max = { x: b.max.x + margin, y: b.max.y + margin };
  const { map, scale } = makeMapper(min, max, pad, W, H);
  const walls = project.walls.filter((w) => w.storyId === story.id);
  const rooms = project.rooms.filter((r) => r.storyId === story.id);
  const idx = project.stories.findIndex((s) => s.id === story.id);
  const role = storyRoleLabel(story, idx, project.stories);

  const roomShapes = rooms
    .map((r) => {
      if (r.polygon.length < 3) return "";
      const c = polygonCentroid(r.polygon);
      const mc = map(c);
      const area = polygonArea(r.polygon);
      return [
        `<polygon points="${polyPoints(r.polygon, map)}" fill="${FILL_ROOM}" stroke="#ddd8cc" stroke-width="0.6"/>`,
        `<text x="${mc.x.toFixed(1)}" y="${(mc.y - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="${INK}" font-family="system-ui,sans-serif">${esc(r.name)}</text>`,
        `<text x="${mc.x.toFixed(1)}" y="${(mc.y + 10).toFixed(1)}" text-anchor="middle" font-size="9" fill="${MUTED}" font-family="system-ui,sans-serif" font-variant-numeric="tabular-nums">${area.toFixed(1)} m²</text>`,
      ].join("");
    })
    .join("");

  const wallShapes = walls.map((w) => wallStroke(w, project.openings, map, scale)).join("");

  const title = `${role} · ${story.name || role} · +${story.elevation.toFixed(2)} m · HSP ${story.height.toFixed(2)} m`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Plan ${esc(role)}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<text x="24" y="28" font-size="13" font-weight="700" fill="${INK}" font-family="system-ui,sans-serif" letter-spacing="0.04em">${esc(title)}</text>`,
    `<line x1="24" y1="36" x2="${W - 24}" y2="36" stroke="${ACCENT}" stroke-width="2"/>`,
    roomShapes,
    wallShapes,
    northArrow(W - 48, 72, project.meta.north ?? 0),
    scaleBar(24, H - 28, scale),
    `</svg>`,
  ].join("");
}

export function buildCoupeSvg(project: Project, opts?: { width?: number; height?: number }): string {
  const W = opts?.width ?? 700;
  const H = opts?.height ?? 420;
  const stories = [...project.stories].sort((a, b) => a.elevation - b.elevation);
  if (stories.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="24" y="40" fill="${MUTED}">Aucun niveau</text></svg>`;
  }
  const b = projectBounds(project);
  const depth = Math.max(1, b.max.y - b.min.y);
  const width = Math.max(1, b.max.x - b.min.x);
  const minElev = Math.min(...stories.map((s) => s.elevation));
  const maxElev = Math.max(...stories.map((s) => s.elevation + s.height));
  const spanH = Math.max(1, maxElev - minElev);
  const padX = 80;
  const padY = 56;
  const usableW = W - padX * 2;
  const usableH = H - padY * 2;
  const sx = usableW / width;
  const sy = usableH / spanH;
  const scale = Math.min(sx, sy * 0.85);
  const boxW = width * scale;
  const ox = (W - boxW) / 2;
  const groundY = padY + (maxElev - 0) * scale; // elev 0 line

  const boxes = stories
    .map((st, i) => {
      const top = padY + (maxElev - (st.elevation + st.height)) * scale;
      const h = st.height * scale;
      const role = storyRoleLabel(st, project.stories.indexOf(st), project.stories);
      const isBasement = st.elevation < -0.05 || st.role === "basement";
      const fill = isBasement ? "#e8e4db" : i % 2 === 0 ? "#faf8f4" : "#f0ede6";
      return [
        `<rect x="${ox.toFixed(1)}" y="${top.toFixed(1)}" width="${boxW.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" stroke="${INK}" stroke-width="1.4"/>`,
        `<text x="${(ox + 10).toFixed(1)}" y="${(top + h / 2 + 4).toFixed(1)}" font-size="11" font-weight="600" fill="${INK}" font-family="system-ui,sans-serif">${esc(role)}</text>`,
        `<text x="${(ox + boxW - 10).toFixed(1)}" y="${(top + h / 2 + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="${MUTED}" font-family="system-ui,sans-serif" font-variant-numeric="tabular-nums">${st.height.toFixed(2)} m</text>`,
        `<text x="${(ox - 8).toFixed(1)}" y="${(top + 4).toFixed(1)}" text-anchor="end" font-size="8" fill="${MUTED}" font-family="system-ui,sans-serif" font-variant-numeric="tabular-nums">+${(st.elevation + st.height).toFixed(2)}</text>`,
      ].join("");
    })
    .join("");

  const clipNote = `Coupe schématique · profondeur ${depth.toFixed(1)} m · hors toiture détaillée`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<text x="24" y="28" font-size="13" font-weight="700" fill="${INK}" font-family="system-ui,sans-serif">Coupe schématique</text>`,
    `<line x1="24" y1="36" x2="${W - 24}" y2="36" stroke="${ACCENT}" stroke-width="2"/>`,
    // Ground line
    `<line x1="${(ox - 20).toFixed(1)}" y1="${groundY.toFixed(1)}" x2="${(ox + boxW + 20).toFixed(1)}" y2="${groundY.toFixed(1)}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="4 3"/>`,
    `<text x="${(ox + boxW + 24).toFixed(1)}" y="${(groundY + 3).toFixed(1)}" font-size="8" fill="${MUTED}" font-family="system-ui,sans-serif">TN</text>`,
    boxes,
    `<text x="24" y="${H - 16}" font-size="9" fill="${MUTED}" font-family="system-ui,sans-serif">${esc(clipNote)}</text>`,
    `</svg>`,
  ].join("");
}

type FacadeFacing = "sud" | "nord" | "est" | "ouest";

function facadeLabel(f: FacadeFacing): string {
  return { sud: "Façade Sud", nord: "Façade Nord", est: "Façade Est", ouest: "Façade Ouest" }[f];
}

/** Pick long & short sides: prefer Sud/Nord (Y-aligned walls) then Est/Ouest. */
export function pickFacades(project: Project): [FacadeFacing, FacadeFacing] {
  const walls = project.walls.filter((w) => (w.role ?? "exterior") !== "interior" && !w.partition);
  let yLen = 0;
  let xLen = 0;
  for (const w of walls) {
    const ang = Math.abs(Math.sin(wallAngle(w)));
    const len = wallLength(w);
    if (ang < 0.5) yLen += len; // roughly E-W wall → faces N/S
    else xLen += len;
  }
  if (yLen >= xLen) return ["sud", "nord"];
  return ["est", "ouest"];
}

function projectOpeningToFacade(
  wall: Wall,
  o: Opening,
  facing: FacadeFacing,
): { u0: number; u1: number; z0: number; z1: number } | null {
  const ang = wallAngle(wall);
  // Wall facing: normal points "outward" approx; we match walls whose run is perpendicular to view
  const isEW = Math.abs(Math.sin(ang)) < 0.55; // wall runs E-W → faces N or S
  const isNS = Math.abs(Math.cos(ang)) < 0.55; // wall runs N-S → faces E or W
  if ((facing === "sud" || facing === "nord") && !isEW) return null;
  if ((facing === "est" || facing === "ouest") && !isNS) return null;

  // Prefer exterior walls on the extreme side
  const mid = lerp(wall.a, wall.b, 0.5);
  // For sud: prefer walls with larger world Y (south if +Y is north… actually in plan +Y often north)
  // We include all matching orientation walls; filter by side later.

  const len = wallLength(wall);
  const half = o.width / 2;
  const uCenter =
    facing === "sud" || facing === "nord"
      ? lerp(wall.a, wall.b, o.t).x
      : lerp(wall.a, wall.b, o.t).y;
  // Use parametric along wall projected on façade axis
  const u0 =
    facing === "sud" || facing === "nord"
      ? lerp(wall.a, wall.b, Math.max(0, o.t - half / len)).x
      : lerp(wall.a, wall.b, Math.max(0, o.t - half / len)).y;
  const u1 =
    facing === "sud" || facing === "nord"
      ? lerp(wall.a, wall.b, Math.min(1, o.t + half / len)).x
      : lerp(wall.a, wall.b, Math.min(1, o.t + half / len)).y;

  void mid;
  void uCenter;
  return { u0: Math.min(u0, u1), u1: Math.max(u0, u1), z0: o.sill, z1: o.sill + o.height };
}

function facadeWalls(project: Project, facing: FacadeFacing): Wall[] {
  const b = projectBounds(project);
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  return project.walls.filter((w) => {
    if (w.partition || w.role === "interior") return false;
    const ang = wallAngle(w);
    const isEW = Math.abs(Math.sin(ang)) < 0.55;
    const isNS = Math.abs(Math.cos(ang)) < 0.55;
    const mid = lerp(w.a, w.b, 0.5);
    if (facing === "sud") return isEW && mid.y <= cy + 0.01;
    if (facing === "nord") return isEW && mid.y >= cy - 0.01;
    if (facing === "est") return isNS && mid.x >= cx - 0.01;
    if (facing === "ouest") return isNS && mid.x <= cx + 0.01;
    return false;
  });
}

export function buildFacadeSvg(
  project: Project,
  facing: FacadeFacing,
  opts?: { width?: number; height?: number },
): string {
  const W = opts?.width ?? 700;
  const H = opts?.height ?? 360;
  const stories = [...project.stories].sort((a, b) => a.elevation - b.elevation);
  const b = projectBounds(project);
  const axisMin = facing === "sud" || facing === "nord" ? b.min.x : b.min.y;
  const axisMax = facing === "sud" || facing === "nord" ? b.max.x : b.max.y;
  const minElev = Math.min(0, ...stories.map((s) => s.elevation));
  const maxElev = Math.max(...stories.map((s) => s.elevation + s.height), 3);
  const spanU = Math.max(1, axisMax - axisMin);
  const spanZ = Math.max(1, maxElev - minElev);
  const padX = 56;
  const padY = 48;
  const scale = Math.min((W - padX * 2) / spanU, (H - padY * 2) / spanZ);
  const ox = (W - spanU * scale) / 2;
  const mapU = (u: number) => ox + (u - axisMin) * scale;
  const mapZ = (z: number) => padY + (maxElev - z) * scale;

  const walls = facadeWalls(project, facing);
  // Outline per story: rectangle of building envelope on this façade
  const storyBoxes = stories
    .map((st) => {
      const x0 = mapU(axisMin);
      const x1 = mapU(axisMax);
      const y0 = mapZ(st.elevation + st.height);
      const y1 = mapZ(st.elevation);
      return `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" fill="#faf8f4" stroke="${INK}" stroke-width="1.2"/>`;
    })
    .join("");

  const openings: string[] = [];
  for (const w of walls.length ? walls : project.walls.filter((ww) => !ww.partition)) {
    const story = project.stories.find((s) => s.id === w.storyId);
    if (!story) continue;
    for (const o of project.openings) {
      if (o.wallId !== w.id) continue;
      const proj = projectOpeningToFacade(w, o, facing);
      if (!proj) continue;
      // If we fell back to all walls, still check orientation
      const x0 = mapU(proj.u0);
      const x1 = mapU(proj.u1);
      const y0 = mapZ(story.elevation + proj.z1);
      const y1 = mapZ(story.elevation + proj.z0);
      const fill = o.kind === "window" ? "rgba(110,208,195,0.35)" : "#e8e4db";
      openings.push(
        `<rect x="${Math.min(x0, x1).toFixed(1)}" y="${y0.toFixed(1)}" width="${Math.abs(x1 - x0).toFixed(1)}" height="${Math.abs(y1 - y0).toFixed(1)}" fill="${fill}" stroke="${INK}" stroke-width="0.8"/>`,
      );
    }
  }

  // If no openings matched orientation, try all openings on exterior-ish walls with looser filter
  if (openings.length === 0) {
    for (const w of project.walls) {
      if (w.partition) continue;
      const story = project.stories.find((s) => s.id === w.storyId);
      if (!story) continue;
      const ang = wallAngle(w);
      const isEW = Math.abs(Math.sin(ang)) < 0.55;
      const isNS = Math.abs(Math.cos(ang)) < 0.55;
      if ((facing === "sud" || facing === "nord") && !isEW) continue;
      if ((facing === "est" || facing === "ouest") && !isNS) continue;
      for (const o of project.openings) {
        if (o.wallId !== w.id) continue;
        const len = wallLength(w);
        if (len < 0.05) continue;
        const half = o.width / 2 / len;
        const p0 = lerp(w.a, w.b, Math.max(0, o.t - half));
        const p1 = lerp(w.a, w.b, Math.min(1, o.t + half));
        const u0 = facing === "sud" || facing === "nord" ? p0.x : p0.y;
        const u1 = facing === "sud" || facing === "nord" ? p1.x : p1.y;
        const x0 = mapU(Math.min(u0, u1));
        const x1 = mapU(Math.max(u0, u1));
        const y0 = mapZ(story.elevation + o.sill + o.height);
        const y1 = mapZ(story.elevation + o.sill);
        const fill = o.kind === "window" ? "rgba(110,208,195,0.35)" : "#e8e4db";
        openings.push(
          `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" fill="${fill}" stroke="${INK}" stroke-width="0.8"/>`,
        );
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    `<text x="24" y="28" font-size="13" font-weight="700" fill="${INK}" font-family="system-ui,sans-serif">${facadeLabel(facing)}</text>`,
    `<line x1="24" y1="36" x2="${W - 24}" y2="36" stroke="${ACCENT}" stroke-width="2"/>`,
    storyBoxes,
    openings.join(""),
    `<text x="24" y="${H - 14}" font-size="9" fill="${MUTED}" font-family="system-ui,sans-serif">Élévation orthographique · baies projetées</text>`,
    `</svg>`,
  ].join("");
}

export { storyRoleLabel, facadeLabel };
export type { FacadeFacing };
