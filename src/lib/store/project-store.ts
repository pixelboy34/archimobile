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
import { dist, findWallAt, snapVec } from "@/lib/bim/geometry";
import { snapToSketch } from "@/lib/bim/snap";
import { mergeDetectedRooms } from "@/lib/bim/rooms";
import { seedProjects } from "@/lib/bim/seed";
import { activeLayerId, ensureSketch, resampleStroke } from "@/lib/bim/sketch";
import { strokesToWalls, surveyPolygonToWalls } from "@/lib/bim/survey-to-walls";
import type {
  FurnitureKind,
  MaterialId,
  MaterialStyle,
  Project,
  SketchLayer,
  Tool,
  Vec2,
  ViewMode,
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
import { addRectWalls, copyStory as duplicateStoryLevel, healWallEnds, orthoPoint, repeatStories as stackStories, restackStories, splitWallAt as splitWallOp, syncStoryGeometry, translateSelection } from "@/lib/cad/ops";
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
  ortho: boolean;
  clipY: number;
  furnitureKind: FurnitureKind;
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
  setOrtho: (v: boolean) => void;
  setFurnitureKind: (k: FurnitureKind) => void;
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
      ortho: true,
      clipY: 1,
      furnitureKind: "sofa",
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
      setTool: (tool) => set({ tool, draft: null, measure: tool === "measure" ? get().measure : null }),
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
      setOrtho: (ortho) => set({ ortho }),
      setFurnitureKind: (furnitureKind) => set({ furnitureKind }),
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
        const s = get();
        const cur = s.current();
        const id = s.selectedIds[0];
        if (!cur || !id) return;
        const dx = 0.6;
        let nextId: string | null = null;
        s.commit((p) => {
          const shift = (pt: { x: number; y: number }) => ({ x: pt.x + dx, y: pt.y });
          const w = p.walls.find((x) => x.id === id);
          if (w) {
            nextId = uid("w");
            p.walls.push({ ...w, id: nextId, a: shift(w.a), b: shift(w.b) });
            return p;
          }
          const f = p.furniture.find((x) => x.id === id);
          if (f) {
            nextId = uid("fur");
            p.furniture.push({ ...f, id: nextId, position: shift(f.position) });
            return p;
          }
          const c = p.columns.find((x) => x.id === id);
          if (c) {
            nextId = uid("col");
            p.columns.push({ ...c, id: nextId, position: shift(c.position) });
            return p;
          }
          const st = p.stairs.find((x) => x.id === id);
          if (st) {
            nextId = uid("stair");
            p.stairs.push({ ...st, id: nextId, origin: shift(st.origin) });
            return p;
          }
          const o = p.openings.find((x) => x.id === id);
          if (o) {
            nextId = uid("op");
            p.openings.push({ ...o, id: nextId, t: Math.min(0.9, o.t + 0.12) });
            return p;
          }
          const sl = p.slabs.find((x) => x.id === id);
          if (sl) {
            nextId = uid("sl");
            p.slabs.push({ ...sl, id: nextId, polygon: sl.polygon.map(shift) });
            return p;
          }
          const rf = p.roofs.find((x) => x.id === id);
          if (rf) {
            nextId = uid("rf");
            p.roofs.push({ ...rf, id: nextId, polygon: rf.polygon.map(shift) });
            return p;
          }
          return p;
        });
        if (nextId) set({ selectedIds: [nextId] });
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
        const pa = snapToSketch(a, cur, storyId, s.snap);
        const pb = snapToSketch(b, cur, storyId, s.snap);
        if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < 0.3) return;
        const story = cur.stories.find((st) => st.id === storyId);
        s.commit((p) => {
          p.walls.push({
            id: uid("w"),
            storyId,
            a: pa,
            b: pb,
            thickness: 0.22,
            height: story?.height ?? 2.8,
            materialId: s.activeMaterialId === "water" || s.activeMaterialId === "vegetation" ? "plaster" : s.activeMaterialId,
            loadBearing: true,
            partition: false,
            insulationMm: 80,
            uValue: 0.36,
            fireRating: "EI60",
            alignment: "center",
            role: "exterior",
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
        s.commit((p) => addOpeningOnWall(p, hit.wall, kind, hit.t));
      },
      addFurniture: (point) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        const pos = s.snap ? snapVec(point) : point;
        s.commit((p) => addFurnitureAt(p, storyId, s.furnitureKind, pos, 0));
      },
      addColumnAt: (point) => {
        const s = get();
        const cur = s.current();
        const storyId = s.storyId;
        if (!cur || !storyId) return;
        const pos = s.snap ? snapVec(point) : point;
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
        const pos = s.snap ? snapVec(point) : point;
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
        const pos = s.snap ? snapVec(point) : point;
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
        const pos = s.snap ? snapVec(point) : point;
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
        get().commit((p) => patchEntities(p, ids, patch));
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
        const pos = s.snap ? snapVec(point) : point;
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
        let wp = snapToSketch(p, cur, storyId, s.snap);
        const tool = s.tool;
        if (s.draft && s.ortho && (tool === "wall" || tool === "rect" || tool === "measure")) {
          wp = snapToSketch(orthoPoint(s.draft, wp, true), cur, storyId, false);
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
          s.commit((proj) => addRectWalls(proj, storyId, s.draft!, wp, { materialId: mat }));
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
        lighting: s.lighting,
        sunHour: s.sunHour,
        skill: s.skill,
        ortho: s.ortho,
        nav: s.nav,
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
