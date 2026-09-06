import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Project,
  ViewMode,
  SkillLevel,
  InspectorTab,
  Selection,
  ToolMode,
  Wall,
  FurnitureKind,
  Vec2,
  OpeningKind,
  SlabKind,
  StairMode,
  RoofMode,
  WorkspaceMode,
  StudioPanelId,
  LayerFlags,
} from '../bim/types'
import { uid, DEFAULT_LAYERS } from '../bim/types'
import { allSeeds, newSketchProject } from '../bim/seed'
import { generateMassing, type MassingParams } from '../cad/massing'
import {
  placeFurniture,
  trimWall,
  extendWallDetailed,
  healWallTJoints,
  makeTJoint,
  placeOpeningAtWall,
  placeSlabRect,
  placeSlabPolygon,
  placeColumnAt,
  placeStairPath,
  placeRoofRect,
  placeRoofPolygon,
  placeRailingPath,
  snapGrid,
  copyStory,
  repeatStories,
} from '../cad/ops'
import { parseMassingPrompt } from '../ai/copilot'

const HISTORY_MAX = 40

type HistoryEntry = Project

type StoreState = {
  projects: Record<string, Project>
  activeId: string | null
  viewMode: ViewMode
  skill: SkillLevel
  selection: Selection
  inspectorOpen: boolean
  inspectorTab: InspectorTab
  tool: ToolMode
  activeStoryId: string | null
  dockHeight: number
  ortho: boolean
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  massingDraft: MassingParams
  placeKind: FurnitureKind | null
  placeRotation: number
  stairMode: StairMode
  roofMode: RoofMode
  polyDrawMode: 'polygon' | 'rect'
  cadNote: string | null
  coupeAxis: 'horizontal' | 'vertical'
  coupeCut: number
  arMode: 'poser' | 'cote'
  workspace: WorkspaceMode
  studioPanel: StudioPanelId | null
  layers: LayerFlags
  phase4d: number
  radialOpen: boolean

  // actions
  touch: () => void
  commit: (mutator: (p: Project) => Project) => void
  patchNow: (mutator: (p: Project) => Project) => void
  select: (sel: Selection) => void
  setView: (v: ViewMode) => void
  setSkill: (s: SkillLevel) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (t: InspectorTab) => void
  setTool: (t: ToolMode) => void
  setActiveStory: (id: string | null) => void
  setDockHeight: (h: number) => void
  setOrtho: (v: boolean) => void
  setActive: (id: string) => void
  undo: () => void
  redo: () => void
  generateMassingAction: (params?: MassingParams) => void
  duplicateProject: (id: string) => string | null
  newSketch: () => string
  addWall: (wall: Omit<Wall, 'id'>) => void
  setMassingDraft: (partial: Partial<MassingParams>) => void
  getActive: () => Project | null
  setPlaceKind: (k: FurnitureKind | null) => void
  rotatePlace: () => void
  setPlaceRotation: (r: number) => void
  addFurnitureAt: (pos: Vec2) => void
  applyTrim: (wallId: string, cutPoint: Vec2) => void
  applyExtend: (wallId: string, targetWallId: string) => void
  applyTJoint: (wallAId: string, wallBId: string, preferEnd?: 'a' | 'b') => void
  clearCadNote: () => void
  setCoupeAxis: (a: 'horizontal' | 'vertical') => void
  setCoupeCut: (v: number) => void
  syncCoupeToStory: () => void
  setArMode: (m: 'poser' | 'cote') => void
  addOpeningAtWall: (wallId: string, t: number, kind: OpeningKind) => void
  addSlab: (a: Vec2, b: Vec2, kind?: SlabKind) => void
  addSlabPolygon: (polygon: Vec2[], kind?: SlabKind) => void
  addColumn: (pos: Vec2) => void
  addStair: (a: Vec2, b: Vec2) => void
  addStairPath: (path: Vec2[], mode?: StairMode) => void
  addRoof: (a: Vec2, b: Vec2) => void
  addRoofPolygon: (polygon: Vec2[]) => void
  addRailingPath: (path: Vec2[]) => void
  setStairMode: (m: StairMode) => void
  setRoofMode: (m: RoofMode) => void
  setPolyDrawMode: (m: 'polygon' | 'rect') => void
  placeAtPoint: (pos: Vec2) => void
  setWorkspace: (w: WorkspaceMode) => void
  setStudioPanel: (id: StudioPanelId | null) => void
  openStudioPanel: (id: StudioPanelId) => void
  setRadialOpen: (open: boolean) => void
  setLayer: (key: keyof LayerFlags, value: boolean) => void
  setPhase4d: (v: number) => void
  assignMaterialToSelection: (materialId: string) => void
  copyActiveStory: () => void
  repeatActiveStories: (count: number) => void
  runCopilotPrompt: (prompt: string) => string
}

function seedMap(): Record<string, Project> {
  const map: Record<string, Project> = {}
  for (const p of allSeeds()) map[p.id] = p
  return map
}

export const useProjectStore = create<StoreState>()(
  persist(
    (set, get) => ({
      projects: seedMap(),
      activeId: null,
      viewMode: '3d',
      skill: 'simple',
      selection: null,
      inspectorOpen: false,
      inspectorTab: 'ouvrage',
      tool: 'select',
      activeStoryId: null,
      dockHeight: 46,
      ortho: true,
      undoStack: [],
      redoStack: [],
      massingDraft: { width: 12, depth: 18, floors: 8, floorHeight: 3 },
      placeKind: null,
      placeRotation: 0,
      stairMode: 'droit',
      roofMode: '2pentes',
      polyDrawMode: 'polygon',
      cadNote: null,
      coupeAxis: 'horizontal',
      coupeCut: 1.4,
      arMode: 'poser',
      workspace: 'modele',
      studioPanel: null,
      layers: { ...DEFAULT_LAYERS },
      phase4d: 1,
      radialOpen: false,

      getActive: () => {
        const { projects, activeId } = get()
        return activeId ? projects[activeId] ?? null : null
      },

      touch: () => {
        const { activeId, projects } = get()
        if (!activeId || !projects[activeId]) return
        set({
          projects: {
            ...projects,
            [activeId]: { ...projects[activeId], updatedAt: Date.now() },
          },
        })
      },

      commit: (mutator) => {
        const { activeId, projects, undoStack } = get()
        if (!activeId || !projects[activeId]) return
        const prev = projects[activeId]
        const next = { ...mutator(prev), updatedAt: Date.now() }
        const stack = [...undoStack, prev].slice(-HISTORY_MAX)
        set({
          projects: { ...projects, [activeId]: next },
          undoStack: stack,
          redoStack: [],
        })
      },

      patchNow: (mutator) => {
        const { activeId, projects } = get()
        if (!activeId || !projects[activeId]) return
        const next = { ...mutator(projects[activeId]), updatedAt: Date.now() }
        set({ projects: { ...projects, [activeId]: next } })
      },

      select: (sel) => set({ selection: sel }),
      setView: (v) => {
        set({ viewMode: v })
        if (v === 'coupe') get().syncCoupeToStory()
      },
      setSkill: (s) => {
        const patch: Partial<StoreState> = { skill: s }
        if (s === 'simple' && (get().viewMode === 'coupe' || get().viewMode === 'ar')) {
          patch.viewMode = '3d'
        }
        set(patch)
      },
      setInspectorOpen: (open) =>
        set(open ? { inspectorOpen: true } : { inspectorOpen: false, studioPanel: null, radialOpen: false }),
      setInspectorTab: (t) => set({ inspectorTab: t, studioPanel: null }),
      setTool: (t) =>
        set({
          tool: t,
          placeKind: t === 'objects' ? get().placeKind : null,
        }),
      setStairMode: (m) => set({ stairMode: m }),
      setRoofMode: (m) => set({ roofMode: m }),
      setPolyDrawMode: (m) => set({ polyDrawMode: m }),
      setActiveStory: (id) => {
        set({ activeStoryId: id })
        if (get().viewMode === 'coupe') get().syncCoupeToStory()
      },
      setDockHeight: (h) => set({ dockHeight: Math.min(70, Math.max(30, h)) }),
      setOrtho: (v) => set({ ortho: v }),
      setMassingDraft: (partial) =>
        set({ massingDraft: { ...get().massingDraft, ...partial } }),

      setActive: (id) => {
        const p = get().projects[id]
        set({
          activeId: id,
          activeStoryId: p?.stories[0]?.id ?? null,
          selection: null,
          inspectorOpen: false,
          tool: 'select',
          undoStack: [],
          redoStack: [],
        })
      },

      undo: () => {
        const { undoStack, redoStack, activeId, projects } = get()
        if (!activeId || undoStack.length === 0) return
        const prev = undoStack[undoStack.length - 1]
        const current = projects[activeId]
        set({
          projects: { ...projects, [activeId]: prev },
          undoStack: undoStack.slice(0, -1),
          redoStack: current ? [...redoStack, current] : redoStack,
        })
      },

      redo: () => {
        const { undoStack, redoStack, activeId, projects } = get()
        if (!activeId || redoStack.length === 0) return
        const next = redoStack[redoStack.length - 1]
        const current = projects[activeId]
        set({
          projects: { ...projects, [activeId]: next },
          redoStack: redoStack.slice(0, -1),
          undoStack: current ? [...undoStack, current] : undoStack,
        })
      },

      generateMassingAction: (params) => {
        const draft = params ?? get().massingDraft
        const ok = window.confirm(
          `Remplacer la geometrie par un massing ${draft.width}x${draft.depth} m, ${draft.floors} niveaux (HSP ${draft.floorHeight} m) ?`,
        )
        if (!ok) return
        get().commit((p) => {
          const geo = generateMassing(draft)
          return { ...p, ...geo }
        })
        const active = get().getActive()
        if (active?.stories[0]) set({ activeStoryId: active.stories[0].id })
      },

      duplicateProject: (id) => {
        const src = get().projects[id]
        if (!src) return null
        const newId = uid('proj')
        const copy: Project = {
          ...structuredClone(src),
          id: newId,
          meta: { ...src.meta, name: `${src.meta.name} (copie)` },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set({ projects: { ...get().projects, [newId]: copy } })
        return newId
      },

      newSketch: () => {
        const p = newSketchProject()
        set({ projects: { ...get().projects, [p.id]: p } })
        return p.id
      },

      addWall: (wall) => {
        let note: string | undefined
        get().commit((p) => {
          const id = uid('wall')
          const withWall = { ...p, walls: [...p.walls, { ...wall, id }] }
          const healed = healWallTJoints(withWall, id)
          note = healed.note
          return healed.project
        })
        if (note) set({ cadNote: note })
      },

      setPlaceKind: (k) => set({ placeKind: k, tool: k ? 'objects' : get().tool }),
      setPlaceRotation: (r) => set({ placeRotation: r }),
      rotatePlace: () => set({ placeRotation: (get().placeRotation + Math.PI / 2) % (Math.PI * 2) }),
      clearCadNote: () => set({ cadNote: null }),

      setCoupeAxis: (a) => set({ coupeAxis: a }),
      setCoupeCut: (v) => set({ coupeCut: v }),
      setArMode: (m) => set({ arMode: m }),
      syncCoupeToStory: () => {
        const { getActive, activeStoryId, coupeAxis } = get()
        const p = getActive()
        if (!p) return
        const story =
          (activeStoryId ? p.stories.find((s) => s.id === activeStoryId) : null) ??
          p.stories[0]
        if (!story) return
        if (coupeAxis === 'horizontal') {
          set({ coupeCut: Math.round((story.elevation + story.height * 0.5) * 100) / 100 })
        } else {
          set({ coupeCut: 0 })
        }
      },

      addFurnitureAt: (pos) => {
        const { placeKind, placeRotation, activeStoryId, getActive } = get()
        const project = getActive()
        if (!placeKind || !project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        get().commit((p) => placeFurniture(p, storyId, placeKind, pos, placeRotation, true))
        get().select(null)
      },

      applyTrim: (wallId, cutPoint) => {
        let note: string | undefined
        get().commit((p) => {
          const res = trimWall(p, wallId, cutPoint)
          note = res.note
          return res.project
        })
        if (note) set({ cadNote: note })
      },

      applyExtend: (wallId, targetWallId) => {
        let note: string | undefined
        get().commit((p) => {
          const res = extendWallDetailed(p, wallId, targetWallId)
          note = res.note
          return res.project
        })
        if (note) set({ cadNote: note })
      },

      applyTJoint: (wallAId, wallBId, preferEnd) => {
        let note: string | undefined
        get().commit((p) => {
          const res = makeTJoint(p, wallAId, wallBId, preferEnd)
          note = res.note
          return res.project
        })
        if (note) set({ cadNote: note })
      },

      addOpeningAtWall: (wallId, t, kind) => {
        let openingId: string | null = null
        get().commit((p) => {
          const res = placeOpeningAtWall(p, wallId, t, kind)
          openingId = res.openingId
          return res.project
        })
        if (openingId) {
          get().select({ kind: 'opening', id: openingId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      addSlab: (a, b, kind = 'floor') => {
        const { activeStoryId, getActive } = get()
        const project = getActive()
        if (!project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        let slabId: string | null = null
        get().commit((p) => {
          const res = placeSlabRect(p, storyId, snapGrid(a), snapGrid(b), kind)
          slabId = res.slabId
          return res.project
        })
        if (slabId) {
          get().select({ kind: 'slab', id: slabId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      addColumn: (pos) => {
        const { activeStoryId, getActive } = get()
        const project = getActive()
        if (!project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        let columnId: string | null = null
        get().commit((p) => {
          const res = placeColumnAt(p, storyId, pos)
          columnId = res.columnId
          return res.project
        })
        if (columnId) {
          get().select({ kind: 'column', id: columnId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      addStair: (a, b) => {
        get().addStairPath([a, b], 'droit')
      },

      addStairPath: (path, mode) => {
        const { activeStoryId, getActive, stairMode } = get()
        const project = getActive()
        if (!project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        let stairId: string | null = null
        const m = mode ?? stairMode
        get().commit((p) => {
          const res = placeStairPath(p, storyId, path, m)
          stairId = res.stairId
          return res.project
        })
        if (stairId) {
          get().select({ kind: 'stair', id: stairId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      addSlabPolygon: (polygon, kind = 'floor') => {
        const { activeStoryId, getActive } = get()
        const project = getActive()
        if (!project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        let slabId: string | null = null
        get().commit((p) => {
          const res = placeSlabPolygon(p, storyId, polygon, kind)
          slabId = res.slabId
          return res.project
        })
        if (slabId) {
          get().select({ kind: 'slab', id: slabId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      addRoof: (a, b) => {
        const { activeStoryId, getActive, roofMode } = get()
        const project = getActive()
        if (!project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        let roofId: string | null = null
        get().commit((p) => {
          const res = placeRoofRect(p, storyId, snapGrid(a), snapGrid(b))
          roofId = res.roofId
          if (!roofId) return res.project
          return {
            ...res.project,
            roofs: res.project.roofs.map((r) =>
              r.id === roofId ? { ...r, mode: roofMode } : r,
            ),
          }
        })
        if (roofId) {
          get().select({ kind: 'roof', id: roofId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      addRoofPolygon: (polygon) => {
        const { activeStoryId, getActive, roofMode } = get()
        const project = getActive()
        if (!project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        let roofId: string | null = null
        get().commit((p) => {
          const res = placeRoofPolygon(p, storyId, polygon)
          roofId = res.roofId
          if (!roofId) return res.project
          return {
            ...res.project,
            roofs: res.project.roofs.map((r) =>
              r.id === roofId ? { ...r, mode: roofMode } : r,
            ),
          }
        })
        if (roofId) {
          get().select({ kind: 'roof', id: roofId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      addRailingPath: (path) => {
        const { activeStoryId, getActive } = get()
        const project = getActive()
        if (!project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        let railingId: string | null = null
        get().commit((p) => {
          const res = placeRailingPath(p, storyId, path)
          railingId = res.railingId
          return res.project
        })
        if (railingId) {
          get().select({ kind: 'railing', id: railingId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      /** One-click place for column (and door/window via wall hit in UI). */
      placeAtPoint: (pos) => {
        const tool = get().tool
        if (tool === 'column') get().addColumn(pos)
        else if (tool === 'objects') get().addFurnitureAt(pos)
      },

      setWorkspace: (w) => set({ workspace: w }),
      setStudioPanel: (id) => set({ studioPanel: id }),
      openStudioPanel: (id) =>
        set({ studioPanel: id, inspectorOpen: true, radialOpen: false }),
      setRadialOpen: (open) => set({ radialOpen: open }),
      setLayer: (key, value) => set({ layers: { ...get().layers, [key]: value } }),
      setPhase4d: (v) => set({ phase4d: Math.min(1, Math.max(0, v)) }),

      assignMaterialToSelection: (materialId) => {
        const sel = get().selection
        if (!sel) return
        get().commit((p) => {
          if (sel.kind === 'wall') {
            return {
              ...p,
              walls: p.walls.map((w) => (w.id === sel.id ? { ...w, materialId } : w)),
            }
          }
          if (sel.kind === 'slab') {
            return {
              ...p,
              slabs: p.slabs.map((s) => (s.id === sel.id ? { ...s, materialId } : s)),
            }
          }
          if (sel.kind === 'railing') {
            return {
              ...p,
              railings: (p.railings ?? []).map((r) =>
                r.id === sel.id ? { ...r, materialId } : r,
              ),
            }
          }
          return p
        })
      },

      copyActiveStory: () => {
        const { activeStoryId, getActive } = get()
        const p = getActive()
        if (!p || !activeStoryId) return
        get().commit((proj) => copyStory(proj, activeStoryId))
        const next = get().getActive()
        if (next?.stories.length) {
          set({ activeStoryId: next.stories[next.stories.length - 1]!.id })
        }
      },

      repeatActiveStories: (count) => {
        const { activeStoryId, getActive } = get()
        const p = getActive()
        if (!p || !activeStoryId) return
        const n = Math.min(Math.max(1, Math.floor(count)), 80 - p.stories.length)
        if (n <= 0) return
        get().commit((proj) => repeatStories(proj, activeStoryId, n))
      },

      runCopilotPrompt: (prompt) => {
        const parsed = parseMassingPrompt(prompt)
        if (!parsed.ok) return parsed.message
        get().setMassingDraft(parsed.params)
        get().generateMassingAction(parsed.params)
        return parsed.summary
      },
    }),
    {
      name: 'forma-studio-v9',
      partialize: (s) => ({
        projects: s.projects,
        skill: s.skill,
        dockHeight: s.dockHeight,
        massingDraft: s.massingDraft,
        workspace: s.workspace,
        layers: s.layers,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<StoreState> | undefined
        const seeds = seedMap()
        let fromPersist = p?.projects ?? {}
        // One-shot bridge from v10 quality-pass key if v9 empty of user projects
        if (typeof localStorage !== 'undefined') {
          try {
            const raw10 = localStorage.getItem('forma-studio-v10')
            if (raw10) {
              const parsed = JSON.parse(raw10) as { state?: { projects?: Record<string, Project> } }
              const p10 = parsed.state?.projects ?? {}
              if (Object.keys(fromPersist).length === 0 && Object.keys(p10).length > 0) {
                fromPersist = p10
              } else {
                fromPersist = { ...p10, ...fromPersist }
              }
            }
          } catch {
            /* ignore */
          }
        }
        const merged = { ...seeds, ...fromPersist }
        // Force-refresh demo seeds so premium geometry always wins
        for (const [k, v] of Object.entries(seeds)) {
          merged[k] = v
        }
        for (const proj of Object.values(merged)) {
          if (!proj) continue
          if (!proj.railings) proj.railings = []
          if (!proj.survey) proj.survey = { notes: '', points: [] }
          if (!proj.revisions) proj.revisions = []
          if (proj.meta.ces == null) proj.meta.ces = 0.4
          if (proj.meta.cos == null) proj.meta.cos = 1.2
          if (proj.meta.sismo == null) proj.meta.sismo = '2'
          for (const roof of proj.roofs ?? []) {
            if (!roof.mode) roof.mode = 'terrasse'
            if (roof.pitchDeg == null) roof.pitchDeg = 30
          }
          for (const stair of proj.stairs ?? []) {
            if (stair.railings === undefined) stair.railings = true
            if (stair.railingHeight == null) stair.railingHeight = 1.0
          }
        }
        return {
          ...current,
          ...p,
          projects: merged,
        }
      },
    },
  ),
)
