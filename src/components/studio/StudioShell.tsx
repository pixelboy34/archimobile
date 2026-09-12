import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  Building2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { findWallAt } from "@/lib/bim/geometry";
import { deliverDossier } from "@/lib/bim/dossier";
import type { Project, ViewMode, WorkspaceMode } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";
import { AnalysisPanel } from "./AnalysisPanel";
import { CollabPanel } from "./CollabPanel";
import { normalizeRoomCode } from "@/lib/multiplayer/collab";
import { ConstructPanel } from "./ConstructPanel";
import { CopilotPanel } from "./CopilotPanel";
import { HelpPanel } from "./HelpPanel";
import { Joystick } from "./Joystick";
import { LayersPanel } from "./LayersPanel";
import { NavCoach } from "./NavCoach";
import { NomenclaturePanel } from "./NomenclaturePanel";
import { NavPad } from "./NavPad";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { OfflineMaquettesPanel } from "@/components/pwa/OfflineMaquettesPanel";
import { RadialMenu, type OverflowAction } from "./RadialMenu";
import { dispatchCam } from "@/lib/viewport/cam";
import { StructurePanel } from "./StructurePanel";
import { Plan2D } from "./Plan2D";
import { InspectorDock } from "./InspectorDock";
import type { ParamsTab } from "./PropertiesPanel";
import { StudioHud } from "./StudioHud";
import { ViewBar } from "./ViewBar";
import { Viewfinder } from "./Viewfinder";
import { CommandOrb } from "./CommandOrb";
import { ReleveBar } from "./ReleveBar";
import { ResourcesPeek } from "./ResourcesPeek";
import { BuildingAssistant } from "./BuildingAssistant";
import {
  deferHelpForMassingCta,
  markHelpDismissed,
} from "@/lib/nav/overlays";

const WORKSPACES: { id: WorkspaceMode; label: string }[] = [
  { id: "esquisse", label: "Esq" },
  { id: "modele", label: "Modèle" },
  { id: "releve", label: "Rel" },
];

export function StudioShell({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const hydrated = useStudio((s) => s.hydrated);
  const openProject = useStudio((s) => s.openProject);
  const current = useStudio((s) => s.projects.find((p) => p.id === projectId) ?? s.current());
  const tool = useStudio((s) => s.tool);
  const view = useStudio((s) => s.view);
  const workspace = useStudio((s) => s.workspace);
  const setWorkspace = useStudio((s) => s.setWorkspace);
  const storyId = useStudio((s) => s.storyId);
  const selectedIds = useStudio((s) => s.selectedIds);
  const snap = useStudio((s) => s.snap);
  const grid = useStudio((s) => s.grid);
  const sunHour = useStudio((s) => s.sunHour);
  const clipY = useStudio((s) => s.clipY);
  const setTool = useStudio((s) => s.setTool);
  const setView = useStudio((s) => s.setView);
  const select = useStudio((s) => s.select);
  const addWall = useStudio((s) => s.addWall);
  const addOpeningAt = useStudio((s) => s.addOpeningAt);
  const addFurniture = useStudio((s) => s.addFurniture);
  const addColumnAt = useStudio((s) => s.addColumnAt);
  const addStairAt = useStudio((s) => s.addStairAt);
  const addSlabAt = useStudio((s) => s.addSlabAt);
  const addRoofAt = useStudio((s) => s.addRoofAt);
  const deleteSelected = useStudio((s) => s.deleteSelected);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const setClipY = useStudio((s) => s.setClipY);
  const playing = useStudio((s) => s.playing);
  const duplicateSelected = useStudio((s) => s.duplicateSelected);
  const rotateSelected = useStudio((s) => s.rotateSelected);
  const moveSelected = useStudio((s) => s.moveSelected);
  const setDraft = useStudio((s) => s.setDraft);
  const setMeasure = useStudio((s) => s.setMeasure);

  const [panel, setPanel] = useState<
    null | "ai" | "mats" | "chantier" | "help" | "studio" | "ouvrages" | "struct" | "layers" | "analyse" | "nomen" | "building" | "collab" | "offline"
  >(null);
  const [inspector, setInspector] = useState<ParamsTab | null>(null);
  const [radial, setRadial] = useState(false);
  const [resources, setResources] = useState<null | "materials" | "objects" | "both">(null);
  const shiftRef = useRef(false);

  /*
   * Basculer vers le plan REMPLACAIT le Canvas dans le JSX : R3F le demonte, donc
   * appelle forceContextLoss(). Mesure sur Tour Horizon, 8 allers-retours
   * Plan/3D : 9 contextes crees, 8 perdus, 24 programmes et 21 textures rebatis
   * a chaque retour, 285 a 649 ms d'ecran vide a 1280x800 et 216 a 369 ms a
   * 390x844 — sur le geste le plus frequent du studio. Le Canvas reste donc
   * monte et on ne pilote que sa visibilite.
   */
  const plan2d = view === "plan" || workspace === "esquisse" || workspace === "releve";
  const show3d = view !== "ar" && !plan2d;
  const [seen3d, setSeen3d] = useState(false);
  useEffect(() => {
    if (show3d) setSeen3d(true);
  }, [show3d]);
  /*
   * Tant que le plan est devant, on redonne a React le MEME element : il saute
   * le rendu du sous-arbre, aucune invalidation n'atteint la scene et le canvas
   * masque ne coute rien. Au retour, un element neuf porte l'etat courant.
   */
  const viewport3d = useRef<ReactNode>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const pick = (ids: string[]) => {
    if (shiftRef.current && ids[0]) {
      const cur = useStudio.getState().selectedIds;
      const id = ids[0]!;
      select(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
      return;
    }
    select(ids);
  };

  useEffect(() => {
    const s = useStudio.getState();
    s.setHydrated(true);
    const hit = s.projects.find((p) => p.id === projectId);
    if (hit) {
      // `currentId` est persisté, `storyId` ne l'est pas. Rouvrir directement une
      // URL /studio/<id> déjà courante sautait donc `openProject`, seul endroit
      // qui pose le niveau : `storyId` restait nul et `placeAt` sortait sur sa
      // garde. Mesuré : outil Mur actif, deux appuis sur le plan, 38 murs avant
      // et 38 après — aucun tracé possible tant qu'on n'avait pas changé de
      // niveau une fois. Le garde couvre aussi un niveau supprimé entre-temps.
      if (s.currentId !== projectId) s.openProject(projectId);
      else if (!hit.stories.some((st) => st.id === s.storyId)) {
        const premier = hit.stories[0]?.id;
        if (premier) s.setStory(premier);
      }
      return;
    }
    const fallback = s.current() ?? s.projects[0];
    if (fallback) {
      s.openProject(fallback.id);
      void navigate({ to: "/studio/$projectId", params: { projectId: fallback.id }, replace: true });
    }
  }, [projectId, navigate]);

  useEffect(() => {
    const on = () => setInspector("rendu");
    window.addEventListener("forma-open-nav", on);
    return () => window.removeEventListener("forma-open-nav", on);
  }, []);

  useEffect(() => {
    const onLib = () => {
      setInspector(null);
      setRadial(false);
      setResources("objects");
      setTool("furniture");
    };
    window.addEventListener("forma-open-library", onLib);
    return () => window.removeEventListener("forma-open-library", onLib);
  }, [setTool]);

  useEffect(() => {
    const on = () => {
      setInspector(null);
      setRadial(false);
      setPanel("nomen");
    };
    window.addEventListener("forma-open-nomen", on);
    return () => window.removeEventListener("forma-open-nomen", on);
  }, []);

  useEffect(() => {
    if (inspector) setResources(null);
  }, [inspector]);

  useEffect(() => {
    if (radial) setResources(null);
  }, [radial]);

  useEffect(() => {
    const root = document.querySelector(".studio-canvas");
    if (!root) return;
    let timer = 0;
    const down = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "CANVAS") {
        root.classList.add("is-sculpting");
        window.clearTimeout(timer);
      }
    };
    const up = () => {
      timer = window.setTimeout(() => root.classList.remove("is-sculpting"), 850);
    };
    root.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      root.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.clearTimeout(timer);
    };
  }, [view, projectId]);

  // Deep link: /?collab=CODE → open Collab sheet + join once hydrated
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("collab");
    if (!raw) return;
    const code = normalizeRoomCode(raw);
    if (code.length < 4) return;
    setPanel("collab");
    const state = useStudio.getState();
    if (state.collabRoom !== code) {
      state.startCollab(code);
    }
    params.delete("collab");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !current) return;
    // Don't auto-open Guide when massing CTA is visible
    if (current.walls.length === 0) {
      deferHelpForMassingCta();
      return;
    }
  }, [hydrated, current]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const s = useStudio.getState();
      if (s.buildPhase >= 7) {
        s.setPlaying(false);
        return;
      }
      s.setBuildPhase(s.buildPhase + 1);
    }, 900);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      /*
       * Tab et Espace appartiennent au navigateur, pas au studio. Les capter
       * rendait le chrome injouable au clavier : 16 Tab a 393x852 atteignaient
       * 0 des 31 controles interactifs, tous a tabIndex=0, et un bouton
       * focalise n'emettait plus aucun clic a la barre d'espace. Le cycle
       * d'etages passe sur PageUp/PageDown et les crochets, sans role standard.
       *
       * Espace conserve la bascule d'outil, mais seulement quand le focus est
       * sur le fond : sur un controle, il l'active.
       */
      const onControl =
        t instanceof HTMLElement &&
        Boolean(t.closest('button, a[href], summary, [role="button"], [tabindex]:not([tabindex="-1"])'));
      if (e.key === "Escape") {
        setDraft(null);
        setMeasure(null);
        setTool("select");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "f" || e.key === "F" || e.key === "Home") {
        e.preventDefault();
        dispatchCam({ kind: "fit" });
      } else if (e.key === "1") {
        dispatchCam({ kind: "iso" });
      } else if (e.key === "2") {
        dispatchCam({ kind: "top" });
      } else if (e.key === "3") {
        dispatchCam({ kind: "front" });
      } else if (e.key === "g" || e.key === "G") {
        const s = useStudio.getState();
        s.setGrid(!s.grid);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "PageUp" || e.key === "]") {
        e.preventDefault();
        useStudio.getState().cycleStory(1);
      } else if (e.key === "PageDown" || e.key === "[") {
        e.preventDefault();
        useStudio.getState().cycleStory(-1);
      } else if (e.code === "Space" && !onControl) {
        e.preventDefault();
        const st = useStudio.getState();
        if (st.tool === "select") st.setTool(st.lastDrawTool || "wall");
        else st.setTool("select");
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "w") setTool("wall");
        else if (k === "d") setTool("door");
        else if (k === "e") setTool("window");
        else if (k === "t") {
          setTool("furniture");
        } else if (k === "m") setTool("measure");
        else if (k === "r") {
          e.preventDefault();
          rotateSelected(Math.PI / 2);
        } else if (k === "o") {
          const s = useStudio.getState();
          s.setOrtho(!s.ortho);
        } else if (
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown"
        ) {
          const s = useStudio.getState();
          if (!s.selectedIds.length) return;
          const step = e.shiftKey ? 0.5 : s.snapStep || 0.1;
          e.preventDefault();
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
          moveSelected(dx, dy);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, undo, redo, duplicateSelected, rotateSelected, moveSelected, setDraft, setMeasure, setTool]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-muted">
        Chargement du studio…
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
        <p className="font-display text-lg font-semibold">Projet introuvable</p>
        <p className="max-w-sm text-sm text-muted">
          Ce fichier n’est plus dans le studio — il a peut-être été supprimé sur cet appareil.
        </p>
        <Button asChild>
          <Link to="/">Retour aux projets</Link>
        </Button>
      </div>
    );
  }

  const activeStory = storyId ?? current.stories[0]!.id;

  if (show3d) {
    viewport3d.current = (
      <ViewportGate
        project={current}
        selectedIds={selectedIds}
        onSelect={(id) => pick(id ? [id] : [])}
        view={view}
        sunHour={sunHour}
        clipY={clipY}
      />
    );
  }

  /*
   * Layout zones (mobile-first):
   * TOP — project header (back, name, Esq/Modèle/Rel, Amateur/Expert, Studio)
   * TOP-LEFT — ViewBar (vues + niveaux only)
   * TOP under — thin StudioHud status line (mode · outil · dims · types liés)
   * BOTTOM — CommandOrb (Concevoir | Modifier capsule) + ResourcesPeek strip
   * BOTTOM — CommandOrb; InspectorDock bottom sheet (phone) / right rail (lg)
   */
  return (
    <div className="relative h-dvh overflow-hidden bg-bg text-fg">
      <Toaster theme="dark" position="top-center" toastOptions={{ className: "forma-toast" }} />
      <div className={`absolute inset-0 studio-canvas bg-elevated ${inspector || radial || resources ? "has-inspector" : ""}`}>
        {view === "ar" ? (
          <ArGate project={current} />
        ) : (
          <>
            {seen3d && (
              <div
                className="absolute inset-0"
                style={{ visibility: show3d ? "visible" : "hidden", pointerEvents: show3d ? undefined : "none" }}
                aria-hidden={!show3d}
              >
                {viewport3d.current}
              </div>
            )}
            {plan2d && (
              <Plan2D
                project={current}
                storyId={activeStory}
                tool={tool}
                snap={snap}
                grid={grid}
                selectedIds={selectedIds}
                onSelect={pick}
                onWall={addWall}
                onOpening={addOpeningAt}
                onFurniture={addFurniture}
                onColumn={addColumnAt}
                onStair={addStairAt}
                onSlab={addSlabAt}
                onRoof={addRoofAt}
                onDeletePoint={(p) => {
                  const hit = findWallAt(current, activeStory, p, 0.5);
                  if (hit) {
                    select([hit.wall.id]);
                    deleteSelected();
                  }
                }}
              />
            )}
          </>
        )}

        {view !== "ar" && <Viewfinder />}
        {view === "visite" && <Joystick />}
        {(view === "3d" || view === "coupe") && workspace === "modele" && <NavPad />}
        {view === "3d" && workspace === "modele" && (
          <NavCoach
            helpOpen={panel === "help" || panel === "building"}
            installVisible={false}
            massingCta={current.walls.length === 0 && tool === "select"}
          />
        )}
        {view !== "ar" && <ViewBar project={current} onStories={() => setInspector("niveaux")} />}
        <StudioHud />

        {current.walls.length === 0 && tool === "select" && panel === null && !inspector && !radial && !resources && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 pb-36">
            <div className="pointer-events-auto panel-card max-w-xs px-4 py-4 text-center">
              <p className="font-display text-sm font-semibold">Esquisse vide</p>
              <p className="mt-1.5 text-xs text-muted">
                Relevé terrain, massing Bâtiment, ou tracer un mur.
              </p>
              <button
                type="button"
                onClick={() => setPanel("building")}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-fg"
              >
                <Building2 className="size-4" />
                Bâtiment
              </button>
              <button
                type="button"
                onClick={() => setWorkspace("releve")}
                className="mt-1.5 h-10 w-full rounded-xl border border-accent/35 bg-accent/10 text-sm font-medium text-accent"
              >
                Relevé
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkspace("esquisse");
                  setView("plan");
                  setTool("wall");
                }}
                className="mt-1.5 h-10 w-full rounded-xl text-sm text-muted hover:bg-elevated"
              >
                Tracer un mur
              </button>
            </div>
          </div>
        )}

        {/* CommandOrb regroupe Concevoir / Modifier — ResourcesPeek pour matériaux & biblio */}

        {view === "coupe" && (
          <div className="pointer-events-auto absolute top-[calc(env(safe-area-inset-top)+7.5rem)] right-3 left-3 panel-card px-3 py-2">
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium tracking-wide text-fg uppercase">Hauteur coupe</span>
                <span className="font-mono text-[11px] tabular text-accent">{Math.round(clipY * 100)} %</span>
              </div>
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.02}
                value={clipY}
                onChange={(e) => setClipY(Number(e.target.value))}
                className="w-full accent-accent"
                aria-label="Hauteur coupe"
              />
            </label>
          </div>
        )}

        <ResourcesPeek
          open={resources !== null || tool === "furniture"}
          mode={tool === "furniture" && !resources ? "objects" : resources ?? "both"}
          onClose={() => {
            setResources(null);
            if (tool === "furniture") setTool("select");
          }}
        />
        <RadialMenu
          open={radial}
          onClose={() => setRadial(false)}
          onAction={(id: OverflowAction) => {
            setRadial(false);
            const hasSketch = (current.survey?.length ?? 0) > 0 || (current.strokes?.length ?? 0) > 0;
            if (id === "dossier") {
              if (current.walls.length === 0 && !hasSketch) return;
              const r = deliverDossier(current);
              toast.success(`Dossier · ${r.planCount} plans · IFC+DXF+CSV`);
              return;
            }
            if (id === "faisabilite") {
              setInspector("projet");
              return;
            }
            if (id === "building") setPanel("building");
            else if (id === "struct") setPanel("struct");
            else if (id === "analyse") setPanel("analyse");
            else if (id === "nomen") setPanel("nomen");
            else if (id === "ai") setPanel("ai");
            else if (id === "chantier") setPanel("chantier");
            else if (id === "collab") setPanel("collab");
            else if (id === "offline") setPanel("offline");
            else if (id === "layers") setPanel("layers");
            else if (id === "help") setPanel("help");
          }}
        />

        <header className="pointer-events-none absolute inset-x-0 top-0 z-20">
          <div className="pointer-events-auto absolute top-[max(0.25rem,env(safe-area-inset-top))] left-1 flex max-w-[46%] items-center gap-0.5">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/" aria-label="Projets">
                <ChevronLeft className="size-5" />
              </Link>
            </Button>
            <p className="min-w-0 truncate font-display text-sm font-semibold tracking-tight drop-shadow-[0_1px_8px_rgba(11,13,16,0.85)]">
              {current.name}
            </p>
          </div>
          <div className="pointer-events-auto absolute top-[max(0.25rem,env(safe-area-inset-top))] right-1.5 flex items-center gap-1">
            <div className="flex shrink-0 rounded-full border border-border/50 bg-surface/55 p-0.5 backdrop-blur-sm">
              {WORKSPACES.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWorkspace(w.id)}
                  className={`h-8 min-h-8 shrink-0 rounded-full px-2.5 text-[11px] font-medium tracking-wide ${
                    workspace === w.id ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "text-muted"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <HeaderSkillToggle />
          </div>
        </header>

        <div
          className={`pointer-events-none absolute right-0 bottom-0 left-0 z-20 ${
            inspector ? "hidden lg:block lg:pr-[22.5rem]" : ""
          }`}
        >
          <div className="pointer-events-auto flex w-full flex-col items-stretch bg-gradient-to-t from-bg/50 to-transparent px-2 pt-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
            <ReleveBar />
            <CommandOrb
              onParams={() => setInspector(selectedIds.length ? "ouvrage" : "niveaux")}
              onResources={(mode) => setResources(mode ?? "both")}
              onOverflow={() => setRadial((v) => !v)}
            />
          </div>
        </div>
        {inspector && (
          <InspectorDock tab={inspector} onTab={setInspector} onClose={() => setInspector(null)} />
        )}
      </div>
      <InstallBanner compact blocked={panel === "help" || panel === "building" || (current.walls.length === 0 && tool === "select")} />

      <Sheet open={panel === "layers"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Calques">
          <LayersPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "struct"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Structure" tall>
          <StructurePanel />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "chantier"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Chantier" tall>
          <ConstructPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "offline"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Maquettes hors ligne" tall>
          <OfflineMaquettesPanel projectId={projectId} />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "collab"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Collab" tall>
          <CollabPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "analyse"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Chiffres & faisabilité" tall>
          <AnalysisPanel
            onOpenVue={() => {
              setPanel(null);
              setInspector("rendu");
            }}
          />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "nomen"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Nomenclatures" half>
          <NomenclaturePanel />
        </SheetContent>
      </Sheet>
      <Sheet
        open={panel === "help"}
        onOpenChange={(o) => {
          if (!o) {
            markHelpDismissed();
            setPanel(null);
          }
        }}
      >
        <SheetContent title="Guide">
          <HelpPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "building"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Bâtiment" tall>
          <BuildingAssistant onDone={() => setPanel(null)} />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "ai"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Copilote IA" onPointerDownOutside={() => setPanel(null)} tall>
          <CopilotPanel onApplied={() => setPanel(null)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}


function HeaderSkillToggle() {
  const skill = useStudio((s) => s.skill);
  const setSkill = useStudio((s) => s.setSkill);
  return (
    <div className="seg shrink-0 text-[11px] tracking-wide">
      <button
        type="button"
        onClick={() => setSkill("simple")}
        className={`seg-item h-8 min-h-8 px-2.5 ${skill === "simple" ? "seg-item-on" : ""}`}
      >
        Amateur
      </button>
      <button
        type="button"
        onClick={() => setSkill("pro")}
        className={`seg-item h-8 min-h-8 px-2.5 ${skill === "pro" ? "seg-item-on" : ""}`}
      >
        Expert
      </button>
    </div>
  );
}

function ArGate({ project }: { project: Project }) {
  const [Comp, setComp] = useState<null | typeof import("./ArView").ArView>(null);
  useEffect(() => {
    void import("./ArView").then((m) => setComp(() => m.ArView));
  }, []);
  if (!Comp) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">Réalité augmentée…</div>;
  }
  return <Comp project={project} />;
}

function ViewportGate({
  project,
  selectedIds,
  onSelect,
  view,
  sunHour,
  clipY,
}: {
  project: Project;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  view: ViewMode;
  sunHour: number;
  clipY: number;
}) {
  const [Comp, setComp] = useState<null | typeof import("./Viewport3D").Viewport3D>(null);
  useEffect(() => {
    void import("./Viewport3D").then((m) => setComp(() => m.Viewport3D));
  }, []);
  if (!Comp) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">Rendu 3D…</div>
    );
  }
  return (
    <Comp
      project={project}
      selectedIds={selectedIds}
      onSelect={onSelect}
      view={view}
      sunHour={sunHour}
      clipY={clipY}
    />
  );
}

