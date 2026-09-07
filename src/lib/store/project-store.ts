import { create } from "zustand";
import { persist } from "zustand/middleware";
import { analyzeProject, type ProjectAnalysis } from "@/lib/bim/analysis";
import {
  addFurnitureAt,
  addOpeningOnWall,
  cloneProject,
  duplicateProject,
  emptyProject,
  touch,
} from "@/lib/bim/builder";
import { dist, findWallAt, snapVec, wallAngle, wallLength } from "@/lib/bim/geometry";
import { snapToSketch } from "@/lib/bim/snap";
import { mergeDetectedRooms } from "@/lib/bim/rooms";
import { seedProjects } from "@/lib/bim/seed";
import { activeLayerId, ensureSketch, resampleStroke } from "@/lib/bim/sketch";
import { strokesToWalls, surveyPolygonToWalls } from "@/lib/bim/survey-to-walls";
import type {
  FireRating,
  FurnitureKind,
  Glazing,
  MaterialId,
  MaterialStyle,
  OpeningVariant,
  Project,
  SketchLayer,
  SurveyUnderlay,
  Tool,
  Vec2,
  ViewMode,
  WallAlign,
  WallRole,
  WorkspaceMode,
} from "@/lib/bim/types";
import { uid } from "@/lib/utils";
import {
  createCollabSession,
  makeRoomCode,
  normalizeRoomCode,
  type CollabSession,
} from "@/lib/multiplayer/collab";
import type { PeerInfo } from "@/lib/multiplayer/p2p";
import { toast } from "sonner";
import { DEFAULT_LIGHTING, type Lighting } from "@/lib/render/lighting";
import { DEFAULT_NAV, type NavPrefs } from "@/lib/nav/prefs";
import { addRectWalls, cloneSelection, copyStory as duplicateStoryLevel, healWallEnds, orthoPoint, repeatStories as stackStories, restackStories, splitWallAt as splitWallOp, syncStoryGeometry, translateSelection } from "@/lib/cad/ops";
import { generateMassing, insertBasement, nameStories, propagateTypicalFloor, type MassingOpts } from "@/lib/cad/massing";
import {
  inferStoryRoles,
  isLiveTypical,
  markStoryRole as markStoryRoleOp,
  setStoryDetached as setStoryDetachedOp,
  syncTypicalFrom,
  type StoryRole,
} from "@/lib/cad/typical";
import {
  runAgentTransform,
  type AgentId,
  type AgentOpts,
  type AgentResult,
} from "@/lib/ai/agents";

const HISTORY_LIMIT = 40;

const DRAW_MEMORY: Tool[] = ["wall", "rect", "door", "window", "room", "column", "stair", "slab", "roof", "furniture", "pen", "survey"];

const DEFAULT_OPENING_DRAFT = {
  door: { width: 0.9, height: 2.1, sill: 0, variant: "single" as OpeningVariant },
  window: {
    width: 1.4,
    height: 1.35,
    sill: 0.9,
    variant: "casement" as OpeningVariant,
    glazing: "double" as Glazing,
  },
};

const DEFAULT_WALL_DRAFT = {
  thickness: 0.2,
  height: 2.8,
  materialId: "plaster" as MaterialId,
  loadBearing: true,
  partition: false,
  insulationMm: 80,
  role: "exterior" as WallRole,
  alignment: "center" as WallAlign,
  fireRating: "EI60" as FireRating,
};

interface StudioState {
  projects: Project[];
  currentId: string | null;
  selectedIds: string[];
  tool: Tool;
  view: ViewMode;
  workspace: WorkspaceMode;
  storyId: string | null;
  sunHour: number;
  lighting: Lighting;
  grid: boolean;
  snap: boolean;
  snapStep: number;
  ortho: boolean;
  clipY: number;
  furnitureKind: FurnitureKind;
  recentKinds: FurnitureKind[];
  lastDrawTool: Tool;
  wallDraft: {
    thickness: number;
    height: number;
    materialId: MaterialId;
    loadBearing: boolean;
    partition: boolean;
    insulationMm: number;
    role: WallRole;
    alignment: WallAlign;
    fireRating: FireRating;
  };
  openingDraft: typeof DEFAULT_OPENING_DRAFT;
  activeMaterialId: MaterialId;
  draft: Vec2 | null;
  measure: { a: Vec2; b: Vec2 } | null;
  buildPhase: number;
  playing: boolean;
  isolateStory: boolean;
  showStructure: boolean;
  physics: boolean;
  skill: "simple" | "pro";
  nav: NavPrefs;
  history: Project[];
  future: Project[];
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  setTool: (t: Tool) => void;
  setView: (v: ViewMode) => void;
  setWorkspace: (w: WorkspaceMode) => void;
  setStory: (id: string) => void;
  setSunHour: (h: number) => void;
  setLighting: (patch: Partial<Lighting>) => void;
  setClipY: (y: number) => void;
  setGrid: (v: boolean) => void;
  setSnap: (v: boolean) => void;
  setSnapStep: (v: number) => void;
  setOrtho: (v: boolean) => void;
  setFurnitureKind: (k: FurnitureKind) => void;
  setWallDraft: (patch: Partial<StudioState["wallDraft"]>) => void;
  setOpeningDraft: (kind: "door" | "window", patch: Partial<typeof DEFAULT_OPENING_DRAFT.door & typeof DEFAULT_OPENING_DRAFT.window>) => void;
  copyToNextStory: () => void;
  cycleStory: (dir?: 1 | -1) => void;
  setActiveMaterial: (id: MaterialId) => void;
  patchMaterial: (id: MaterialId, patch: Partial<MaterialStyle>) => void;
  applyMaterial: (id: MaterialId, scope: "selected" | "walls" | "all") => void;
  select: (ids: string[]) => void;
  current: () => Project | null;
  createBlank: (name?: string) => string;
  addProject: (p: Project) => void;
  openProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  resetExamples: () => void;
  duplicateProjectById: (id: string) => string | null;
  duplicateSelected: () => void;
  arraySelected: (count?: number) => void;
  applyDraftToSelection: () => void;
  commit: (mutator: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  addWall: (a: Vec2, b: Vec2) => void;
  addOpeningAt: (kind: "door" | "window", p: Vec2) => void;
  addFurniture: (p: Vec2) => void;
  addColumnAt: (p: Vec2) => void;
  addStairAt: (p: Vec2) => void;
  addSlabAt: (p: Vec2) => void;
  addRoofAt: (p: Vec2) => void;
  deleteSelected: () => void;
  updateSelectedWall: (patch: Partial<Project["walls"][number]>) => void;
  beginEdit: () => void;
  patchNow: (mutator: (p: Project) => Project) => void;
  patchSelected: (patch: Record<string, unknown>) => void;
  commitSelected: (patch: Record<string, unknown>) => void;
  updateStory: (id: string, patch: Partial<Project["stories"][number]>) => void;
  patchStory: (id: string, patch: Partial<Project["stories"][number]>) => void;
  addStory: () => void;
  copyStory: () => void;
  repeatStories: (count: number) => void;
  addBasement: () => void;
  addMassing: (opts: MassingOpts) => void;
  propagateTypical: () => void;
  syncTypicalAfterEdit: () => void;
  detachStory: (id: string) => void;
  linkStory: (id: string) => void;
  markStoryAttic: (id: string) => void;
  markStoryGround: (id: string) => void;
  runAgent: (id: AgentId, opts?: AgentOpts) => AgentResult | null;
  removeStory: (id: string) => void;
  updateMeta: (patch: Partial<Project["meta"]>) => void;
  patchMeta: (patch: Partial<Project["meta"]>) => void;
  renameCurrent: (name: string) => void;
  setDraft: (p: Vec2 | null) => void;
  setMeasure: (m: { a: Vec2; b: Vec2 } | null) => void;
  setBuildPhase: (n: number) => void;
  setPlaying: (v: boolean) => void;
  setIsolateStory: (v: boolean) => void;
  setShowStructure: (v: boolean) => void;
  setPhysics: (v: boolean) => void;
  setSkill: (v: "simple" | "pro") => void;
  setNav: (patch: Partial<NavPrefs>) => void;
  addStroke: (points: Vec2[]) => void;
  addSurveyPoint: (p: Vec2) => void;
  clearSurvey: () => void;
  buildWallsFromSurvey: () => { wallCount: number; perimeter: number } | null;
  buildWallsFromStrokes: () => { wallCount: number; perimeter: number } | null;
  setSurveyUnderlay: (u: SurveyUnderlay | null) => void;
  patchSurveyUnderlay: (patch: Partial<SurveyUnderlay>) => void;
  clearSurveyUnderlay: (storyId?: string) => void;
  addStrokesFromPolylines: (polylines: Vec2[][]) => number;
  toggleLayer: (id: string, patch: Partial<SketchLayer>) => void;
  addLayer: () => void;
  addRevision: (note?: string) => void;
  placeAt: (p: Vec2) => void;
  moveSelected: (dx: number, dy: number) => void;
  rotateSelected: (delta?: number) => void;
  splitWallAt: (p: Vec2) => void;
  analysis: () => ProjectAnalysis | null;
  collabRoom: string | null;
  collabPeers: PeerInfo[];
  collabSelfId: string | null;
  /** Monotonic local edit epoch while collab is active. */
  collabLocalEpoch: number;
  /** Last epoch received from a peer. */
  collabReceivedEpoch: number;
  /** UI: Reconnexion… when peers are recovering. */
  collabStatus: "idle" | "live" | "reconnecting";
  gizmoMode: "translate" | "rotate";
  setGizmoMode: (mode: "translate" | "rotate") => void;
  startCollab: (room?: string) => string;
  stopCollab: () => void;
  pushCollabProject: () => void;
  applyRemoteProject: (project: Project, epoch?: number) => void;
  resolveCollabConflict: (choice: "keep" | "take") => void;
}


function withHistory(state: StudioState, next: Project): Partial<StudioState> {
  const history = [...state.history, cloneProject(state.current()!)].slice(-HISTORY_LIMIT);
  const projects = state.projects.map((p) => (p.id === next.id ? touch(next) : p));
  return { projects, history, future: [] };
}

function patchEntities(p: Project, ids: string[], patch: Record<string, unknown>): Project {
  const hit = (id: string) => ids.includes(id);
  p.walls = p.walls.map((w) => (hit(w.id) ? { ...w, ...patch } : w));
  p.openings = p.openings.map((o) => (hit(o.id) ? { ...o, ...patch } : o));
  p.rooms = p.rooms.map((r) => (hit(r.id) ? { ...r, ...patch } : r));
  p.furniture = p.furniture.map((f) => (hit(f.id) ? { ...f, ...patch } : f));
  p.columns = p.columns.map((c) => (hit(c.id) ? { ...c, ...patch } : c));
  p.stairs = p.stairs.map((st) => (hit(st.id) ? { ...st, ...patch } : st));
  p.slabs = p.slabs.map((s) => (hit(s.id) ? { ...s, ...patch } : s));
  p.roofs = p.roofs.map((r) => (hit(r.id) ? { ...r, ...patch } : r));
  return p;
}

/** When true, commit/patchNow skip live typical sync (used by sync itself). */
let silentTypicalSync = false;

let collabSession: CollabSession | null = null;
let collabAutoPush: ReturnType<typeof setInterval> | null = null;
const COLLAB_AUTO_PUSH_MS = 8_000;

function clearCollabTimers() {
  if (collabAutoPush) {
    clearInterval(collabAutoPush);
    collabAutoPush = null;
  }
}

let lastRemoteFingerprint = "";
/** updatedAt of the last project we successfully pushed (or accepted). */
let lastPushedUpdatedAt: string | null = null;
/** Pending remote project awaiting user conflict choice. */
let pendingRemote: { project: Project; epoch: number } | null = null;

function deriveCollabStatus(peers: PeerInfo[]): "idle" | "live" | "reconnecting" {
  if (peers.length === 0) return "idle";
  const live = peers.some((p) => p.connectionState === "connected");
  const recovering = peers.some((p) =>
    p.connectionState === "connecting" ||
    p.connectionState === "disconnected" ||
    p.connectionState === "failed" ||
    p.connectionState === "new",
  );
  if (live && !recovering) return "live";
  if (recovering) return "reconnecting";
  return live ? "live" : "idle";
}


function applyStoryPatch(
  p: Project,
  id: string,
  patch: Partial<Project["stories"][number]>,
): Project {
  p = inferStoryRoles(p);
  p.stories = p.stories.map((s) => (s.id === id ? { ...s, ...patch } : s));
  p = syncStoryGeometry(p, id);
  const st = p.stories.find((s) => s.id === id);
  if (patch.height !== undefined && isLiveTypical(st)) {
    p = syncTypicalFrom(p, id, { syncHeight: true });
  }
  return p;
}

function maybeSyncTypical(p: Project, storyId: string | null | undefined): Project {
  if (silentTypicalSync || !storyId) return p;
  p = inferStoryRoles(p);
  const st = p.stories.find((s) => s.id === storyId);
  if (!isLiveTypical(st)) return p;
  silentTypicalSync = true;
  try {
    return syncTypicalFrom(p, storyId);
  } finally {
    silentTypicalSync = false;
  }
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      projects: seedProjects(),
      currentId: null,
      selectedIds: [],
      tool: "select",
      view: "3d",
      workspace: "modele",
      storyId: null,
      sunHour: 14,
      lighting: { ...DEFAULT_LIGHTING },
      grid: true,
      snap: true,
      snapStep: 0.25,
      ortho: true,
      clipY: 1,
      furnitureKind: "sofa",
      recentKinds: ["sofa", "table", "bed", "kitchen", "chair", "plant"],
      lastDrawTool: "wall",
      wallDraft: { ...DEFAULT_WALL_DRAFT },
      openingDraft: {
        door: { ...DEFAULT_OPENING_DRAFT.door },
        window: { ...DEFAULT_OPENING_DRAFT.window },
      },
      activeMaterialId: "plaster",
      draft: null,
      measure: null,
      buildPhase: 7,
      playing: false,
      isolateStory: false,
      showStructure: false,
      physics: true,
      skill: "pro",
      nav: { ...DEFAULT_NAV },
      history: [],
      future: [],
      hydrated: false,
      collabRoom: null,
      collabPeers: [],
      collabSelfId: null,
      collabLocalEpoch: 0,
      collabReceivedEpoch: 0,
      collabStatus: "idle",
      gizmoMode: "translate",
      setGizmoMode: (gizmoMode) => set({ gizmoMode }),
      setHydrated: (v) => set({ hydrated: v }),
      setTool: (tool) =>
        set({
          tool,
          draft: null,
          measure: tool === "measure" ? get().measure : null,
          lastDrawTool: DRAW_MEMORY.includes(tool) ? tool : get().lastDrawTool,
        }),
      setView: (view) => set({ view }),
      setWorkspace: (workspace) =>
        set((s) => {
          if (workspace === "esquisse") return { workspace, view: "plan" as ViewMode, tool: "pen" as Tool };
          if (workspace === "releve") return { workspace, view: "plan" as ViewMode, tool: "survey" as Tool };
          return { workspace, view: "3d" as ViewMode, tool: "select" as Tool };
        }),
      setStory: (storyId) => set({ storyId, selectedIds: [] }),
      setSunHour: (sunHour) =>
        set((s) => ({ sunHour, lighting: { ...s.lighting, sunHour } })),
      setLighting: (patch) =>
        set((s) => {
          const lighting = { ...s.lighting, ...patch };
          return { lighting, sunHour: lighting.sunHour };
        }),
      setClipY: (clipY) => set({ clipY }),
      setGrid: (grid) => set({ grid }),
      setSnap: (snap) => set({ snap }),
      setSnapStep: (snapStep) => set({ snapStep }),
      setOrtho: (ortho) => set({ ortho }),
      setFurnitureKind: (furnitureKind) =>
        set((s) => ({
          furnitureKind,
          recentKinds: [furnitureKind, ...s.recentKinds.filter((k) => k !== furnitureKind)].slice(0, 8),
        })),
      setWallDraft: (patch) => set((s) => ({ wallDraft: { ...s.wallDraft, ...patch } })),
      setOpeningDraft: (kind, patch) =>
        set((s) => ({
          openingDraft: {
            ...s.openingDraft,
            [kind]: { ...s.openingDraft[kind], ...patch },
          },
        })),
      setActiveMaterial: (activeMaterialId) => set({ activeMaterialId }),
      select: (selectedIds) => set({ selectedIds }),
      current: () => {
        const { projects, currentId } = get();
        return projects.find((p) => p.id === currentId) ?? null;
      },
      createBlank: (name) => {
        const p = emptyProject(name);
        set((s) => ({
          projects: [p, ...s.projects],
          currentId: p.id,
          storyId: p.stories[0]?.id ?? null,
          history: [],
          future: [],
          selectedIds: [],
        }));
        return p.id;
      },
      addProject: (p) => {
        set((s) => ({
          projects: [p, ...s.projects.filter((x) => x.id !== p.id)],
          currentId: p.id,
          storyId: p.stories[0]?.id ?? null,
          history: [],
          future: [],
          selectedIds: [],
        }));
      },
      openProject: (id) => {
        const p = get().projects.find((x) => x.id === id);
        set({
          currentId: id,
          storyId: p?.stories[0]?.id ?? null,
          history: [],
          future: [],
          selectedIds: [],
          tool: "select",
          view: "3d",
        });
      },
      renameProject: (id, name) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? touch({ ...p, name }) : p)),
        })),
      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
        })),
      resetExamples: () => {
        const fresh = seedProjects();
        const names = new Set(fresh.map((p) => p.name));
        set((s) => ({
          projects: [...fresh, ...s.projects.filter((p) => !names.has(p.name))],
        }));
      },
      duplicateProjectById: (id) => {
        const src = get().projects.find((p) => p.id === id);
        if (!src) return null;
        const copy = duplicateProject(src);
        get().addProject(copy);
        return copy.id;
      },
      duplicateSelected: () => {
        const ids = get().selectedIds;
        if (!ids.length) return;
        let nextIds: string[] = [];
        get().commit((p) => {
          nextIds = cloneSelection(p, ids, 0.6, 0);
          return p;
        });
        if (nextIds.length) set({ selectedIds: nextIds });
      },
      arraySelected: (count = 3) => {
        const ids = get().selectedIds;
        const cur = get().current();
        if (!ids.length || !cur) return;
        const n = Math.max(1, Math.min(24, Math.round(count)));
        let dx = 0.6;
        let dy = 0;
        const wall = cur.walls.find((w) => ids.includes(w.id));
        if (wall) {
          const ang = wallAngle(wall);
          const span = Math.max(0.6, wallLength(wall) * 0.15);
          dx = Math.cos(ang) * span;
          dy = Math.sin(ang) * span;
        }
        let last: string[] = [];
        get().commit((p) => {
          for (let i = 1; i <= n; i++) last = cloneSelection(p, ids, dx * i, dy * i);
          return p;
        });
        if (last.length) set({ selectedIds: last });
        toast.success(`Réseau ×${n}`);
      },
      applyDraftToSelection: () => {
        const ids = get().selectedIds;
        const cur = get().current();
        if (!cur || !ids.length) return;
        const wallIds = cur.walls.filter((w) => ids.includes(w.id)).map((w) => w.id);
        const openIds = cur.openings.filter((o) => ids.includes(o.id)).map((o) => o.id);
        if (wallIds.length) {
          const d = get().wallDraft;
          get().commit((p) =>
            patchEntities(p, wallIds, {
              thickness: d.thickness,
              height: d.height,
              materialId: d.materialId,
              loadBearing: d.loadBearing,
              partition: d.partition,
              insulationMm: d.insulationMm,
              role: d.role,
              alignment: d.alignment,
              fireRating: d.fireRating,
            }),
          );
          toast.success("Type mur appliqué");
          return;
        }
        if (openIds.length) {
          const o = cur.openings.find((x) => ids.includes(x.id))!;
          const d = get().openingDraft[o.kind];
          get().commit((p) => patchEntities(p, openIds, { ...d }));
          toast.success("Type baie appliqué");
        }
      },
      commit: (mutator) => {
        const cur = get().current();
        if (!cur) return;
        const storyId = get().storyId;
        let next = mutator(cloneProject(cur));
        if (!silentTypicalSync) next = maybeSyncTypical(next, storyId);
        set((s) => {
          const base = withHistory(s, next) as StudioState;
          if (s.collabRoom) {
            return { ...base, collabLocalEpoch: s.collabLocalEpoch + 1 };
          }
          return base;
        });
      },
      undo: () => {
        const s = get();
        const cur = s.current();
        if (!cur || s.history.length === 0) return;
        const prev = s.history[s.history.length - 1]!;
        set({
          history: s.history.slice(0, -1),
          future: [cloneProject(cur), ...s.future],
          projects: s.projects.map((p) => (p.id === prev.id ? prev : p)),
        });
      },
      redo: () => {
        const s = get();
        const cur = s.current();
        if (!cur || s.future.length === 0) return;
        const nxt = s.future[0]!;
        set({
          future: s.future.slice(1),
          history: [...s.history, cloneProject(cur)],
          projects: s.projects.map((p) => (p.id === nxt.id ? nxt : p)),
        });
      },
      addWall: (a, b) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        const pa = snapToSketch(a, cur, storyId, s.snap, 0.35, s.snapStep);
        const pb = snapToSketch(b, cur, storyId, s.snap, 0.35, s.snapStep);
        if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < 0.3) return;
        const story = cur.stories.find((st) => st.id === storyId);
        s.commit((p) => {
          p.walls.push({
            id: uid("w"),
            storyId,
            a: pa,
            b: pb,
            thickness: s.wallDraft.thickness,
            height: s.wallDraft.height || (story?.height ?? 2.8),
            materialId:
              s.wallDraft.materialId === "water" || s.wallDraft.materialId === "vegetation"
                ? "plaster"
                : s.wallDraft.materialId,
            loadBearing: s.wallDraft.loadBearing,
            partition: s.wallDraft.partition,
            insulationMm: s.wallDraft.insulationMm,
            uValue: 0.36,
            fireRating: s.wallDraft.fireRating,
            alignment: s.wallDraft.alignment,
            role: s.wallDraft.role,
            acousticRw: 50,
          });
          p.rooms = mergeDetectedRooms(p, storyId);
          return healWallEnds(p, storyId);
        });
      },
      addOpeningAt: (kind, point) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        const hit = findWallAt(cur, storyId, point, 0.6);
        if (!hit) return;
        s.commit((p) => {
          const d = s.openingDraft[kind];
          const next = addOpeningOnWall(p, hit.wall, kind, hit.t, d.width, d.height, d.sill);
          const last = next.openings[next.openings.length - 1];
          if (last) {
            last.variant = d.variant;
            if (kind === "window" && "glazing" in d) last.glazing = d.glazing;
          }
          return next;
        });
      },
      addFurniture: (point) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        const pos = s.snap ? snapVec(point, s.snapStep) : point;
        s.commit((p) => addFurnitureAt(p, storyId, s.furnitureKind, pos, 0));
      },
      addColumnAt: (point) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        const pos = s.snap ? snapVec(point, s.snapStep) : point;
        const story = cur.stories.find((st) => st.id === storyId);
        s.commit((p) => {
          p.columns.push({
            id: uid("col"),
            storyId,
            position: pos,
            width: 0.3,
            depth: 0.3,
            height: story?.height ?? 2.8,
            materialId: "concrete",
            shape: "rect",
            structural: true,
          });
          return p;
        });
      },
      addStairAt: (point) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        const pos = s.snap ? snapVec(point, s.snapStep) : point;
        const story = cur.stories.find((st) => st.id === storyId);
        s.commit((p) => {
          p.stairs.push({
            id: uid("stair"),
            storyId,
            origin: pos,
            direction: 0,
            width: 0.95,
            run: 3.2,
            rise: story?.height ?? 2.8,
            steps: 16,
            railing: true,
            kind: "straight",
          });
          return p;
        });
      },
      addSlabAt: (point) => {
        const s = get();
        const storyId = s.storyId;
        if (!s.current() || !storyId) return;
        const pos = s.snap ? snapVec(point, s.snapStep) : point;
        const w = 4;
        const d = 4;
        s.commit((p) => {
          p.slabs.push({
            id: uid("sl"),
            storyId,
            polygon: [
              { x: pos.x - w / 2, y: pos.y - d / 2 },
              { x: pos.x + w / 2, y: pos.y - d / 2 },
              { x: pos.x + w / 2, y: pos.y + d / 2 },
              { x: pos.x - w / 2, y: pos.y + d / 2 },
            ],
            thickness: 0.22,
            materialId: "concrete",
          });
          return p;
        });
      },
      addRoofAt: (point) => {
        const s = get();
        const storyId = s.storyId;
        if (!s.current() || !storyId) return;
        const pos = s.snap ? snapVec(point, s.snapStep) : point;
        const w = 6;
        const d = 5;
        s.commit((p) => {
          p.roofs.push({
            id: uid("rf"),
            storyId,
            polygon: [
              { x: pos.x - w / 2, y: pos.y - d / 2 },
              { x: pos.x + w / 2, y: pos.y - d / 2 },
              { x: pos.x + w / 2, y: pos.y + d / 2 },
              { x: pos.x - w / 2, y: pos.y + d / 2 },
            ],
            kind: "gable",
            pitch: 28,
            overhang: 0.45,
            thickness: 0.18,
            materialId: "terracotta",
          });
          return p;
        });
      },
      deleteSelected: () => {
        const s = get();
        const ids = new Set(s.selectedIds);
        if (ids.size === 0) return;
        s.commit((p) => {
          p.walls = p.walls.filter((w) => !ids.has(w.id));
          p.openings = p.openings.filter((o) => !ids.has(o.id) && !ids.has(o.wallId));
          p.rooms = p.rooms.filter((r) => !ids.has(r.id));
          p.furniture = p.furniture.filter((f) => !ids.has(f.id));
          p.columns = p.columns.filter((c) => !ids.has(c.id));
          p.stairs = p.stairs.filter((st) => !ids.has(st.id));
          p.slabs = p.slabs.filter((sl) => !ids.has(sl.id));
          p.roofs = p.roofs.filter((rf) => !ids.has(rf.id));
          const stories = new Set(
            [...p.walls, ...p.rooms].map((x) => ("storyId" in x ? x.storyId : "")),
          );
          for (const sid of stories) if (sid) p.rooms = mergeDetectedRooms(p, sid);
          return p;
        });
        set({ selectedIds: [] });
      },
      updateSelectedWall: (patch) => {
        const s = get();
        const id = s.selectedIds[0];
        if (!id) return;
        s.commit((p) => {
          p.walls = p.walls.map((w) => (w.id === id ? { ...w, ...patch } : w));
          return p;
        });
      },
      beginEdit: () => {
        const cur = get().current();
        if (!cur) return;
        set((s) => ({
          history: [...s.history, cloneProject(cur)].slice(-HISTORY_LIMIT),
          future: [],
          ...(s.collabRoom ? { collabLocalEpoch: s.collabLocalEpoch + 1 } : {}),
        }));
      },
      patchNow: (mutator) => {
        const cur = get().current();
        if (!cur) return;
        const storyId = get().storyId;
        let next = mutator(cloneProject(cur));
        if (!silentTypicalSync) next = maybeSyncTypical(next, storyId);
        set((s) => ({
          projects: s.projects.map((p) => (p.id === next.id ? touch(next) : p)),
        }));
      },
      patchSelected: (patch) => {
        const ids = get().selectedIds;
        get().patchNow((p) => patchEntities(p, ids, patch));
      },
      commitSelected: (patch) => {
        const ids = get().selectedIds;
        const cur = get().current();
        const isWall = cur?.walls.some((w) => ids.includes(w.id));
        get().commit((p) => patchEntities(p, ids, patch));
        if (isWall) {
          const d: Partial<StudioState["wallDraft"]> = {};
          if (typeof patch.thickness === "number") d.thickness = patch.thickness;
          if (typeof patch.height === "number") d.height = patch.height;
          if (typeof patch.materialId === "string") d.materialId = patch.materialId as MaterialId;
          if (typeof patch.loadBearing === "boolean") d.loadBearing = patch.loadBearing;
          if (typeof patch.partition === "boolean") d.partition = patch.partition;
          if (typeof patch.insulationMm === "number") d.insulationMm = patch.insulationMm;
          if (typeof patch.role === "string") d.role = patch.role as WallRole;
          if (typeof patch.alignment === "string") d.alignment = patch.alignment as WallAlign;
          if (typeof patch.fireRating === "string") d.fireRating = patch.fireRating as FireRating;
          if (Object.keys(d).length) get().setWallDraft(d);
        }
        const isOpen = cur?.openings.some((o) => ids.includes(o.id));
        if (isOpen) {
          const o = cur!.openings.find((x) => ids.includes(x.id));
          if (o) {
            get().setOpeningDraft(o.kind, {
              width: typeof patch.width === "number" ? patch.width : o.width,
              height: typeof patch.height === "number" ? patch.height : o.height,
              sill: typeof patch.sill === "number" ? patch.sill : o.sill,
              variant: (typeof patch.variant === "string" ? patch.variant : o.variant) as OpeningVariant,
              glazing: (typeof patch.glazing === "string" ? patch.glazing : o.glazing) as Glazing,
            });
          }
        }
      },
      updateStory: (id, patch) => {
        get().commit((p) => applyStoryPatch(p, id, patch));
      },
      patchStory: (id, patch) => {
        get().patchNow((p) => applyStoryPatch(p, id, patch));
      },
      addStory: () => {
        get().commit((p) => {
          const sid = get().storyId ?? p.stories[p.stories.length - 1]?.id;
          if (sid && p.walls.some((w) => w.storyId === sid)) {
            return duplicateStoryLevel(p, sid, { furniture: false, roof: false });
          }
          const last = p.stories[p.stories.length - 1];
          const group = p.stories.find((s) => s.typicalGroup)?.typicalGroup ?? "typ_1";
          p.stories.push({
            id: uid("st"),
            name: last ? `R+${p.stories.length}` : "RDC",
            elevation: (last?.elevation ?? 0) + (last?.height ?? 2.8),
            height: last?.height ?? 2.8,
            role: last ? "typical" : "ground",
            typicalGroup: last ? group : undefined,
            detached: false,
          });
          return nameStories(restackStories(p));
        });
        const cur = get().current();
        const last = cur?.stories[cur.stories.length - 1];
        if (last) set({ storyId: last.id, isolateStory: (cur?.stories.length ?? 0) > 3 });
      },
      copyToNextStory: () => {
        const s = get();
        const cur = s.current();
        const sid = s.storyId;
        if (!cur || !sid) return;
        if (!s.selectedIds.length) {
          get().copyStory();
          toast.success("Étage dupliqué");
          return;
        }
        const idx = cur.stories.findIndex((st) => st.id === sid);
        if (idx < 0) return;
        if (idx >= cur.stories.length - 1) get().addStory();
        const nextSid = get().current()?.stories[idx + 1]?.id;
        if (!nextSid) return;
        const ids = new Set(s.selectedIds);
        get().commit((p) => {
          const wallMap = new Map<string, string>();
          for (const w of [...p.walls]) {
            if (!ids.has(w.id) || w.storyId !== sid) continue;
            const nid = uid("w");
            wallMap.set(w.id, nid);
            p.walls.push({ ...w, id: nid, storyId: nextSid });
          }
          for (const o of [...p.openings]) {
            const mapped = wallMap.get(o.wallId);
            if (!mapped) continue;
            p.openings.push({ ...o, id: uid("op"), wallId: mapped });
          }
          for (const f of [...p.furniture]) {
            if (!ids.has(f.id) || f.storyId !== sid) continue;
            p.furniture.push({ ...f, id: uid("fur"), storyId: nextSid });
          }
          for (const c of [...p.columns]) {
            if (!ids.has(c.id) || c.storyId !== sid) continue;
            p.columns.push({ ...c, id: uid("col"), storyId: nextSid });
          }
          return p;
        });
        set({ storyId: nextSid, isolateStory: true });
        toast.success("Copié à l’étage suivant");
      },
      cycleStory: (dir = 1) => {
        const cur = get().current();
        if (!cur || cur.stories.length < 2) return;
        const idx = Math.max(0, cur.stories.findIndex((st) => st.id === get().storyId));
        const next = cur.stories[(idx + dir + cur.stories.length) % cur.stories.length];
        if (next) set({ storyId: next.id, isolateStory: cur.stories.length > 2 });
      },
      copyStory: () => {
        const sid = get().storyId;
        if (!sid) return;
        get().commit((p) => duplicateStoryLevel(p, sid, { furniture: true, roof: false }));
        const cur = get().current();
        const last = cur?.stories[cur.stories.length - 1];
        if (last) set({ storyId: last.id, isolateStory: false });
      },
      repeatStories: (count) => {
        const sid = get().storyId ?? get().current()?.stories.at(-1)?.id;
        if (!sid) return;
        get().commit((p) => nameStories(stackStories(p, sid, count)));
        set({ isolateStory: false });
        const cur = get().current();
        const last = cur?.stories[cur.stories.length - 1];
        if (last) set({ storyId: last.id, isolateStory: (cur?.stories.length ?? 0) > 4 });
      },
      addBasement: () => {
        get().commit((p) => insertBasement(p));
        const cur = get().current();
        if (cur?.stories[0]) set({ storyId: cur.stories[0].id, isolateStory: true });
      },
      addMassing: (opts) => {
        get().commit((p) => generateMassing(p, opts));
        const cur = get().current();
        const first = cur?.stories[0];
        const floors = cur?.stories.length ?? 1;
        set({
          storyId: first?.id ?? get().storyId,
          isolateStory: false,
          selectedIds: [],
          view: "3d",
          workspace: "modele",
          tool: "select",
        });
        void floors;
      },
      propagateTypical: () => {
        const sid = get().storyId;
        if (!sid) return;
        silentTypicalSync = true;
        try {
          get().commit((p) => propagateTypicalFloor(p, sid));
        } finally {
          silentTypicalSync = false;
        }
        set({ isolateStory: false, selectedIds: [] });
      },
      syncTypicalAfterEdit: () => {
        const sid = get().storyId;
        if (!sid) return;
        silentTypicalSync = true;
        try {
          get().commit((p) => syncTypicalFrom(inferStoryRoles(p), sid));
        } finally {
          silentTypicalSync = false;
        }
      },
      detachStory: (id) => {
        get().commit((p) => setStoryDetachedOp(p, id, true));
      },
      linkStory: (id) => {
        silentTypicalSync = true;
        try {
          get().commit((p) => {
            let next = setStoryDetachedOp(p, id, false);
            const st = next.stories.find((s) => s.id === id);
            if (isLiveTypical(st)) next = syncTypicalFrom(next, id);
            return next;
          });
        } finally {
          silentTypicalSync = false;
        }
      },
      markStoryAttic: (id) => {
        get().commit((p) => markStoryRoleOp(p, id, "attic" as StoryRole));
      },
      markStoryGround: (id) => {
        get().commit((p) => markStoryRoleOp(p, id, "ground" as StoryRole));
      },
      runAgent: (id, opts) => {
        const cur = get().current();
        const storyId = opts?.storyId ?? get().storyId;
        if (!cur) return null;
        let report: AgentResult | null = null;
        get().commit((p) => {
          const r = runAgentTransform(id, p, { ...opts, storyId });
          report = r;
          return r.project;
        });
        return report;
      },
      removeStory: (id) => {
        const s = get();
        const cur = s.current();
        if (!cur || cur.stories.length <= 1) return;
        s.commit((p) => {
          p.stories = p.stories.filter((st) => st.id !== id);
          p.walls = p.walls.filter((w) => w.storyId !== id);
          p.rooms = p.rooms.filter((r) => r.storyId !== id);
          p.furniture = p.furniture.filter((f) => f.storyId !== id);
          p.columns = p.columns.filter((c) => c.storyId !== id);
          p.stairs = p.stairs.filter((st) => st.storyId !== id);
          p.slabs = p.slabs.filter((sl) => sl.storyId !== id);
          p.roofs = p.roofs.filter((rf) => rf.storyId !== id);
          const keep = new Set(p.walls.map((w) => w.id));
          p.openings = p.openings.filter((o) => keep.has(o.wallId));
          return p;
        });
        const next = get().current();
        set({ storyId: next?.stories[0]?.id ?? null, selectedIds: [] });
      },
      updateMeta: (patch) => {
        get().commit((p) => {
          p.meta = { ...p.meta, ...patch };
          return p;
        });
      },
      patchMeta: (patch) => {
        get().patchNow((p) => {
          p.meta = { ...p.meta, ...patch };
          return p;
        });
      },
      renameCurrent: (name) => {
        const id = get().currentId;
        if (!id) return;
        get().renameProject(id, name);
      },
      patchMaterial: (id, patch) => {
        get().patchNow((p) => {
          p.materials = {
            ...p.materials,
            [id]: { ...(p.materials?.[id] ?? {}), ...patch },
          };
          return p;
        });
      },
      applyMaterial: (id, scope) => {
        const selected = new Set(get().selectedIds);
        get().commit((p) => {
          const hit = (objId: string) => scope === "all" || (scope === "selected" && selected.has(objId));
          if (scope === "walls" || scope === "all") {
            p.walls = p.walls.map((w) => ({ ...w, materialId: id }));
          } else {
            p.walls = p.walls.map((w) => (hit(w.id) ? { ...w, materialId: id } : w));
          }
          if (scope === "selected" || scope === "all") {
            p.openings = p.openings.map((o) => (hit(o.id) ? { ...o, materialId: id } : o));
            p.columns = p.columns.map((c) => (hit(c.id) ? { ...c, materialId: id } : c));
            p.slabs = p.slabs.map((s) => (hit(s.id) ? { ...s, materialId: id } : s));
            p.roofs = p.roofs.map((r) => (hit(r.id) ? { ...r, materialId: id } : r));
          }
          return p;
        });
        set({ activeMaterialId: id });
      },
      setDraft: (draft) => set({ draft }),
      setMeasure: (measure) => set({ measure }),
      setBuildPhase: (buildPhase) => set({ buildPhase }),
      setPlaying: (playing) => set({ playing }),
      setIsolateStory: (isolateStory) => set({ isolateStory }),
      setShowStructure: (showStructure) => set({ showStructure }),
      setPhysics: (physics) => set({ physics }),
      setSkill: (skill) => set({ skill }),
      setNav: (patch) => set((s) => ({ nav: { ...s.nav, ...patch } })),
      addStroke: (points) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        const pts = resampleStroke(points);
        if (pts.length < 2) return;
        const layerId = activeLayerId(ensureSketch(cur));
        s.commit((p) => {
          const n = ensureSketch(p);
          n.strokes = [
            ...(n.strokes ?? []),
            { id: uid("sk"), layerId, storyId, points: pts, width: 0.06, color: "#e8e4d9" },
          ];
          return n;
        });
      },
      addSurveyPoint: (point) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        const pos = s.snap ? snapVec(point, s.snapStep) : point;
        s.commit((p) => {
          const n = ensureSketch(p);
          n.survey = [...(n.survey ?? []), { id: uid("sv"), storyId, position: pos }];
          return n;
        });
      },
      clearSurvey: () => {
        get().commit((p) => ({ ...p, survey: [] }));
      },
      buildWallsFromSurvey: () => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return null;
        const preview = surveyPolygonToWalls(cur, storyId);
        if (preview.wallCount === 0) return { wallCount: 0, perimeter: 0 };
        s.commit(() => preview.project);
        return { wallCount: preview.wallCount, perimeter: preview.perimeter };
      },
      buildWallsFromStrokes: () => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return null;
        const preview = strokesToWalls(cur, storyId);
        if (preview.wallCount === 0) return { wallCount: 0, perimeter: 0 };
        s.commit(() => preview.project);
        return { wallCount: preview.wallCount, perimeter: preview.perimeter };
      },
      setSurveyUnderlay: (u) => {
        get().commit((p) => {
          const next = { ...p };
          if (!u) {
            delete next.surveyUnderlay;
            return next;
          }
          next.surveyUnderlay = { ...u, offset: { ...u.offset } };
          return next;
        });
      },
      patchSurveyUnderlay: (patch) => {
        get().commit((p) => {
          if (!p.surveyUnderlay) return p;
          const cur = p.surveyUnderlay;
          return {
            ...p,
            surveyUnderlay: {
              ...cur,
              ...patch,
              offset: patch.offset ? { ...patch.offset } : { ...cur.offset },
            },
          };
        });
      },
      clearSurveyUnderlay: (storyId) => {
        get().commit((p) => {
          if (!p.surveyUnderlay) return p;
          if (storyId && p.surveyUnderlay.storyId !== storyId) return p;
          const next = { ...p };
          delete next.surveyUnderlay;
          return next;
        });
      },
      addStrokesFromPolylines: (polylines) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return 0;
        const usable = polylines.filter((pts) => pts.length >= 2);
        if (!usable.length) return 0;
        s.commit((p) => {
          const n = ensureSketch(p);
          const layerId = activeLayerId(n);
          const added = usable.map((points) => ({
            id: uid("sk"),
            layerId,
            storyId,
            points: points.map((pt) => ({ ...pt })),
            width: 0.05,
            color: "#6ed0c3",
          }));
          n.strokes = [...(n.strokes ?? []), ...added];
          return n;
        });
        return usable.length;
      },
      toggleLayer: (id, patch) => {
        get().commit((p) => {
          const n = ensureSketch(p);
          n.layers = n.layers!.map((l) => (l.id === id ? { ...l, ...patch } : l));
          return n;
        });
      },
      addLayer: () => {
        get().commit((p) => {
          const n = ensureSketch(p);
          n.layers = [
            ...(n.layers ?? []),
            {
              id: uid("ly"),
              name: `Calque ${(n.layers?.length ?? 0) + 1}`,
              visible: true,
              locked: false,
              opacity: 1,
            },
          ];
          return n;
        });
      },
      addRevision: (note) => {
        get().commit((p) => {
          const n = ensureSketch(p);
          n.revisions = [
            ...(n.revisions ?? []),
            { id: uid("rev"), at: new Date().toISOString(), note: note ?? `Jalon ${(n.revisions?.length ?? 0) + 1}` },
          ];
          return n;
        });
      },
      placeAt: (p) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        let wp = snapToSketch(p, cur, storyId, s.snap, 0.35, s.snapStep);
        const tool = s.tool;
        if (s.draft && s.ortho && (tool === "wall" || tool === "rect" || tool === "measure")) {
          wp = snapToSketch(orthoPoint(s.draft, wp, true), cur, storyId, false, 0.35, s.snapStep);
        }
        if (tool === "wall") {
          if (!s.draft) {
            set({ draft: wp });
            return;
          }
          if (dist(s.draft, wp) < 0.35) {
            set({ draft: null });
            return;
          }
          s.addWall(s.draft, wp);
          set({ draft: wp });
          return;
        }
        if (tool === "rect") {
          if (!s.draft) {
            set({ draft: wp });
            return;
          }
          const mat =
            s.activeMaterialId === "water" || s.activeMaterialId === "vegetation"
              ? "plaster"
              : s.activeMaterialId;
          s.commit((proj) => addRectWalls(proj, storyId, s.draft!, wp, { ...s.wallDraft, materialId: mat }));
          set({ draft: null });
          return;
        }
        if (tool === "room") {
          s.commit((proj) => {
            proj.rooms = mergeDetectedRooms(proj, storyId);
            return proj;
          });
          return;
        }
        if (tool === "measure") {
          if (!s.draft) {
            set({ draft: wp });
            return;
          }
          set({ measure: { a: s.draft, b: wp }, draft: null });
          return;
        }
        if (tool === "door" || tool === "window") s.addOpeningAt(tool, wp);
        else if (tool === "furniture") s.addFurniture(wp);
        else if (tool === "column") s.addColumnAt(wp);
        else if (tool === "stair") s.addStairAt(wp);
        else if (tool === "slab") s.addSlabAt(wp);
        else if (tool === "roof") s.addRoofAt(wp);
        else if (tool === "survey") get().addSurveyPoint(wp);
        else if (tool === "delete") {
          const hit = findWallAt(cur, storyId, wp, 0.5);
          if (hit) {
            set({ selectedIds: [hit.wall.id] });
            get().deleteSelected();
          }
        }
      },
      moveSelected: (dx, dy) => {
        const ids = get().selectedIds;
        if (!ids.length) return;
        get().patchNow((p) => translateSelection(p, ids, dx, dy));
      },
      rotateSelected: (delta = Math.PI / 2) => {
        const ids = get().selectedIds;
        if (!ids.length) return;
        get().commit((p) => {
          p.furniture = p.furniture.map((f) =>
            ids.includes(f.id) ? { ...f, rotation: f.rotation + delta } : f,
          );
          p.stairs = p.stairs.map((st) =>
            ids.includes(st.id) ? { ...st, direction: st.direction + delta } : st,
          );
          p.columns = p.columns.map((c) =>
            ids.includes(c.id) ? { ...c, rotation: (c.rotation ?? 0) + delta } : c,
          );
          return p;
        });
      },
      splitWallAt: (point) => {
        const storyId = get().storyId;
        if (!storyId) return;
        get().commit((p) => splitWallOp(p, storyId, point));
      },
      applyRemoteProject: (remote, epoch = 0) => {
        const incoming = ensureSketch(inferStoryRoles(cloneProject(remote)));
        const fingerprint = JSON.stringify({
          id: incoming.id,
          updatedAt: incoming.updatedAt,
          walls: incoming.walls.length,
          stories: incoming.stories.length,
          furniture: incoming.furniture.length,
          epoch,
        });
        if (fingerprint === lastRemoteFingerprint) return;

        const cur = get().current();
        const localNewer =
          !!cur &&
          !!lastPushedUpdatedAt &&
          new Date(cur.updatedAt).getTime() > new Date(lastPushedUpdatedAt).getTime();
        const epochConflict =
          get().collabLocalEpoch > get().collabReceivedEpoch && localNewer;

        if (epochConflict && cur) {
          if (
            pendingRemote &&
            pendingRemote.project.updatedAt === incoming.updatedAt &&
            pendingRemote.epoch === epoch
          ) {
            return;
          }
          pendingRemote = { project: incoming, epoch };
          toast.message("Conflit d’édition", {
            id: "collab-conflict",
            description: "La maquette distante diverge de vos modifications locales.",
            duration: 20_000,
            action: {
              label: "Prendre le distant",
              onClick: () => get().resolveCollabConflict("take"),
            },
            cancel: {
              label: "Garder le mien",
              onClick: () => get().resolveCollabConflict("keep"),
            },
          });
          return;
        }

        lastRemoteFingerprint = fingerprint;
        pendingRemote = null;
        const applyIncoming = (inc: Project, ep: number) => {
          const applied = touch(inc);
          lastRemoteFingerprint = JSON.stringify({
            id: applied.id,
            updatedAt: applied.updatedAt,
            walls: applied.walls.length,
            stories: applied.stories.length,
            furniture: applied.furniture.length,
            epoch: ep,
          });
          lastPushedUpdatedAt = applied.updatedAt;
          const current = get().current();
          if (current && current.id === applied.id) {
            set((s) => {
              const history = [...s.history, cloneProject(current)].slice(-HISTORY_LIMIT);
              const projects = s.projects.map((p) =>
                p.id === applied.id ? applied : p,
              );
              const storyStill =
                applied.stories.find((st) => st.id === s.storyId)?.id ??
                applied.stories[0]?.id ??
                null;
              return {
                projects,
                history,
                future: [],
                storyId: storyStill,
                selectedIds: [],
                collabReceivedEpoch: Math.max(s.collabReceivedEpoch, ep),
              };
            });
          } else if (current) {
            set((s) => {
              const history = [...s.history, cloneProject(current)].slice(-HISTORY_LIMIT);
              const rest = s.projects.filter((p) => p.id !== current.id && p.id !== applied.id);
              return {
                projects: [applied, ...rest],
                currentId: applied.id,
                history,
                future: [],
                storyId: applied.stories[0]?.id ?? null,
                selectedIds: [],
                collabReceivedEpoch: Math.max(s.collabReceivedEpoch, ep),
              };
            });
          } else {
            get().addProject(applied);
            set((s) => ({
              collabReceivedEpoch: Math.max(s.collabReceivedEpoch, ep),
            }));
          }
          toast.success("Synchro reçue");
        };
        applyIncoming(incoming, epoch);
      },
      resolveCollabConflict: (choice) => {
        const pending = pendingRemote;
        pendingRemote = null;
        if (choice === "keep" || !pending) {
          if (pending) {
            lastRemoteFingerprint = JSON.stringify({
              id: pending.project.id,
              updatedAt: pending.project.updatedAt,
              walls: pending.project.walls.length,
              stories: pending.project.stories.length,
              furniture: pending.project.furniture.length,
              epoch: pending.epoch,
            });
          }
          toast.message("Version locale conservée");
          return;
        }
        // Force-apply distant
        const ep = pending.epoch;
        const applied = touch(ensureSketch(inferStoryRoles(cloneProject(pending.project))));
        lastPushedUpdatedAt = applied.updatedAt;
        const current = get().current();
        if (current && current.id === applied.id) {
          set((s) => {
            const history = [...s.history, cloneProject(current)].slice(-HISTORY_LIMIT);
            const projects = s.projects.map((p) =>
              p.id === applied.id ? applied : p,
            );
            const storyStill =
              applied.stories.find((st) => st.id === s.storyId)?.id ??
              applied.stories[0]?.id ??
              null;
            return {
              projects,
              history,
              future: [],
              storyId: storyStill,
              selectedIds: [],
              collabReceivedEpoch: Math.max(s.collabReceivedEpoch, ep),
              collabLocalEpoch: Math.max(s.collabLocalEpoch, ep),
            };
          });
        } else if (current) {
          set((s) => {
            const history = [...s.history, cloneProject(current)].slice(-HISTORY_LIMIT);
            const rest = s.projects.filter((p) => p.id !== current.id && p.id !== applied.id);
            return {
              projects: [applied, ...rest],
              currentId: applied.id,
              history,
              future: [],
              storyId: applied.stories[0]?.id ?? null,
              selectedIds: [],
              collabReceivedEpoch: Math.max(s.collabReceivedEpoch, ep),
              collabLocalEpoch: Math.max(s.collabLocalEpoch, ep),
            };
          });
        } else {
          get().addProject(applied);
        }
        lastRemoteFingerprint = JSON.stringify({
          id: applied.id,
          updatedAt: applied.updatedAt,
          walls: applied.walls.length,
          stories: applied.stories.length,
          furniture: applied.furniture.length,
          epoch: ep,
        });
        toast.success("Version distante appliquée");
      },
      startCollab: (room) => {
        const code = normalizeRoomCode(room ?? makeRoomCode());
        if (code.length < 4) {
          toast.error("Code salon invalide");
          return get().collabRoom ?? "";
        }
        get().stopCollab();
        const selfId = `p${Math.random().toString(36).slice(2, 10)}`;
        const name = get().current()?.name?.slice(0, 40) || "FORMA";
        lastPushedUpdatedAt = get().current()?.updatedAt ?? null;
        pendingRemote = null;
        lastRemoteFingerprint = "";
        collabSession = createCollabSession({
          room: code,
          selfId,
          name,
          onPeers: (peers) =>
            set({
              collabPeers: peers,
              collabStatus: deriveCollabStatus(peers),
            }),
          onProject: (project, _from, epoch) => get().applyRemoteProject(project, epoch),
        });
        set({
          collabRoom: code,
          collabPeers: [],
          collabSelfId: selfId,
          collabLocalEpoch: 0,
          collabReceivedEpoch: 0,
          collabStatus: "idle",
        });
        void collabSession.start().catch(() => {
          toast.error("Signalisation indisponible — vérifiez le Network URL");
          set({ collabStatus: "reconnecting" });
        });
        clearCollabTimers();
        collabAutoPush = setInterval(() => {
          const sess = collabSession;
          if (!sess || sess.connectedPeerCount() === 0) return;
          const curProj = get().current();
          if (!curProj) return;
          const ep = get().collabLocalEpoch;
          sess.pushProject(cloneProject(curProj), ep);
          lastPushedUpdatedAt = curProj.updatedAt;
        }, COLLAB_AUTO_PUSH_MS);
        toast.success(room ? `Salon ${code}` : `Salon créé · ${code}`);
        return code;
      },
      stopCollab: () => {
        clearCollabTimers();
        if (collabSession) {
          collabSession.stop();
          collabSession = null;
        }
        pendingRemote = null;
        lastPushedUpdatedAt = null;
        set({
          collabRoom: null,
          collabPeers: [],
          collabSelfId: null,
          collabLocalEpoch: 0,
          collabReceivedEpoch: 0,
          collabStatus: "idle",
        });
      },
      pushCollabProject: () => {
        const sess = collabSession;
        const cur = get().current();
        if (!sess || !cur) {
          toast.message("Aucun salon actif");
          return;
        }
        if (sess.connectedPeerCount() === 0) {
          toast.message("En attente d’un pair connecté");
          return;
        }
        const ep = get().collabLocalEpoch;
        sess.pushProject(cloneProject(cur), ep);
        lastPushedUpdatedAt = cur.updatedAt;
        toast.success("Maquette envoyée");
      },
      analysis: () => {
        const cur = get().current();
        return cur ? analyzeProject(cur) : null;
      },
    }),
    {
      name: "forma-studio-v9",
      partialize: (s) => ({
        projects: s.projects,
        currentId: s.currentId,
        lighting: s.lighting,
        sunHour: s.sunHour,
        skill: s.skill,
        ortho: s.ortho,
        nav: s.nav,
        recentKinds: s.recentKinds,
        lastDrawTool: s.lastDrawTool,
        wallDraft: s.wallDraft,
        openingDraft: s.openingDraft,
        furnitureKind: s.furnitureKind,
        snap: s.snap,
        snapStep: s.snapStep,
        grid: s.grid,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<StudioState> | undefined;
        const projects = (p?.projects ?? current.projects).map((proj) => inferStoryRoles(ensureSketch(proj)));
        const have = new Set(projects.map((x) => x.name));
        for (const seed of seedProjects()) {
          if (!have.has(seed.name)) projects.push(seed);
        }
        return {
          ...current,
          ...p,
          projects,
          lighting: { ...DEFAULT_LIGHTING, ...(p?.lighting ?? {}) },
          ortho: p?.ortho ?? current.ortho,
          recentKinds: p?.recentKinds?.length ? p.recentKinds : current.recentKinds,
          lastDrawTool: p?.lastDrawTool ?? current.lastDrawTool,
          wallDraft: { ...DEFAULT_WALL_DRAFT, ...(p?.wallDraft ?? {}) },
          openingDraft: {
            door: { ...DEFAULT_OPENING_DRAFT.door, ...(p?.openingDraft?.door ?? {}) },
            window: { ...DEFAULT_OPENING_DRAFT.window, ...(p?.openingDraft?.window ?? {}) },
          },
          furnitureKind: p?.furnitureKind ?? current.furnitureKind,
          currentId: p?.currentId ?? current.currentId,
          snap: p?.snap ?? current.snap,
          snapStep: p?.snapStep ?? current.snapStep,
          grid: p?.grid ?? current.grid,
          nav: {
            ...DEFAULT_NAV,
            ...(p?.nav ?? {}),
            ...(!p?.nav || !("orbitMode" in p.nav)
              ? { orbitMode: "maquette" as const, invertOrbitX: false, invertOrbitY: false, invertPan: false }
              : {}),
            fov: Math.max(56, p?.nav?.fov ?? DEFAULT_NAV.fov),
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
        if (state && state.projects.length === 0) {
          state.projects = seedProjects();
        }
      },
    },
  ),
);
