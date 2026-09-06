/**
 * Agents copilote — transforms locales déterministes (offline).
 * Chaque agent : (project, opts) => Project + résumé.
 */
import { addOpeningOnWall, addRectRooms, cloneProject } from "@/lib/bim/builder";
import { strokesToWalls, surveyPolygonToWalls } from "@/lib/bim/survey-to-walls";
import {
  projectBounds,
  rectPolygon,
  wallLength,
  wallMid,
} from "@/lib/bim/geometry";
import type { Opening, Project, RoomFunction, Vec2, Wall } from "@/lib/bim/types";
import { uid } from "@/lib/utils";
import {
  inferStoryRoles,
  markStoryRole,
  propagateIntoTypicalGroup,
  typicalGroupSize,
} from "@/lib/cad/typical";
import { restackStories } from "@/lib/cad/ops";

export type AgentId =
  | "facadeGrid"
  | "punchAttic"
  | "packUnits"
  | "linkTypicals"
  | "alignNorthGlazing"
  | "releveMurs";

export type AgentOpts = {
  storyId?: string | null;
  /** Module façade (m) — défaut 1.35 */
  spacing?: number;
  sill?: number;
  winW?: number;
  winH?: number;
  /** Retrait attique (m) — défaut 1.2 */
  setback?: number;
  /** Pack T2 (défaut) ou T3 */
  unitKind?: "T2" | "T3";
  /** Propager dans le groupe type après link */
  propagate?: boolean;
  /** Appliquer baies sur tous les étages types (sinon étage actif + live-sync) */
  allTypicals?: boolean;
  /** Vectoriser traits plutôt que polygone relevé */
  fromStrokes?: boolean;
};

export type AgentResult = {
  project: Project;
  agentId: AgentId;
  label: string;
  summary: string;
  stats: Record<string, number>;
};

export type ParsedIntent =
  | { kind: "agent"; id: AgentId; opts: AgentOpts; label: string }
  | { kind: "generate" }
  | { kind: "analyze" }
  | { kind: "unknown" };

export const AGENT_CHIPS: {
  id: AgentId;
  label: string;
  opts?: AgentOpts;
  needsWalls: boolean;
  /** Relevé → murs : ≥3 points survey (ou traits si fromStrokes). */
  needsSurvey?: boolean;
}[] = [
  { id: "releveMurs", label: "Relevé → murs", opts: {}, needsWalls: false, needsSurvey: true },
  { id: "facadeGrid", label: "Baies 1,35 m", opts: { spacing: 1.35 }, needsWalls: true },
  { id: "alignNorthGlazing", label: "Baies sud", opts: {}, needsWalls: true },
  { id: "punchAttic", label: "Attique −1,2 m", opts: { setback: 1.2 }, needsWalls: true },
  { id: "packUnits", label: "Pack T2", opts: { unitKind: "T2" }, needsWalls: true },
  { id: "linkTypicals", label: "Propager types", opts: { propagate: true }, needsWalls: false },
];

const AGENT_LABELS: Record<AgentId, string> = {
  facadeGrid: "baies",
  punchAttic: "attique",
  packUnits: "pack logements",
  linkTypicals: "types liés",
  alignNorthGlazing: "baies sud",
  releveMurs: "relevé → murs",
};

function resolveStoryId(p: Project, storyId?: string | null): string | null {
  if (storyId && p.stories.some((s) => s.id === storyId)) return storyId;
  return p.stories[0]?.id ?? null;
}

function storyWalls(p: Project, storyId: string): Wall[] {
  return p.walls.filter((w) => w.storyId === storyId);
}

function exteriorWalls(p: Project, storyId: string): Wall[] {
  const walls = storyWalls(p, storyId);
  const byRole = walls.filter((w) => w.role === "exterior");
  if (byRole.length >= 2) return byRole;
  const b = projectBounds(p, storyId);
  const eps = 0.45;
  return walls.filter((w) => {
    const m = wallMid(w);
    return (
      Math.abs(m.x - b.min.x) < eps ||
      Math.abs(m.x - b.max.x) < eps ||
      Math.abs(m.y - b.min.y) < eps ||
      Math.abs(m.y - b.max.y) < eps
    );
  });
}

function openingsOnWall(p: Project, wallId: string): Opening[] {
  return p.openings.filter((o) => o.wallId === wallId);
}

function clashesOpening(
  existing: Opening[],
  t: number,
  len: number,
  winW: number,
): boolean {
  return existing.some((o) => Math.abs(o.t - t) * len < (o.width + winW) * 0.55);
}

function punchGridOnWalls(
  p: Project,
  walls: Wall[],
  opts: { spacing: number; sill: number; winW: number; winH: number; replaceWindows: boolean },
): { project: Project; placed: number } {
  let next = p;
  let placed = 0;
  const wallIds = new Set(walls.map((w) => w.id));

  if (opts.replaceWindows) {
    next = cloneProject(next);
    next.openings = next.openings.filter((o) => {
      if (!wallIds.has(o.wallId)) return true;
      return o.kind === "door";
    });
  }

  for (const wall of walls) {
    const len = wallLength(wall);
    if (len < 1.4) continue;
    const margin = Math.max(0.55, opts.winW * 0.55);
    const usable = len - 2 * margin;
    if (usable < opts.winW * 0.75) continue;
    const count = Math.max(1, Math.floor((usable + opts.spacing * 0.25) / opts.spacing));
    const step = usable / count;
    for (let i = 0; i < count; i++) {
      const along = margin + step * (i + 0.5);
      const t = along / len;
      const existing = openingsOnWall(next, wall.id);
      if (clashesOpening(existing, t, len, opts.winW)) continue;
      next = addOpeningOnWall(next, wall, "window", t, opts.winW, opts.winH, opts.sill);
      placed++;
    }
  }
  return { project: next, placed };
}

/** Plus longue façade sud (Y min = sud si nord = +Y). */
function southExteriorWall(p: Project, storyId: string): Wall | null {
  const walls = exteriorWalls(p, storyId);
  if (!walls.length) return null;
  const b = projectBounds(p, storyId);
  const eps = 0.55;
  const south = walls.filter((w) => Math.abs(wallMid(w).y - b.min.y) < eps);
  const pool = south.length ? south : walls;
  return [...pool].sort((a, b) => wallLength(b) - wallLength(a))[0] ?? null;
}

function clearStoryPlate(p: Project, storyId: string): Project {
  const next = cloneProject(p);
  const wallIds = new Set(next.walls.filter((w) => w.storyId === storyId).map((w) => w.id));
  next.walls = next.walls.filter((w) => w.storyId !== storyId);
  next.rooms = next.rooms.filter((r) => r.storyId !== storyId);
  next.openings = next.openings.filter((o) => !wallIds.has(o.wallId));
  next.columns = next.columns.filter((c) => c.storyId !== storyId);
  next.stairs = next.stairs.filter((s) => s.storyId !== storyId);
  next.furniture = next.furniture.filter((f) => f.storyId !== storyId);
  next.slabs = next.slabs.filter((s) => s.storyId !== storyId);
  return next;
}

function markExteriorFromBounds(p: Project, storyId: string, min: Vec2, max: Vec2): Project {
  const eps = 0.4;
  p.walls = p.walls.map((w) => {
    if (w.storyId !== storyId) return w;
    const m = wallMid(w);
    const exterior =
      Math.abs(m.x - min.x) < eps ||
      Math.abs(m.x - max.x) < eps ||
      Math.abs(m.y - min.y) < eps ||
      Math.abs(m.y - max.y) < eps;
    return {
      ...w,
      role: exterior ? ("exterior" as const) : ("interior" as const),
      partition: !exterior && w.thickness < 0.25,
      loadBearing: exterior || w.thickness >= 0.25,
    };
  });
  return p;
}

function insetFootprint(
  p: Project,
  storyId: string,
  setback: number,
): { project: Project; min: Vec2; max: Vec2 } {
  const b = projectBounds(p, storyId);
  const sb = Math.max(0, setback);
  // Retrait façade sud (Y min) comme massing + léger retrait latéral pour honnêteté attique
  const min = { x: b.min.x + sb * 0.35, y: b.min.y + sb };
  const max = { x: b.max.x - sb * 0.35, y: b.max.y - sb * 0.15 };
  if (max.x - min.x < 5 || max.y - min.y < 5) {
    return { project: p, min: b.min, max: b.max };
  }
  const st = p.stories.find((s) => s.id === storyId);
  const h = st?.height ?? 2.8;
  let next = clearStoryPlate(p, storyId);
  const w = max.x - min.x;
  const d = max.y - min.y;
  next = addRectRooms(
    next,
    [{ x: min.x, y: min.y, w, d, name: "Attique", fn: "living" as RoomFunction, storyId }],
    { wallMat: "concrete", thickness: 0.28, height: h },
  );
  next = markExteriorFromBounds(next, storyId, min, max);
  next.slabs.push({
    id: uid("sl"),
    storyId,
    polygon: rectPolygon(min.x, min.y, w, d),
    thickness: 0.22,
    materialId: "concrete",
    structural: true,
  });
  // Baies légères sur le nouvel attique
  const punched = punchGridOnWalls(next, exteriorWalls(next, storyId), {
    spacing: 1.8,
    sill: 0.9,
    winW: 1.4,
    winH: 1.35,
    replaceWindows: false,
  });
  return { project: punched.project, min, max };
}

export function facadeGrid(project: Project, opts: AgentOpts = {}): AgentResult {
  let p = cloneProject(project);
  const storyId = resolveStoryId(p, opts.storyId);
  if (!storyId) {
    return { project: p, agentId: "facadeGrid", label: AGENT_LABELS.facadeGrid, summary: "Aucun étage", stats: { fenêtres: 0 } };
  }
  const spacing = Math.min(4, Math.max(0.9, opts.spacing ?? 1.35));
  const sill = Math.min(1.4, Math.max(0.2, opts.sill ?? 0.9));
  const winW = Math.min(2.4, Math.max(0.9, opts.winW ?? 1.35));
  const winH = Math.min(2.4, Math.max(0.9, opts.winH ?? 1.4));

  const targets: string[] = [storyId];
  if (opts.allTypicals) {
    p = inferStoryRoles(p);
    const group = p.stories.find((s) => s.id === storyId)?.typicalGroup;
    for (const st of p.stories) {
      if (st.role === "typical" && !st.detached && st.typicalGroup === group && st.id !== storyId) {
        targets.push(st.id);
      }
    }
  }

  let placed = 0;
  for (const sid of targets) {
    const walls = exteriorWalls(p, sid);
    const r = punchGridOnWalls(p, walls, { spacing, sill, winW, winH, replaceWindows: true });
    p = r.project;
    placed += r.placed;
  }

  const linked = typicalGroupSize(p, storyId);
  const summary = `Agent baies · ${placed} fenêtres${linked > 1 ? ` · ${linked} types liés` : ""}`;
  return {
    project: p,
    agentId: "facadeGrid",
    label: AGENT_LABELS.facadeGrid,
    summary,
    stats: { fenêtres: placed, types: linked },
  };
}

export function punchAttic(project: Project, opts: AgentOpts = {}): AgentResult {
  let p = cloneProject(project);
  p = inferStoryRoles(p);
  if (!p.stories.length) {
    return { project: p, agentId: "punchAttic", label: AGENT_LABELS.punchAttic, summary: "Aucun étage", stats: {} };
  }
  const setback = Math.min(4, Math.max(0, opts.setback ?? 1.2));
  // Prefer last non-basement story; if active is attic-ish use it
  let targetId = resolveStoryId(p, opts.storyId) ?? p.stories[p.stories.length - 1]!.id;
  const active = p.stories.find((s) => s.id === targetId);
  if (active?.role === "basement" || active?.role === "ground") {
    targetId = p.stories[p.stories.length - 1]!.id;
  }
  p = markStoryRole(p, targetId, "attic");
  const st = p.stories.find((s) => s.id === targetId)!;
  // Rename hint
  if (!/attique|comble/i.test(st.name)) {
    p.stories = p.stories.map((s) => (s.id === targetId ? { ...s, name: "Attique" } : s));
  }

  let shrunk = false;
  if (setback > 0.05 && storyWalls(p, targetId).length > 0) {
    const r = insetFootprint(p, targetId, setback);
    p = r.project;
    shrunk = true;
  }
  p = restackStories(p);
  const summary = shrunk
    ? `Agent attique · retrait ${setback.toFixed(1).replace(".", ",")} m · emprise réduite`
    : `Agent attique · étage marqué attique`;
  return {
    project: p,
    agentId: "punchAttic",
    label: AGENT_LABELS.punchAttic,
    summary,
    stats: { setback, fenêtres: p.openings.filter((o) => {
      const w = p.walls.find((x) => x.id === o.wallId);
      return w?.storyId === targetId && o.kind === "window";
    }).length },
  };
}

export function packUnits(project: Project, opts: AgentOpts = {}): AgentResult {
  let p = cloneProject(project);
  const storyId = resolveStoryId(p, opts.storyId);
  if (!storyId) {
    return { project: p, agentId: "packUnits", label: AGENT_LABELS.packUnits, summary: "Aucun étage", stats: { logements: 0 } };
  }
  const kind = opts.unitKind ?? "T2";
  const b = projectBounds(p, storyId);
  const width = b.max.x - b.min.x;
  const depth = b.max.y - b.min.y;
  if (width < 8 || depth < 7) {
    return {
      project: p,
      agentId: "packUnits",
      label: AGENT_LABELS.packUnits,
      summary: "Emprise trop petite pour un pack honnête (min ~8×7 m)",
      stats: { logements: 0 },
    };
  }

  const st = p.stories.find((s) => s.id === storyId);
  const h = st?.height ?? 2.8;
  const ox = b.min.x;
  const oy = b.min.y;
  const corridorW = Math.min(1.8, Math.max(1.4, width * 0.1));

  type Spec = { x: number; y: number; w: number; d: number; name: string; fn: RoomFunction; storyId: string };
  const rooms: Spec[] = [];

  // Corridor central sur la profondeur
  const cx = ox + (width - corridorW) / 2;
  rooms.push({
    x: cx,
    y: oy,
    w: corridorW,
    d: depth,
    name: "Circulation",
    fn: "corridor",
    storyId,
  });

  const leftW = cx - ox;
  const rightW = ox + width - (cx + corridorW);
  const unitCount = leftW >= 4.5 && rightW >= 4.5 ? (width >= 16 ? 3 : 2) : 1;

  const makeFlat = (x: number, y: number, w: number, d: number, label: string) => {
    if (kind === "T3" && w >= 6.5 && d >= 8) {
      const livingD = d * 0.42;
      const bedD = d * 0.32;
      const bathW = Math.min(2.2, w * 0.35);
      rooms.push({ x, y, w, d: livingD, name: `${label} séjour`, fn: "living", storyId });
      rooms.push({ x, y: y + livingD, w: w - bathW, d: bedD, name: `${label} ch.1`, fn: "bedroom", storyId });
      rooms.push({ x: x + w - bathW, y: y + livingD, w: bathW, d: bedD, name: `${label} SDB`, fn: "bath", storyId });
      rooms.push({ x, y: y + livingD + bedD, w: w * 0.55, d: d - livingD - bedD, name: `${label} ch.2`, fn: "bedroom", storyId });
      rooms.push({
        x: x + w * 0.55,
        y: y + livingD + bedD,
        w: w * 0.45,
        d: d - livingD - bedD,
        name: `${label} cuisine`,
        fn: "kitchen",
        storyId,
      });
    } else {
      // T2 rect packing
      const livingD = d * 0.48;
      const rest = d - livingD;
      rooms.push({ x, y, w, d: livingD, name: `${label} séjour`, fn: "living", storyId });
      if (w >= 5.5) {
        const bedW = w * 0.58;
        rooms.push({ x, y: y + livingD, w: bedW, d: rest, name: `${label} chambre`, fn: "bedroom", storyId });
        rooms.push({
          x: x + bedW,
          y: y + livingD,
          w: w - bedW,
          d: rest * 0.55,
          name: `${label} SDB`,
          fn: "bath",
          storyId,
        });
        rooms.push({
          x: x + bedW,
          y: y + livingD + rest * 0.55,
          w: w - bedW,
          d: rest * 0.45,
          name: `${label} cuisine`,
          fn: "kitchen",
          storyId,
        });
      } else {
        rooms.push({ x, y: y + livingD, w, d: rest * 0.65, name: `${label} chambre`, fn: "bedroom", storyId });
        rooms.push({
          x,
          y: y + livingD + rest * 0.65,
          w,
          d: rest * 0.35,
          name: `${label} SDB`,
          fn: "bath",
          storyId,
        });
      }
    }
  };

  if (unitCount === 1) {
    if (leftW >= rightW) makeFlat(ox, oy, leftW, depth, "A");
    else makeFlat(cx + corridorW, oy, rightW, depth, "A");
  } else if (unitCount === 2) {
    makeFlat(ox, oy, leftW, depth, "A");
    makeFlat(cx + corridorW, oy, rightW, depth, "B");
  } else {
    // 3: split left into 2 stacked, right one big — or split both sides
    const halfD = depth / 2;
    if (leftW >= 5 && rightW >= 5) {
      makeFlat(ox, oy, leftW, halfD - 0.05, "A");
      makeFlat(ox, oy + halfD, leftW, halfD, "B");
      makeFlat(cx + corridorW, oy, rightW, depth, "C");
    } else {
      makeFlat(ox, oy, leftW, depth, "A");
      makeFlat(cx + corridorW, oy, rightW, depth, "B");
    }
  }

  // Deduce real flat count from labels
  const flatLabels = new Set(
    rooms.filter((r) => r.fn !== "corridor").map((r) => r.name.split(" ")[0]!),
  );
  const nFlats = Math.max(1, flatLabels.size);

  p = clearStoryPlate(p, storyId);
  p = addRectRooms(p, rooms, { wallMat: "concrete", thickness: 0.2, height: h });
  // Thicken exterior
  p = markExteriorFromBounds(p, storyId, b.min, b.max);
  p.walls = p.walls.map((w) => {
    if (w.storyId !== storyId) return w;
    if (w.role === "exterior") return { ...w, thickness: 0.28, loadBearing: true, partition: false };
    return { ...w, thickness: 0.12, partition: true, loadBearing: false, role: "interior" as const };
  });
  p.slabs.push({
    id: uid("sl"),
    storyId,
    polygon: rectPolygon(ox, oy, width, depth),
    thickness: 0.22,
    materialId: "concrete",
    structural: true,
  });

  // Light façade windows if none
  const hasWin = p.openings.some((o) => {
    const w = p.walls.find((x) => x.id === o.wallId);
    return w?.storyId === storyId && o.kind === "window";
  });
  if (!hasWin) {
    const punched = punchGridOnWalls(p, exteriorWalls(p, storyId), {
      spacing: 1.8,
      sill: 0.9,
      winW: 1.35,
      winH: 1.4,
      replaceWindows: false,
    });
    p = punched.project;
  }

  const linked = typicalGroupSize(p, storyId);
  const summary = `Agent pack ${kind} · ${nFlats} logement${nFlats > 1 ? "s" : ""}${linked > 1 ? ` · ${linked} types liés` : ""}`;
  return {
    project: p,
    agentId: "packUnits",
    label: AGENT_LABELS.packUnits,
    summary,
    stats: { logements: nFlats, pièces: rooms.length, types: linked },
  };
}

export function linkTypicals(project: Project, opts: AgentOpts = {}): AgentResult {
  let p = cloneProject(project);
  p = inferStoryRoles(p);
  const storyId = resolveStoryId(p, opts.storyId) ?? p.stories.find((s) => s.role === "typical")?.id ?? p.stories[0]?.id;
  if (!storyId) {
    return { project: p, agentId: "linkTypicals", label: AGENT_LABELS.linkTypicals, summary: "Aucun étage", stats: { types: 0 } };
  }
  // Ensure typicals share a group
  const group = p.stories.find((s) => s.typicalGroup)?.typicalGroup ?? "typ_1";
  p.stories = p.stories.map((s) => {
    if (s.role === "typical" && !s.detached) return { ...s, typicalGroup: group };
    return s;
  });

  let propagated = 0;
  if (opts.propagate !== false) {
    const before = p.walls.length;
    p = propagateIntoTypicalGroup(p, storyId);
    void before;
    propagated = typicalGroupSize(p, storyId);
  } else {
    propagated = typicalGroupSize(p, storyId);
  }

  const n = Math.max(propagated, p.stories.filter((s) => s.role === "typical" && !s.detached).length);
  const summary = `Agent types · ${n} étages liés`;
  return {
    project: p,
    agentId: "linkTypicals",
    label: AGENT_LABELS.linkTypicals,
    summary,
    stats: { types: n },
  };
}

export function alignNorthGlazing(project: Project, opts: AgentOpts = {}): AgentResult {
  let p = cloneProject(project);
  const storyId = resolveStoryId(p, opts.storyId);
  if (!storyId) {
    return {
      project: p,
      agentId: "alignNorthGlazing",
      label: AGENT_LABELS.alignNorthGlazing,
      summary: "Aucun étage",
      stats: { fenêtres: 0 },
    };
  }
  const wall = southExteriorWall(p, storyId);
  if (!wall) {
    return {
      project: p,
      agentId: "alignNorthGlazing",
      label: AGENT_LABELS.alignNorthGlazing,
      summary: "Aucune façade sud trouvée",
      stats: { fenêtres: 0 },
    };
  }

  const spacing = Math.min(2.2, Math.max(1.0, opts.spacing ?? 1.15));
  const sill = opts.sill ?? 0.35;
  const winW = Math.min(2.8, Math.max(1.4, opts.winW ?? 1.8));
  const winH = Math.min(2.6, Math.max(1.2, opts.winH ?? 2.1));

  // Remove windows on this wall only (keep doors)
  p = cloneProject(p);
  p.openings = p.openings.filter((o) => !(o.wallId === wall.id && o.kind === "window"));

  const r = punchGridOnWalls(p, [wall], {
    spacing,
    sill,
    winW,
    winH,
    replaceWindows: false,
  });
  p = r.project;
  const linked = typicalGroupSize(p, storyId);
  const summary = `Agent baies sud · ${r.placed} fenêtres${linked > 1 ? ` · ${linked} types liés` : ""}`;
  return {
    project: p,
    agentId: "alignNorthGlazing",
    label: AGENT_LABELS.alignNorthGlazing,
    summary,
    stats: { fenêtres: r.placed, types: linked },
  };
}


export function releveMurs(project: Project, opts: AgentOpts = {}): AgentResult {
  const p0 = cloneProject(project);
  const storyId = resolveStoryId(p0, opts.storyId);
  if (!storyId) {
    return {
      project: p0,
      agentId: "releveMurs",
      label: AGENT_LABELS.releveMurs,
      summary: "Aucun étage",
      stats: { murs: 0 },
    };
  }
  const fromStrokes = !!opts.fromStrokes;
  let r = fromStrokes
    ? strokesToWalls(p0, storyId)
    : surveyPolygonToWalls(p0, storyId);

  if (r.wallCount === 0 && !fromStrokes) {
    const alt = strokesToWalls(p0, storyId);
    if (alt.wallCount > 0) r = alt;
  }

  if (r.wallCount === 0) {
    return {
      project: p0,
      agentId: "releveMurs",
      label: AGENT_LABELS.releveMurs,
      summary: fromStrokes
        ? "Aucun trait à vectoriser (≥2 points)"
        : "Relevé insuffisant (≥3 points)",
      stats: { murs: 0 },
    };
  }

  const summary = `Relevé · ${r.wallCount} murs · ${r.perimeter.toFixed(1)} m`;
  return {
    project: r.project,
    agentId: "releveMurs",
    label: AGENT_LABELS.releveMurs,
    summary,
    stats: { murs: r.wallCount, périmètre: Math.round(r.perimeter * 10) / 10 },
  };
}

const AGENTS: Record<AgentId, (p: Project, o?: AgentOpts) => AgentResult> = {
  facadeGrid,
  punchAttic,
  packUnits,
  linkTypicals,
  alignNorthGlazing,
  releveMurs,
};

export function runAgentTransform(id: AgentId, project: Project, opts: AgentOpts = {}): AgentResult {
  return AGENTS[id](project, opts);
}

export function projectHasWalls(project: Project | null | undefined, storyId?: string | null): boolean {
  if (!project) return false;
  if (storyId) return project.walls.some((w) => w.storyId === storyId);
  return project.walls.length > 0;
}

function parseNumberFr(text: string): number | undefined {
  const m = text.match(/(\d+[.,]\d+|\d+)\s*m?/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]!.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Routeur FR — keywords / regex, offline. */
export function parseAgentIntent(prompt: string): ParsedIntent {
  const t = prompt.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!t) return { kind: "unknown" };

  if (/\b(propager|types?\s+lie|lier\s+types|etages?\s+types?|sync(?:hroniser)?\s+types?)\b/.test(t)) {
    return { kind: "agent", id: "linkTypicals", opts: { propagate: true }, label: AGENT_LABELS.linkTypicals };
  }
  if (/\b(attique|setback|retrait|comble)\b/.test(t)) {
    const setback = parseNumberFr(t) ?? 1.2;
    return { kind: "agent", id: "punchAttic", opts: { setback }, label: AGENT_LABELS.punchAttic };
  }
  if (/\b(baies?\s+sud|ensoleillement|facade\s+sud|orientation\s+sud|sud\b.*baies?|baies?.*sud)\b/.test(t) ||
      (/\bsud\b/.test(t) && /\b(baie|fenetre|vitrage|glace)\b/.test(t))) {
    return { kind: "agent", id: "alignNorthGlazing", opts: {}, label: AGENT_LABELS.alignNorthGlazing };
  }
  if (/\b(t2|t3|logements?|appartements?|pack\s+t)\b/.test(t)) {
    const unitKind = /\bt3\b/.test(t) ? "T3" : "T2";
    return { kind: "agent", id: "packUnits", opts: { unitKind }, label: AGENT_LABELS.packUnits };
  }
  if (/\b(baies?|fenetres?|module\s+facade|grille\s+facade|1[,.]35)\b/.test(t)) {
    const spacing = parseNumberFr(t) ?? 1.35;
    return { kind: "agent", id: "facadeGrid", opts: { spacing }, label: AGENT_LABELS.facadeGrid };
  }

  if (/\b(vectoriser|traits?\s*(en|->|vers)?\s*murs?|murs?\s*depuis\s*traits?)\b/.test(t)) {
    return { kind: "agent", id: "releveMurs", opts: { fromStrokes: true }, label: AGENT_LABELS.releveMurs };
  }
  if (/\b(releve|murs?\s*depuis\s*releve|releve\s*(en|->|vers)?\s*murs?|fermer\s*(en\s*)?murs?)\b/.test(t)) {
    return { kind: "agent", id: "releveMurs", opts: {}, label: AGENT_LABELS.releveMurs };
  }

  // New massing / brief → generate
  if (
    /\b(maison|villa|immeuble|tour|loft|massing|generer|construis|batiment|rdc|r\+\d)\b/.test(t) ||
    /\d+\s*m[²2]/.test(t) ||
    /\b\d+\s*chambres?\b/.test(t)
  ) {
    return { kind: "generate" };
  }
  if (/\b(analys|conseil|avis|optimis|lumiere|structure|re2020)\b/.test(t)) {
    return { kind: "analyze" };
  }
  return { kind: "unknown" };
}
