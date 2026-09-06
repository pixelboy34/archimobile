import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { ESSENTIAL_KINDS, OBJECT_CATALOG, objectDef } from "@/lib/bim/catalog";
import { MATERIAL_CATALOG, MATERIAL_COLORS, resolveMaterial } from "@/lib/bim/materials";
import { MATERIAL_LABELS, type FurnitureKind, type MaterialId, type TextureKind } from "@/lib/bim/types";
import { paintSwatch } from "@/lib/render/procedural-textures";
import { cn } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";

const MAT_IDS = Object.keys(MATERIAL_CATALOG) as MaterialId[];

/** Slim resources strip — materials + library essentials above the command rail (~80px). */
export function ResourcesPeek({
  open,
  onClose,
  mode = "both",
}: {
  open: boolean;
  onClose: () => void;
  mode?: "materials" | "objects" | "both";
}) {
  const kind = useStudio((s) => s.furnitureKind);
  const setKind = useStudio((s) => s.setFurnitureKind);
  const setTool = useStudio((s) => s.setTool);
  const selectedIds = useStudio((s) => s.selectedIds);
  const activeMat = useStudio((s) => s.activeMaterialId);
  const setActive = useStudio((s) => s.setActiveMaterial);
  const applyMaterial = useStudio((s) => s.applyMaterial);
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"mats" | "objs">(
    mode === "materials" ? "mats" : mode === "objects" ? "objs" : "mats",
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "materials") setTab("mats");
    else if (mode === "objects") setTab("objs");
  }, [open, mode]);

  const objects = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle) {
      return OBJECT_CATALOG.filter(
        (o) => o.label.toLowerCase().includes(needle) || o.kind.includes(needle),
      ).slice(0, 16);
    }
    return ESSENTIAL_KINDS.map((k) => objectDef(k));
  }, [q]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "resources-peek pointer-events-auto absolute right-3 left-3 z-[25]",
        "bottom-[calc(env(safe-area-inset-bottom)+7.25rem)]",
        "max-h-[min(28dvh,11rem)] overflow-hidden rounded-2xl border border-accent/30 bg-surface/95 p-2 shadow-border backdrop-blur-md",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
      )}
      role="dialog"
      aria-label="Ressources"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
          {(mode === "both" || mode === "materials") && (
            <button
              type="button"
              onClick={() => setTab("mats")}
              className={cn(
                "relative h-8 shrink-0 rounded-full px-3 text-[11px] font-medium tracking-wide uppercase transition-colors",
                tab === "mats" ? "text-accent" : "text-muted hover:text-fg",
              )}
            >
              Matériaux
              {tab === "mats" && <span className="tab-underline" />}
            </button>
          )}
          {(mode === "both" || mode === "objects") && (
            <button
              type="button"
              onClick={() => setTab("objs")}
              className={cn(
                "relative h-8 shrink-0 rounded-full px-3 text-[11px] font-medium tracking-wide uppercase transition-colors",
                tab === "objs" ? "text-accent" : "text-muted hover:text-fg",
              )}
            >
              Bibliothèque
              {tab === "objs" && <span className="tab-underline" />}
            </button>
          )}
        </div>
        {tab === "objs" && (
          <label className="flex h-8 min-w-0 max-w-[9rem] items-center gap-1.5 rounded-lg bg-elevated px-2 text-muted">
            <Search className="size-3 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher…"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-fg outline-none placeholder:text-subtle"
            />
          </label>
        )}
        <button
          type="button"
          aria-label="Fermer ressources"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {tab === "mats" ? (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {MAT_IDS.map((id) => {
            const st = resolveMaterial(id, project?.materials);
            const on = id === activeMat;
            return (
              <button
                key={id}
                type="button"
                title={MATERIAL_LABELS[id]}
                onClick={() => {
                  setActive(id);
                  applyMaterial(id, selectedIds.length ? "selected" : "walls");
                }}
                className={cn(
                  "hud-chip-press flex w-[4.25rem] shrink-0 flex-col overflow-hidden rounded-lg border",
                  on ? "border-accent ring-1 ring-accent/50" : "border-border/70",
                )}
              >
                <MiniSwatch kind={st.texture} color={st.color} />
                <span className="truncate px-1 py-1 text-center text-[9px] leading-none text-muted">
                  {MATERIAL_LABELS[id]}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {objects.length === 0 && (
            <p className="px-2 py-2 text-[11px] text-muted">Aucun objet</p>
          )}
          {objects.map((o) => (
            <ObjectChip
              key={o.kind}
              kind={o.kind}
              active={kind === o.kind}
              onClick={() => {
                setKind(o.kind);
                setTool("furniture");
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MiniSwatch({ kind, color }: { kind: TextureKind; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 72;
    c.height = 40;
    paintSwatch(c, kind, color);
  }, [kind, color]);
  return <canvas ref={ref} className="block h-9 w-full" aria-hidden />;
}

function ObjectChip({
  kind,
  active,
  onClick,
}: {
  kind: FurnitureKind;
  active: boolean;
  onClick: () => void;
}) {
  const o = objectDef(kind);
  const fill = MATERIAL_COLORS[o.mat];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hud-chip-press flex w-[4.25rem] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1",
        active ? "bg-elevated ring-1 ring-accent" : "hover:bg-elevated/60",
      )}
    >
      <span className="flex h-8 w-full items-end justify-center rounded-md bg-bg">
        <span
          className="mb-1 block size-4 rounded-sm"
          style={{
            background: fill,
            borderRadius: o.style === "plant" || o.style === "tree" || o.style === "people" ? 999 : 3,
          }}
        />
      </span>
      <span className="w-full truncate text-center text-[9px] leading-tight text-fg">{o.label}</span>
    </button>
  );
}
