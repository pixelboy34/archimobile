import { useEffect, useRef, useState } from "react";
import {
  MATERIAL_CATALOG,
  TEXTURE_LABELS,
  resolveMaterial,
} from "@/lib/bim/materials";
import { MATERIAL_LABELS, type MaterialId, type TextureKind } from "@/lib/bim/types";
import { paintSwatch } from "@/lib/render/procedural-textures";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";

const IDS = Object.keys(MATERIAL_CATALOG) as MaterialId[];
const TEXTURES = Object.keys(TEXTURE_LABELS) as TextureKind[];

export function MaterialsPanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const selectedIds = useStudio((s) => s.selectedIds);
  const active = useStudio((s) => s.activeMaterialId);
  const setActive = useStudio((s) => s.setActiveMaterial);
  const applyMaterial = useStudio((s) => s.applyMaterial);
  const patchMaterial = useStudio((s) => s.patchMaterial);
  const beginEdit = useStudio((s) => s.beginEdit);
  const [editId, setEditId] = useState<MaterialId>(active);
  if (!project) return null;

  const selectedMat = (() => {
    const id = selectedIds[0];
    if (!id) return null;
    const wall = project.walls.find((w) => w.id === id);
    if (wall) return wall.materialId;
    const op = project.openings.find((o) => o.id === id);
    if (op) return op.materialId;
    const col = project.columns.find((c) => c.id === id);
    if (col) return col.materialId;
    const sl = project.slabs.find((s) => s.id === id);
    if (sl) return sl.materialId;
    const rf = project.roofs.find((r) => r.id === id);
    if (rf) return rf.materialId;
    return null;
  })();

  const style = resolveMaterial(editId, project.materials);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        {selectedMat
          ? "Touchez un échantillon pour l’appliquer à l’objet."
          : "Choisissez un matériau — il servira aux nouveaux murs."}
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {IDS.map((id) => {
          const st = resolveMaterial(id, project.materials);
          const on = id === editId || id === selectedMat || id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setEditId(id);
                setActive(id);
                if (selectedIds.length) applyMaterial(id, "selected");
              }}
              className={`overflow-hidden rounded-lg border text-left ${
                on ? "border-accent ring-1 ring-accent" : "border-border"
              }`}
            >
              <SwatchCanvas kind={st.texture} color={st.color} />
              <span className="block truncate px-2 py-1.5 text-[11px] text-muted">
                {MATERIAL_LABELS[id]}
              </span>
            </button>
          );
        })}
      </div>

      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          Éditer — {MATERIAL_LABELS[editId]}
        </p>
        <label className="flex h-11 items-center justify-between gap-3 rounded-lg bg-elevated px-3">
          <span className="text-sm">Teinte</span>
          <input
            type="color"
            value={style.color}
            aria-label="Teinte"
            onChange={(e) => patchMaterial(editId, { color: e.target.value })}
            className="size-8 cursor-pointer rounded-md border border-border bg-transparent"
          />
        </label>
        <div>
          <p className="mb-2 text-xs tracking-wide text-muted uppercase">Texture</p>
          <div className="flex flex-wrap gap-1.5">
            {TEXTURES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => patchMaterial(editId, { texture: t })}
                className={`rounded-full px-2.5 py-1.5 text-xs ${
                  style.texture === t ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
                }`}
              >
                {TEXTURE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <Range
          label="Rugosité"
          value={style.roughness}
          min={0}
          max={1}
          step={0.02}
          onBegin={beginEdit}
          onChange={(v) => patchMaterial(editId, { roughness: v })}
        />
        <Range
          label="Métal"
          value={style.metalness}
          min={0}
          max={1}
          step={0.02}
          onBegin={beginEdit}
          onChange={(v) => patchMaterial(editId, { metalness: v })}
        />
        <Range
          label="Échelle texture"
          value={style.scale}
          min={0.2}
          max={4}
          step={0.05}
          unit="m"
          onBegin={beginEdit}
          onChange={(v) => patchMaterial(editId, { scale: v })}
        />
        {style.transparent && (
          <Range
            label="Opacité"
            value={style.opacity}
            min={0.08}
            max={1}
            step={0.02}
            unit=""
            onBegin={beginEdit}
            onChange={(v) => patchMaterial(editId, { opacity: v })}
          />
        )}
        <div className="flex flex-col gap-2">
          <Button
            variant="accent"
            disabled={!selectedIds.length}
            onClick={() => applyMaterial(editId, "selected")}
          >
            Appliquer à la sélection
          </Button>
          <Button variant="outline" onClick={() => applyMaterial(editId, "walls")}>
            Tous les murs
          </Button>
          <Button variant="ghost" onClick={() => applyMaterial(editId, "all")}>
            Tout le bâtiment
          </Button>
        </div>
      </section>
    </div>
  );
}

export function MaterialSwatches({
  value,
  onChange,
  ids,
}: {
  value: MaterialId;
  onChange: (id: MaterialId) => void;
  ids?: MaterialId[];
}) {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const list = ids ?? IDS;
  return (
    <div>
      <p className="mb-2 text-xs tracking-wide text-muted uppercase">Matériau</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {list.map((id) => {
          const st = resolveMaterial(id, project?.materials);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`w-16 shrink-0 overflow-hidden rounded-md border ${
                value === id ? "border-accent ring-1 ring-accent" : "border-border"
              }`}
            >
              <SwatchCanvas kind={st.texture} color={st.color} />
              <span className="block truncate px-1 py-1 text-[10px] text-muted">
                {MATERIAL_LABELS[id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SwatchCanvas({ kind, color }: { kind: TextureKind; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 96;
    c.height = 64;
    paintSwatch(c, kind, color);
  }, [kind, color]);
  return <canvas ref={ref} className="block h-12 w-full" aria-hidden />;
}

function Range({
  label,
  value,
  min,
  max,
  step,
  unit,
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
    <label className="flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
      <span className="flex items-baseline justify-between">
        <span className="text-xs tracking-wide text-muted uppercase">{label}</span>
        <span className="font-mono text-sm tabular">
          {value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
          {unit ? ` ${unit}` : ""}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onPointerDown={onBegin}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-accent"
      />
    </label>
  );
}
