import { useState } from "react";
import { ChevronUp, X } from "lucide-react";
import { FURNITURE_LABELS, ROOM_LABELS, type Project } from "@/lib/bim/types";
import { polygonArea, wallLength } from "@/lib/bim/geometry";
import { formatMeters, cn } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { PropertiesPanel, type ParamsTab } from "./PropertiesPanel";

const TABS: { id: ParamsTab; label: string }[] = [
  { id: "ouvrage", label: "Ouvrage" },
  { id: "niveaux", label: "Étages" },
  { id: "projet", label: "Site" },
  { id: "rendu", label: "Vue" },
];

function selectionChip(project: Project, id: string | undefined) {
  if (!id) return { type: "Projet", dims: "Paramètres globaux" };
  const wall = project.walls.find((w) => w.id === id);
  if (wall)
    return {
      type: wall.loadBearing ? "Mur porteur" : "Mur",
      dims: `${formatMeters(wallLength(wall))} · é ${wall.thickness.toFixed(2)} m`,
    };
  const opening = project.openings.find((o) => o.id === id);
  if (opening)
    return {
      type: opening.kind === "door" ? "Porte" : "Fenêtre",
      dims: `${formatMeters(opening.width)} × ${formatMeters(opening.height)}`,
    };
  const room = project.rooms.find((r) => r.id === id);
  if (room)
    return {
      type: ROOM_LABELS[room.function] ?? "Pièce",
      dims: `${room.name} · ${polygonArea(room.polygon).toFixed(1)} m²`,
    };
  const furn = project.furniture.find((f) => f.id === id);
  if (furn) return { type: FURNITURE_LABELS[furn.kind] ?? "Objet", dims: `${furn.w.toFixed(2)} × ${furn.d.toFixed(2)} m` };
  const column = project.columns.find((c) => c.id === id);
  if (column) return { type: "Poteau", dims: `${column.width.toFixed(2)} × ${column.depth.toFixed(2)} m` };
  const stair = project.stairs.find((s) => s.id === id);
  if (stair) return { type: "Escalier", dims: `${stair.run.toFixed(2)} m · h ${stair.rise.toFixed(2)}` };
  const slab = project.slabs.find((s) => s.id === id);
  if (slab) return { type: "Dalle", dims: `é ${slab.thickness.toFixed(2)} m` };
  const roof = project.roofs.find((r) => r.id === id);
  if (roof) return { type: "Toiture", dims: `${roof.pitch}° · débord ${roof.overhang.toFixed(2)} m` };
  return { type: "Élément", dims: id.slice(0, 8) };
}

/** Compact inspector — default ~36dvh, expandable to 52dvh. Never fullscreen. */
export function InspectorDock({
  tab,
  onTab,
  onClose,
}: {
  tab: ParamsTab;
  onTab: (t: ParamsTab) => void;
  onClose: () => void;
}) {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const selectedIds = useStudio((s) => s.selectedIds);
  const chip = project ? selectionChip(project, selectedIds[0]) : { type: "Projet", dims: "" };
  const [expanded, setExpanded] = useState(false);
  const hasSel = selectedIds.length > 0;

  return (
    <div
      className={cn(
        "inspector-dock pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex flex-col",
        "border-t border-accent/40 bg-surface/97 shadow-[0_-12px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(110,208,195,0.12)] backdrop-blur-xl",
        "animate-in slide-in-from-bottom duration-300",
        expanded ? "max-h-[min(52dvh,28rem)]" : "max-h-[min(36dvh,22rem)]",
      )}
    >
      <button
        type="button"
        aria-label={expanded ? "Réduire le panneau" : "Agrandir le panneau"}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col items-center pt-1.5 pb-0.5"
      >
        <span className="h-1 w-10 rounded-full bg-accent/60 shadow-[0_0_8px_rgba(110,208,195,0.45)]" />
        <span className="mt-0.5 flex items-center gap-1 text-[9px] tracking-wide text-muted uppercase">
          <ChevronUp className={cn("size-3 transition-transform duration-200", expanded && "rotate-180")} />
          {expanded ? "Réduire" : "Agrandir"}
        </span>
      </button>

      <div className="flex items-center gap-2 border-b border-border/60 px-2 pb-1.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 px-1">
            <span
              className={cn(
                "sel-chip inline-flex max-w-[58%] items-center truncate rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-accent uppercase",
                hasSel && "sel-chip-pulse",
              )}
            >
              {chip.type}
            </span>
            <span className="truncate font-mono text-[11px] text-muted tabular">{chip.dims}</span>
          </div>
          <div className="flex min-w-0 gap-0.5 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                className={cn(
                  "relative h-8 shrink-0 px-3 text-xs font-medium tracking-[0.14em] uppercase transition-colors",
                  tab === t.id ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {t.label}
                {tab === t.id && <span className="tab-underline" />}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <PropertiesPanel tab={tab} onTab={onTab} />
      </div>
    </div>
  );
}
