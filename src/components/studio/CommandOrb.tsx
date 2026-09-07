import type { MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Copy,
  CopyPlus,
  Grid3x3,
  Magnet,
  MoveHorizontal,
  Palette,
  Plus,
  Redo2,
  RotateCw,
  Move3d,
  SlidersHorizontal,
  Trash2,
  Undo2,
  ArrowLeftRight,
  ArrowUpDown,
  LayoutGrid,
  PenLine,
  Wrench,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Tool } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";
import { ToolDock } from "./ToolDock";

const DRAW_TOOLS: Tool[] = [
  "wall",
  "rect",
  "door",
  "window",
  "room",
  "pen",
  "survey",
  "column",
  "stair",
  "slab",
  "roof",
  "furniture",
];

type RailMode = "concevoir" | "modifier";

/**
 * Single floating capsule — smart mode switcher groups draw tools vs edit actions
 * so Manip + ToolDock + Params no longer compete as separate islands.
 */
export function CommandOrb({
  onParams,
  onResources,
  onOverflow,
}: {
  onParams: () => void;
  onResources: (mode?: "materials" | "objects" | "both") => void;
  onOverflow?: () => void;
}) {
  const selectedIds = useStudio((s) => s.selectedIds);
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const view = useStudio((s) => s.view);
  const snap = useStudio((s) => s.snap);
  const grid = useStudio((s) => s.grid);
  const ortho = useStudio((s) => s.ortho);
  const setSnap = useStudio((s) => s.setSnap);
  const setGrid = useStudio((s) => s.setGrid);
  const setOrtho = useStudio((s) => s.setOrtho);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const duplicateSelected = useStudio((s) => s.duplicateSelected);
  const rotateSelected = useStudio((s) => s.rotateSelected);
  const deleteSelected = useStudio((s) => s.deleteSelected);
  const moveSelected = useStudio((s) => s.moveSelected);
  const gizmoMode = useStudio((s) => s.gizmoMode);
  const setGizmoMode = useStudio((s) => s.setGizmoMode);
  const propagateTypical = useStudio((s) => s.propagateTypical);
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);

  const hasSel = selectedIds.length > 0;
  const drawing = DRAW_TOOLS.includes(tool);
  const autoMode: RailMode = hasSel && !drawing ? "modifier" : "concevoir";
  const [pinned, setPinned] = useState<RailMode | null>(null);
  const [repere, setRepere] = useState(false);
  const [pas, setPas] = useState(false);
  const mode = pinned ?? autoMode;

  // Release pin when selection/tool naturally matches the other mode
  useEffect(() => {
    if (!pinned) return;
    if (pinned === "modifier" && !hasSel) setPinned(null);
    if (pinned === "concevoir" && hasSel && !drawing) setPinned(null);
  }, [pinned, hasSel, drawing]);

  useEffect(() => {
    setRepere(false);
    setPas(false);
  }, [mode]);

  if (view === "ar" || view === "visite") return null;

  const multiStory = (project?.stories.length ?? 0) > 1;
  const movable = (() => {
    if (!project || !selectedIds[0]) return false;
    const id = selectedIds[0];
    return Boolean(
      project.furniture.some((f) => f.id === id) ||
        project.columns.some((c) => c.id === id) ||
        project.stairs.some((s) => s.id === id),
    );
  })();

  const nudge = (dx: number, dy: number) => moveSelected(dx, dy);

  return (
    <div
      className={cn(
        "cmd-rail cmd-rail-live w-full max-w-lg",
        mode === "modifier" && "cmd-rail-modify",
      )}
    >
      {/* Mode switcher */}
      <div className="flex items-center gap-1 px-0.5">
        <div className="flex min-w-0 flex-1 rounded-full border border-accent/20 bg-elevated/75 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <ModeBtn
            label="Concevoir"
            icon={<PenLine className="size-3.5" />}
            active={mode === "concevoir"}
            onClick={() => {
              setPinned("concevoir");
              if (hasSel) setTool(drawing ? tool : "wall");
            }}
          />
          <ModeBtn
            label="Modifier"
            icon={<Wrench className="size-3.5" />}
            active={mode === "modifier"}
            disabled={!hasSel && mode !== "modifier"}
            onClick={() => {
              if (!hasSel) {
                toast.message("Sélectionnez un élément");
                return;
              }
              setPinned("modifier");
              setTool("select");
            }}
          />
        </div>
        <OrbBtn
          label="Params"
          accent
          onClick={onParams}
          onContextMenu={(e) => {
            e.preventDefault();
            onResources("both");
          }}
        >
          <SlidersHorizontal className="size-4" />
        </OrbBtn>
        <OrbBtn
          label="Plus"
          onClick={() => (onOverflow ? onOverflow() : onResources("both"))}
        >
          <Plus className="size-4" />
        </OrbBtn>
      </div>

      {mode === "modifier" ? (
        <div className="flex flex-col gap-1">
          {movable && pas && (
            <div className="flex gap-0.5 overflow-x-auto">
              <OrbBtn label="−X" onClick={() => nudge(-0.1, 0)}>
                <span className="font-mono text-[11px]">−X</span>
              </OrbBtn>
              <OrbBtn label="+X" onClick={() => nudge(0.1, 0)}>
                <span className="font-mono text-[11px]">+X</span>
              </OrbBtn>
              <OrbBtn label="−Y" onClick={() => nudge(0, -0.1)}>
                <span className="font-mono text-[11px]">−Y</span>
              </OrbBtn>
              <OrbBtn label="+Y" onClick={() => nudge(0, 0.1)}>
                <span className="font-mono text-[11px]">+Y</span>
              </OrbBtn>
              <OrbBtn label="−0,5" onClick={() => nudge(-0.5, 0)}>
                <ArrowLeftRight className="size-3.5" />
              </OrbBtn>
              <OrbBtn label="+0,5" onClick={() => nudge(0, 0.5)}>
                <ArrowUpDown className="size-3.5" />
              </OrbBtn>
            </div>
          )}
          <div className="flex gap-0.5 overflow-x-auto">
            {(view === "3d" || view === "coupe") && movable && (
              <>
                <OrbBtn
                  label="Déplacer"
                  active={gizmoMode === "translate"}
                  accent={gizmoMode === "translate"}
                  onClick={() => setGizmoMode("translate")}
                >
                  <Move3d className="size-4" />
                </OrbBtn>
                <OrbBtn
                  label="Pivoter 3D"
                  active={gizmoMode === "rotate"}
                  accent={gizmoMode === "rotate"}
                  onClick={() => setGizmoMode("rotate")}
                >
                  <RotateCw className="size-4" />
                </OrbBtn>
              </>
            )}
            <OrbBtn label="Dupliquer" onClick={duplicateSelected}>
              <Copy className="size-4" />
            </OrbBtn>
            <OrbBtn label="Pivoter" onClick={() => rotateSelected(Math.PI / 2)}>
              <RotateCw className="size-4" />
            </OrbBtn>
            <OrbBtn label="Supprimer" danger onClick={deleteSelected}>
              <Trash2 className="size-4" />
            </OrbBtn>
            <OrbBtn label="Matériau" onClick={() => onResources("materials")}>
              <Palette className="size-4" />
            </OrbBtn>
            {movable && (
              <OrbBtn label="Pas" active={pas} onClick={() => setPas((v) => !v)}>
                <ChevronUp className={cn("size-4", pas && "rotate-180")} />
              </OrbBtn>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {repere && (
            <div className="flex gap-0.5 overflow-x-auto">
              <OrbBtn label="Aimant" active={snap} onClick={() => setSnap(!snap)}>
                <Magnet className="size-4" />
              </OrbBtn>
              <OrbBtn label="Grille" active={grid} onClick={() => setGrid(!grid)}>
                <Grid3x3 className="size-4" />
              </OrbBtn>
              <OrbBtn label="Ortho" active={ortho} onClick={() => setOrtho(!ortho)}>
                <MoveHorizontal className="size-4" />
              </OrbBtn>
            </div>
          )}
          <div className="flex gap-0.5 overflow-x-auto">
            <OrbBtn
              label="Repère"
              active={repere || snap || grid || ortho}
              onClick={() => setRepere((v) => !v)}
            >
              <Magnet className="size-4" />
            </OrbBtn>
            <OrbBtn label="Annuler" onClick={undo}>
              <Undo2 className="size-4" />
            </OrbBtn>
            <OrbBtn label="Rétablir" onClick={redo}>
              <Redo2 className="size-4" />
            </OrbBtn>
            <OrbBtn label="Ressources" onClick={() => onResources("both")}>
              <LayoutGrid className="size-4" />
            </OrbBtn>
            {multiStory && (
              <OrbBtn
                label="Propager"
                accent
                onClick={() => {
                  propagateTypical();
                  toast.success("Étage type propagé");
                }}
              >
                <CopyPlus className="size-4" />
              </OrbBtn>
            )}
          </div>
          <ToolDock tool={tool} onTool={setTool} />
        </div>
      )}
    </div>
  );
}

function ModeBtn({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex h-11 min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 text-[10px] font-semibold tracking-wide uppercase transition-[transform,background-color,color] duration-200",
        active ? "bg-accent/18 text-accent" : "text-muted/80 hover:text-fg",
        disabled && "opacity-40",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {active && <span className="tab-underline inset-x-3" />}
    </button>
  );
}

function OrbBtn({
  label,
  children,
  onClick,
  onContextMenu,
  active,
  accent,
  danger,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  active?: boolean;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "hud-chip-press flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 text-[9px] font-medium tracking-[0.12em] uppercase",
        danger && "text-danger hover:bg-danger/10",
        accent && !danger && "bg-accent/15 text-accent ring-1 ring-accent/45",
        active && !accent && !danger && "bg-accent/15 text-accent ring-1 ring-accent/50",
        !active && !accent && !danger && "text-muted/80 hover:bg-elevated/80 hover:text-fg",
      )}
    >
      {children}
      <span className="max-w-[5.5rem] truncate leading-none">{label}</span>
    </button>
  );
}
