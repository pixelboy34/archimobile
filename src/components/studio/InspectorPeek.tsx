import { Copy, Focus, RotateCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { FURNITURE_LABELS, ROOM_LABELS } from "@/lib/bim/types";
import { polygonCentroid, wallLength, wallMid } from "@/lib/bim/geometry";
import { formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { dispatchCam } from "@/lib/viewport/cam";

export function InspectorPeek({ onOpen }: { onOpen: () => void }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const selectedIds = useStudio((s) => s.selectedIds);
  const beginEdit = useStudio((s) => s.beginEdit);
  const patchSelected = useStudio((s) => s.patchSelected);
  const duplicateSelected = useStudio((s) => s.duplicateSelected);
  const deleteSelected = useStudio((s) => s.deleteSelected);
  const commitSelected = useStudio((s) => s.commitSelected);
  if (!project || selectedIds.length === 0) return null;
  const id = selectedIds[0]!;
  const wall = project.walls.find((w) => w.id === id);
  const room = project.rooms.find((r) => r.id === id);
  const furn = project.furniture.find((f) => f.id === id);
  const opening = project.openings.find((o) => o.id === id);
  const column = project.columns.find((c) => c.id === id);
  const stair = project.stairs.find((st) => st.id === id);
  const slab = project.slabs.find((s) => s.id === id);
  const roof = project.roofs.find((r) => r.id === id);

  const title = wall
    ? `Mur · ${formatMeters(wallLength(wall))}`
    : opening
      ? `${opening.kind === "door" ? "Porte" : "Fenêtre"} · ${formatMeters(opening.width)}`
      : room
        ? `${room.name} · ${ROOM_LABELS[room.function]}`
        : furn
          ? FURNITURE_LABELS[furn.kind]
          : column
            ? "Poteau"
            : stair
              ? "Escalier"
              : slab
                ? "Dalle"
                : roof
                  ? "Toiture"
                  : "Élément";

  return (
    <div className="pointer-events-auto hud-panel absolute right-3 bottom-[5.75rem] left-3 z-20 p-2">
      <div className="mb-1 flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate px-2 text-xs font-medium">{title}</p>
        {furn && (
          <button
            type="button"
            aria-label="Tourner"
            onClick={() => commitSelected({ rotation: furn.rotation + Math.PI / 2 })}
            className="flex size-10 items-center justify-center rounded-lg text-muted hover:text-fg"
          >
            <RotateCw className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Cadrer"
          onClick={() => {
            const story = project.stories.find(
              (st) =>
                st.id ===
                (wall?.storyId ??
                  furn?.storyId ??
                  room?.storyId ??
                  column?.storyId ??
                  stair?.storyId ??
                  slab?.storyId ??
                  roof?.storyId),
            );
            const y = (story?.elevation ?? 0) + 1.2;
            const p = wall
              ? wallMid(wall)
              : furn
                ? furn.position
                : room
                  ? polygonCentroid(room.polygon)
                  : column
                    ? column.position
                    : stair
                      ? stair.origin
                      : slab
                        ? polygonCentroid(slab.polygon)
                        : roof
                          ? polygonCentroid(roof.polygon)
                          : null;
            if (p) dispatchCam({ kind: "focus", x: p.x, y, z: p.y, radius: 8 });
          }}
          className="flex size-10 items-center justify-center rounded-lg text-muted hover:text-fg"
        >
          <Focus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Dupliquer"
          onClick={duplicateSelected}
          className="flex size-10 items-center justify-center rounded-lg text-muted hover:text-fg"
        >
          <Copy className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Supprimer"
          onClick={deleteSelected}
          className="flex size-10 items-center justify-center rounded-lg text-danger"
        >
          <Trash2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex h-10 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-fg"
        >
          <SlidersHorizontal className="size-3.5" />
          Tous
        </button>
      </div>
      {room && (
        <p className="px-2 pb-1 text-[11px] text-muted">Pièce — ouvrez Tous pour finitions et hauteur</p>
      )}
      {wall && (
        <div className="grid grid-cols-2 gap-x-3 px-1">
          <Mini
            label="Épaisseur"
            value={wall.thickness}
            min={0.07}
            max={0.7}
            step={0.01}
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ thickness: v })}
          />
          <Mini
            label="Hauteur"
            value={wall.height}
            min={1}
            max={12}
            step={0.05}
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ height: v })}
          />
          <Mini
            label="Isolant"
            value={wall.insulationMm ?? 0}
            min={0}
            max={240}
            step={10}
            unit="mm"
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ insulationMm: v })}
          />
          <Mini
            label="U"
            value={wall.uValue ?? 1.8}
            min={0.1}
            max={3}
            step={0.02}
            unit="W/m²K"
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ uValue: v })}
          />
        </div>
      )}
      {opening && (
        <div className="grid grid-cols-2 gap-x-3 px-1">
          <Mini
            label="Largeur"
            value={opening.width}
            min={0.4}
            max={5}
            step={0.05}
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ width: v })}
          />
          <Mini
            label="Hauteur"
            value={opening.height}
            min={0.4}
            max={3.4}
            step={0.05}
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ height: v })}
          />
          <Mini
            label="Allège"
            value={opening.sill}
            min={0}
            max={2.2}
            step={0.05}
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ sill: v })}
          />
          <Mini
            label="Position"
            value={opening.t}
            min={0.05}
            max={0.95}
            step={0.01}
            unit=""
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ t: v })}
          />
        </div>
      )}
      {furn && (
        <div className="grid grid-cols-2 gap-x-3 px-1">
          <Mini
            label="Largeur"
            value={furn.w}
            min={0.3}
            max={8}
            step={0.05}
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ w: v })}
          />
          <Mini
            label="Profondeur"
            value={furn.d}
            min={0.2}
            max={8}
            step={0.05}
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ d: v })}
          />
          <Mini
            label="Hauteur"
            value={furn.h}
            min={0.05}
            max={8}
            step={0.05}
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ h: v })}
          />
          <Mini
            label="Rotation"
            value={(furn.rotation * 180) / Math.PI}
            min={0}
            max={360}
            step={5}
            unit="°"
            onBegin={beginEdit}
            onChange={(v) => patchSelected({ rotation: (v * Math.PI) / 180 })}
          />
        </div>
      )}
      {column && (
        <Mini
          label="Section"
          value={column.width}
          min={0.15}
          max={1.2}
          step={0.01}
          onBegin={beginEdit}
          onChange={(v) => patchSelected({ width: v, depth: v })}
        />
      )}
      {stair && (
        <Mini
          label="Largeur"
          value={stair.width}
          min={0.7}
          max={2.4}
          step={0.05}
          onBegin={beginEdit}
          onChange={(v) => patchSelected({ width: v })}
        />
      )}
      {roof && (
        <Mini
          label="Pente"
          value={roof.pitch}
          min={0}
          max={55}
          step={1}
          unit="°"
          onBegin={beginEdit}
          onChange={(v) => patchSelected({ pitch: v })}
        />
      )}
      {slab && (
        <Mini
          label="Épaisseur"
          value={slab.thickness}
          min={0.08}
          max={0.5}
          step={0.01}
          onBegin={beginEdit}
          onChange={(v) => patchSelected({ thickness: v })}
        />
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  min,
  max,
  step,
  unit = "m",
  onBegin,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onBegin: () => void;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
      <span className="flex justify-between text-[10px] tracking-wide text-muted uppercase">
        {label}
        <span className="font-mono text-fg tabular">
          {value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
          {unit ? ` ${unit}` : ""}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        aria-label={label}
        onPointerDown={(e) => {
          e.stopPropagation();
          onBegin();
          (e.currentTarget as HTMLInputElement).setPointerCapture?.(e.pointerId);
        }}
        onTouchMove={(e) => e.stopPropagation()}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full cursor-pointer accent-accent [touch-action:none]"
      />
    </label>
  );
}
