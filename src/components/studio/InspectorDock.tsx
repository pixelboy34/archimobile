import { useState } from "react";
import { ChevronUp, X } from "lucide-react";
import { FURNITURE_LABELS, ROOM_LABELS, type Project } from "@/lib/bim/types";
import { polygonArea, wallLength } from "@/lib/bim/geometry";
import { formatMeters, cn } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { PropertiesPanel, type ParamsTab } from "./PropertiesPanel";

const TABS: { id: ParamsTab; label: string }[] = [
  { id: "ouvrage", label: "Ouvr." },
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

/** Compact inspector: bottom sheet on phone, right rail from lg. Never fullscreen. */
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

  return (
    <div
      className={cn(
        "inspector-dock pointer-events-auto absolute z-30 flex flex-col bg-surface/92 shadow-border",
        "inset-x-0 bottom-0 border-t border-border",
        expanded ? "max-h-[min(36dvh,20rem)]" : "max-h-[min(20dvh,10.5rem)]",
        "lg:inset-x-auto lg:top-[calc(env(safe-area-inset-top)+3.15rem)] lg:right-0 lg:bottom-0 lg:w-[22rem] lg:max-h-none lg:border-t-0 lg:border-l",
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1">
        <button
          type="button"
          aria-label={expanded ? "Réduire le panneau" : "Agrandir le panneau"}
          onClick={() => setExpanded((v) => !v)}
          className="flex size-9 shrink-0 flex-col items-center justify-center text-muted lg:hidden"
        >
          <span className="h-0.5 w-7 rounded-full bg-border" />
          <ChevronUp className={cn("mt-0.5 size-3 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
        <div className="seg seg-fill min-w-0 flex-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={cn("seg-item h-8 min-h-8 flex-1 px-2 text-[11px]", tab === t.id && "seg-item-on")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <p className="mb-1 flex items-baseline gap-2 px-0.5">
          <span className="text-[10px] font-medium tracking-tight text-fg">{chip.type}</span>
          <span className="min-w-0 truncate font-mono text-[10px] text-muted tabular">{chip.dims}</span>
        </p>
        <PropertiesPanel tab={tab} onTab={onTab} />
      </div>
    </div>
  );
}
