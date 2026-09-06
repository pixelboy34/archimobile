import { Link } from "@tanstack/react-router";
import {
  Columns3,
  BrickWall,
  ChevronLeft,
  HelpCircle,
  Layers,
  LayoutGrid,
  Palette,
  SlidersHorizontal,
  Sparkles,
  Hammer,
  Sun,
  Download,
  Building2,
  PackageCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { findWallAt } from "@/lib/bim/geometry";
import { downloadText, exportBimJson, exportQuantitiesCsv } from "@/lib/bim/quantities";
import { deliverDossier } from "@/lib/bim/dossier";
import { exportDxf } from "@/lib/cad/dxf";
import { exportIfc } from "@/lib/cad/ifc";
import type { Project, ViewMode, WorkspaceMode } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";
import { AnalysisPanel } from "./AnalysisPanel";
import { ConstructPanel } from "./ConstructPanel";
import { CopilotPanel } from "./CopilotPanel";
import { HelpPanel } from "./HelpPanel";
import { Joystick } from "./Joystick";
import { LibraryStrip } from "./LibraryStrip";
import { LayersPanel } from "./LayersPanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { OuvrageExplorer } from "./OuvrageExplorer";
import { NavCoach } from "./NavCoach";
import { NavPad } from "./NavPad";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { RadialMenu } from "./RadialMenu";
import { dispatchCam } from "./OrbitRig";
import { StructurePanel } from "./StructurePanel";
import { Plan2D } from "./Plan2D";
import { InspectorDock } from "./InspectorDock";
import type { ParamsTab } from "./PropertiesPanel";
import { StudioHud } from "./StudioHud";
import { ToolDock } from "./ToolDock";
import { ViewBar } from "./ViewBar";
import { Viewfinder } from "./Viewfinder";
import { ManipulationBar } from "./ManipulationBar";
import { BuildingAssistant } from "./BuildingAssistant";
import {
  deferHelpForMassingCta,
  markHelpDismissed,
  shouldAutoOpenHelp,
} from "@/lib/nav/overlays";

const WORKSPACES: { id: WorkspaceMode; label: string }[] = [
  { id: "esquisse", label: "Esq" },
  { id: "modele", label: "Modèle" },
  { id: "releve", label: "Rel" },
];

export function StudioShell({ projectId }: { projectId: string }) {
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
    null | "ai" | "mats" | "chantier" | "help" | "studio" | "ouvrages" | "struct" | "layers" | "analyse" | "building"
  >(null);
  const [inspector, setInspector] = useState<ParamsTab | null>(null);
  const [radial, setRadial] = useState(false);

  useEffect(() => {
    useStudio.getState().setHydrated(true);
  }, []);

  useEffect(() => {
    const on = () => setInspector("rendu");
    window.addEventListener("forma-open-nav", on);
    return () => window.removeEventListener("forma-open-nav", on);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    openProject(projectId);
  }, [hydrated, projectId, openProject]);

  useEffect(() => {
    if (!hydrated || !current) return;
    // Don't auto-open Guide when massing CTA is visible
    if (current.walls.length === 0) {
      deferHelpForMassingCta();
      return;
    }
    if (shouldAutoOpenHelp(current.walls.length)) setPanel("help");
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
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
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
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotateSelected(Math.PI / 2);
      } else if (e.key === "o" || e.key === "O") {
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
        const step = e.shiftKey ? 0.5 : 0.1;
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
        moveSelected(dx, dy);
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

  /*
   * Layout zones (mobile-first):
   * TOP — project header (back, name, Esq/Modèle/Rel, Amateur/Expert, Studio)
   * TOP-LEFT — ViewBar (vues + niveaux only)
   * TOP under — thin StudioHud status line (mode · outil · dims · types liés)
   * BOTTOM — CommandRail (ManipulationBar + ToolDock + Params/Radial) one glass surface
   * BOTTOM dock — InspectorDock replaces CommandRail when open (~52dvh)
   */
  return (
    <div className="relative h-dvh overflow-hidden bg-bg text-fg">
      <Toaster theme="dark" position="top-center" />
      <div className="absolute inset-0 studio-canvas bg-elevated">
        {view === "ar" ? (
          <ArGate project={current} />
        ) : view === "plan" || workspace === "esquisse" || workspace === "releve" ? (
          <Plan2D
            project={current}
            storyId={activeStory}
            tool={tool}
            snap={snap}
            grid={grid}
            selectedIds={selectedIds}
            onSelect={select}
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
        ) : (
          <ViewportGate
            project={current}
            selectedIds={selectedIds}
            onSelect={(id) => select(id ? [id] : [])}
            view={view}
            sunHour={sunHour}
            clipY={clipY}
          />
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

        {current.walls.length === 0 && tool === "select" && panel === null && !inspector && !radial && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 pb-36">
            <div className="pointer-events-auto panel-card max-w-xs px-4 py-4 text-center">
              <p className="font-display text-sm font-semibold">Esquisse vide</p>
              <p className="mt-1.5 text-xs text-muted">
                Tracez un mur ou générez un immeuble.
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
                onClick={() => setTool("wall")}
                className="mt-1.5 h-10 w-full rounded-xl text-sm text-muted hover:bg-elevated"
              >
                Tracer un mur
              </button>
            </div>
          </div>
        )}

        {/* ManipulationBar remplace InspectorPeek pour les actions de sélection */}

        {view === "coupe" && (
          <div className="pointer-events-auto absolute top-[calc(env(safe-area-inset-top)+7.5rem)] right-3 left-3 rounded-lg border border-border bg-surface/90 px-3 py-2">
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

        {tool === "furniture" && <LibraryStrip />}
        <RadialMenu
          open={radial}
          tool={tool}
          onTool={setTool}
          onClose={() => setRadial(false)}
          onStudio={() => setPanel("studio")}
        />

        <header className="pointer-events-none absolute top-0 right-0 left-0 z-20">
          <div className="pointer-events-auto flex items-center gap-1 bg-gradient-to-b from-bg/90 via-bg/45 to-transparent pt-[max(0.3rem,env(safe-area-inset-top))] pr-2 pb-3 pl-1">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/" aria-label="Projets">
                <ChevronLeft className="size-5" />
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold leading-tight tracking-tight">{current.name}</p>
            </div>
            <div className="flex shrink-0 rounded-full border border-border/60 bg-elevated/90 p-0.5">
              {WORKSPACES.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWorkspace(w.id)}
                  className={`h-8 shrink-0 rounded-full px-2.5 text-[11px] font-medium tracking-wide ${
                    workspace === w.id ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "text-muted"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <HeaderSkillToggle />
            <button
              type="button"
              aria-label="Studio"
              onClick={() => setPanel("studio")}
              className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2.5 text-[11px] font-medium tracking-wide text-accent uppercase"
            >
              <LayoutGrid className="size-3.5" />
              Studio
            </button>
          </div>
        </header>

        {!inspector && (
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-20">
          <div className="pointer-events-auto flex flex-col items-center bg-gradient-to-t from-bg/85 via-bg/30 to-transparent px-3 pt-8 pb-[max(0.45rem,env(safe-area-inset-bottom))]">
            <div className="cmd-rail w-full max-w-lg">
              <ManipulationBar
                onParams={() => setInspector(selectedIds.length ? "ouvrage" : "niveaux")}
                onMaterial={() => setPanel("mats")}
              />
              <div className="flex items-end gap-1.5">
                <div className="min-w-0 flex-1">
                  <ToolDock tool={tool} onTool={setTool} />
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    aria-label="Params"
                    onClick={() => setInspector(selectedIds.length ? "ouvrage" : "niveaux")}
                    className="flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/40"
                  >
                    <SlidersHorizontal className="size-4" />
                    <span className="text-[8px] tracking-wide uppercase">Params</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Outils rapides"
                    onClick={() => setRadial((v) => !v)}
                    className="flex h-10 w-11 flex-col items-center justify-center rounded-xl text-muted/80 hover:bg-elevated hover:text-fg"
                  >
                    <LayoutGrid className="size-3.5" />
                    <span className="text-[8px] tracking-wide uppercase">Radial</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
        {inspector && (
          <InspectorDock tab={inspector} onTab={setInspector} onClose={() => setInspector(null)} />
        )}
      </div>
      <InstallBanner compact blocked={panel === "help" || panel === "building" || (current.walls.length === 0 && tool === "select")} />

      <Sheet open={panel === "studio"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Studio">
          <div className="flex flex-col gap-5">
            {[
              {
                title: "Concevoir",
                items: [
                  { id: "building" as const, label: "Bâtiment", desc: "Massing R+n, façades, noyau", icon: Building2 },
                  { id: "mats" as const, label: "Matériaux", desc: "Finitions et PBR vivants", icon: Palette },
                  { id: "ouvrages" as const, label: "Bibliothèque", desc: "Objets et ouvrages types", icon: BrickWall },
                ],
              },
              {
                title: "Analyser",
                items: [
                  { id: "struct" as const, label: "Structure", desc: "Porteurs et descentes", icon: Columns3 },
                  { id: "analyse" as const, label: "Lumière & chiffres", desc: "Soleil, métrés, alertes", icon: Sun },
                  { id: "ai" as const, label: "Copilote", desc: "Suggestions et massing IA", icon: Sparkles },
                ],
              },
              {
                title: "Livrer",
                items: [
                  { id: "chantier" as const, label: "Chantier 4D", desc: "Phasage de construction", icon: Hammer },
                  {
                    id: "dossier" as const,
                    label: "Livrer le dossier",
                    desc: "Plans SVG, coupe, IFC/DXF/CSV",
                    icon: PackageCheck,
                    action: "dossier" as const,
                  },
                  { id: "layers" as const, label: "Calques", desc: "Visibilité par discipline", icon: Layers },
                  { id: "help" as const, label: "Guide", desc: "Raccourcis et parcours", icon: HelpCircle },
                ],
              },
            ].map((section) => (
              <div key={section.title}>
                <p className="section-label">{section.title}</p>
                <div className="flex flex-col gap-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const disabled = "action" in item && item.action === "dossier" && current.walls.length === 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if ("action" in item && item.action === "dossier") {
                            const r = deliverDossier(current);
                            toast.success(`Dossier · ${r.planCount} plans · IFC+DXF+CSV`);
                            setPanel(null);
                            return;
                          }
                          if (item.id === "building") setPanel("building");
                          else if (item.id === "mats") setPanel("mats");
                          else if (item.id === "ouvrages") setPanel("ouvrages");
                          else if (item.id === "struct") setPanel("struct");
                          else if (item.id === "analyse") setPanel("analyse");
                          else if (item.id === "ai") setPanel("ai");
                          else if (item.id === "chantier") setPanel("chantier");
                          else if (item.id === "layers") setPanel("layers");
                          else if (item.id === "help") setPanel("help");
                        }}
                        className="studio-tile disabled:opacity-40"
                      >
                        <span className="studio-tile-icon">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-fg">{item.label}</span>
                          <span className="block text-[11px] text-muted">{item.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <StudioSkillToggle />
            <QuickExportStrip project={current} />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "layers"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Calques">
          <LayersPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "mats"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Matériaux" tall>
          <MaterialsPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={panel === "ouvrages"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Ouvrages" tall>
          <OuvrageExplorer />
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
      <Sheet open={panel === "analyse"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent title="Lumière & chiffres" tall>
          <AnalysisPanel />
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
    <div className="flex shrink-0 rounded-full border border-border/60 bg-elevated/90 p-0.5">
      <button
        type="button"
        onClick={() => setSkill("simple")}
        className={`h-8 px-2 text-[10px] font-medium tracking-wide ${
          skill === "simple" ? "rounded-full bg-accent/15 text-accent ring-1 ring-accent/40" : "text-muted"
        }`}
      >
        Amateur
      </button>
      <button
        type="button"
        onClick={() => setSkill("pro")}
        className={`h-8 px-2 text-[10px] font-medium tracking-wide ${
          skill === "pro" ? "rounded-full bg-accent/15 text-accent ring-1 ring-accent/40" : "text-muted"
        }`}
      >
        Expert
      </button>
    </div>
  );
}

function StudioSkillToggle() {
  const skill = useStudio((s) => s.skill);
  const setSkill = useStudio((s) => s.setSkill);
  return (
    <div>
      <p className="section-label">Niveau</p>
      <div className="flex rounded-xl border border-border/60 bg-elevated p-0.5">
        <button
          type="button"
          onClick={() => setSkill("simple")}
          className={`h-10 flex-1 rounded-lg text-xs font-medium ${skill === "simple" ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "text-muted"}`}
        >
          Amateur
        </button>
        <button
          type="button"
          onClick={() => setSkill("pro")}
          className={`h-10 flex-1 rounded-lg text-xs font-medium ${skill === "pro" ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "text-muted"}`}
        >
          Expert
        </button>
      </div>
      <p className="mt-2 text-[11px] text-subtle">
        {skill === "simple"
          ? "Outils essentiels + dalle / escalier / poteau. Coupe et AR masqués."
          : "Tous les outils, coupe, AR, esquisse et ouvrage."}
      </p>
    </div>
  );
}

function QuickExportStrip({ project }: { project: Project }) {
  const base = project.name.replace(/\s+/g, "-").toLowerCase();
  return (
    <div>
      <p className="section-label">Export rapide</p>
      {project.walls.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const r = deliverDossier(project);
            toast.success(`Dossier · ${r.planCount} plans · IFC+DXF+CSV`);
          }}
          className="mb-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-fg"
        >
          <PackageCheck className="size-4" />
          Livrer le dossier
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "JSON", run: () => downloadText(`${base}.forma.json`, exportBimJson(project)) },
          { label: "DXF", run: () => downloadText(`${base}.dxf`, exportDxf(project), "application/dxf") },
          { label: "CSV", run: () => downloadText(`${base}-metre.csv`, exportQuantitiesCsv(project), "text/csv") },
          { label: "IFC", run: () => downloadText(`${base}.ifc`, exportIfc(project), "application/x-step") },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.run}
            className="flex h-11 items-center justify-center gap-1.5 bg-elevated text-xs font-medium"
          >
            <Download className="size-3.5 text-accent" />
            {b.label}
          </button>
        ))}
      </div>
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

