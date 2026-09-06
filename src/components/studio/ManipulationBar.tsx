import type { ReactNode } from "react";
import {
  Copy,
  Focus,
  Grid3x3,
  Layers,
  Magnet,
  MoveHorizontal,
  Palette,
  Redo2,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { dispatchCam } from "./OrbitRig";

/** Compact contextual bar — Plan + 3D — accent #6ed0c3, touch h-11 */
export function ManipulationBar({
  onParams,
  onMaterial,
}: {
  onParams: () => void;
  onMaterial?: () => void;
}) {
  const selectedIds = useStudio((s) => s.selectedIds);
  const snap = useStudio((s) => s.snap);
  const grid = useStudio((s) => s.grid);
  const ortho = useStudio((s) => s.ortho);
  const isolateStory = useStudio((s) => s.isolateStory);
  const setSnap = useStudio((s) => s.setSnap);
  const setGrid = useStudio((s) => s.setGrid);
  const setOrtho = useStudio((s) => s.setOrtho);
  const setIsolateStory = useStudio((s) => s.setIsolateStory);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const duplicateSelected = useStudio((s) => s.duplicateSelected);
  const rotateSelected = useStudio((s) => s.rotateSelected);
  const deleteSelected = useStudio((s) => s.deleteSelected);
  const view = useStudio((s) => s.view);
  const hasSel = selectedIds.length > 0;

  if (view === "ar" || view === "visite") return null;

  return (
    <div className="pointer-events-auto flex max-w-full justify-center">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-accent/30 bg-surface/95 p-1 shadow-border backdrop-blur-md">
        {hasSel ? (
          <>
            <BarBtn label="Dupliquer" onClick={duplicateSelected}>
              <Copy className="size-4" />
            </BarBtn>
            <BarBtn label="Pivoter 90°" onClick={() => rotateSelected(Math.PI / 2)}>
              <RotateCw className="size-4" />
            </BarBtn>
            <BarBtn label="Supprimer" danger onClick={deleteSelected}>
              <Trash2 className="size-4" />
            </BarBtn>
            <BarBtn label="Isoler" active={isolateStory} onClick={() => setIsolateStory(!isolateStory)}>
              <Layers className="size-4" />
            </BarBtn>
            <BarBtn label="Matériau" onClick={() => (onMaterial ?? onParams)()}>
              <Palette className="size-4" />
            </BarBtn>
            <BarBtn label="Params" accent onClick={onParams}>
              <SlidersHorizontal className="size-4" />
            </BarBtn>
          </>
        ) : (
          <>
            <BarBtn label="Aimant" active={snap} onClick={() => setSnap(!snap)}>
              <Magnet className="size-4" />
            </BarBtn>
            <BarBtn label="Grille" active={grid} onClick={() => setGrid(!grid)}>
              <Grid3x3 className="size-4" />
            </BarBtn>
            <BarBtn label="Ortho" active={ortho} onClick={() => setOrtho(!ortho)}>
              <MoveHorizontal className="size-4" />
            </BarBtn>
            <BarBtn label="Annuler" onClick={undo}>
              <Undo2 className="size-4" />
            </BarBtn>
            <BarBtn label="Rétablir" onClick={redo}>
              <Redo2 className="size-4" />
            </BarBtn>
            <BarBtn label="Cadrer" accent onClick={() => dispatchCam({ kind: "fit" })}>
              <Focus className="size-4" />
            </BarBtn>
          </>
        )}
      </div>
    </div>
  );
}

function BarBtn({
  label,
  children,
  onClick,
  active,
  accent,
  danger,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
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
      className={cn(
        "flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 text-[9px] font-medium tracking-wide uppercase transition-[transform,background-color,color,box-shadow] duration-150 active:scale-[0.96]",
        danger && "text-danger hover:bg-danger/10",
        accent && !danger && "bg-accent/20 text-accent ring-1 ring-accent/50",
        active && !accent && !danger && "bg-accent text-accent-fg shadow-[0_0_0_1px_rgba(110,208,195,0.55)]",
        !active && !accent && !danger && "text-muted hover:bg-elevated hover:text-fg",
      )}
    >
      {children}
      <span className="max-w-[4.5rem] truncate leading-none">{label}</span>
    </button>
  );
}
