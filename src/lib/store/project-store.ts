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
} from '../bim/types'
import { uid } from '../bim/types'
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
  snapGrid,
} from '../cad/ops'

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
  polyDrawMode: 'polygon' | 'rect'
  cadNote: string | null
  coupeAxis: 'horizontal' | 'vertical'
  coupeCut: number
  arMode: 'poser' | 'cote'

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
  setStairMode: (m: StairMode) => void
  setPolyDrawMode: (m: 'polygon' | 'rect') => void
  placeAtPoint: (pos: Vec2) => void
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
      polyDrawMode: 'polygon',
      cadNote: null,
      coupeAxis: 'horizontal',
      coupeCut: 1.4,
      arMode: 'poser',

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
      setInspectorOpen: (open) => set({ inspectorOpen: open }),
      setInspectorTab: (t) => set({ inspectorTab: t }),
      setTool: (t) =>
        set({
          tool: t,
          placeKind: t === 'objects' ? get().placeKind : null,
        }),
      setStairMode: (m) => set({ stairMode: m }),
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
        const { activeStoryId, getActive } = get()
        const project = getActive()
        if (!project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        let roofId: string | null = null
        get().commit((p) => {
          const res = placeRoofRect(p, storyId, snapGrid(a), snapGrid(b))
          roofId = res.roofId
          return res.project
        })
        if (roofId) {
          get().select({ kind: 'roof', id: roofId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      addRoofPolygon: (polygon) => {
        const { activeStoryId, getActive } = get()
        const project = getActive()
        if (!project) return
        const storyId = activeStoryId ?? project.stories[0]?.id
        if (!storyId) return
        let roofId: string | null = null
        get().commit((p) => {
          const res = placeRoofPolygon(p, storyId, polygon)
          roofId = res.roofId
          return res.project
        })
        if (roofId) {
          get().select({ kind: 'roof', id: roofId })
          set({ inspectorOpen: true, inspectorTab: 'ouvrage' })
        }
      },

      /** One-click place for column (and door/window via wall hit in UI). */
      placeAtPoint: (pos) => {
        const tool = get().tool
        if (tool === 'column') get().addColumn(pos)
        else if (tool === 'objects') get().addFurnitureAt(pos)
      },
    }),
    {
      name: 'forma-studio-v9',
      partialize: (s) => ({
        projects: s.projects,
        skill: s.skill,
        dockHeight: s.dockHeight,
        massingDraft: s.massingDraft,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<StoreState> | undefined
        const seeds = seedMap()
        const merged = { ...seeds, ...(p?.projects ?? {}) }
        // Ensure seed names stay available if missing
        for (const [k, v] of Object.entries(seeds)) {
          if (!merged[k]) merged[k] = v
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
