import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { OBJECT_CATALOG, OBJECT_GROUPS, objectDef } from "@/lib/bim/catalog";
import { MATERIAL_CATALOG, MATERIAL_COLORS, resolveMaterial } from "@/lib/bim/materials";
import { MATERIAL_LABELS, type FurnitureKind, type MaterialId, type TextureKind } from "@/lib/bim/types";
import { paintSwatch } from "@/lib/render/procedural-textures";
import { cn } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";

const MAT_IDS = Object.keys(MATERIAL_CATALOG) as MaterialId[];

/** Full library above the command rail. Never covers the 3D viewport. */
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
  const recents = useStudio((s) => s.recentKinds);
  const setTool = useStudio((s) => s.setTool);
  const selectedIds = useStudio((s) => s.selectedIds);
  const activeMat = useStudio((s) => s.activeMaterialId);
  const setActive = useStudio((s) => s.setActiveMaterial);
  const applyMaterial = useStudio((s) => s.applyMaterial);
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [tab, setTab] = useState<"mats" | "objs">(
    mode === "materials" ? "mats" : mode === "objects" ? "objs" : "objs",
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "materials") setTab("mats");
    else if (mode === "objects") setTab("objs");
    else setTab("objs");
  }, [open, mode]);

  const objects = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return OBJECT_CATALOG.filter((o) => {
      if (group === "recent") return recents.includes(o.kind);
      if (group !== "all" && o.group !== group) return false;
      if (!needle) return true;
      return o.label.toLowerCase().includes(needle) || o.kind.includes(needle) || o.group.includes(needle);
    }).sort((a, b) => {
      if (group !== "recent") return 0;
      return recents.indexOf(a.kind) - recents.indexOf(b.kind);
    });
  }, [q, group, recents]);

  if (!open) return null;

  return (
    <div
      className="resources-peek pointer-events-auto absolute z-[25] flex flex-col overflow-hidden rounded-xl border border-border bg-surface/94 shadow-border"
      style={{ left: 8, right: 8, bottom: 162, maxHeight: "min(28dvh, 15.5rem)" }}
      role="dialog"
      aria-label="Bibliothèque"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1">
        <div className="seg seg-fill min-w-0 flex-1">
          {(mode === "both" || mode === "objects") && (
            <button
              type="button"
              onClick={() => setTab("objs")}
              className={cn("seg-item flex-1 px-2 text-[11px]", tab === "objs" && "seg-item-on")}
            >
              Objets
            </button>
          )}
          {(mode === "both" || mode === "materials") && (
            <button
              type="button"
              onClick={() => setTab("mats")}
              className={cn("seg-item flex-1 px-2 text-[11px]", tab === "mats" && "seg-item-on")}
            >
              Matières
            </button>
          )}
        </div>
        {tab === "objs" && (
          <label className="flex h-8 min-w-0 max-w-[9.5rem] items-center gap-1 rounded-md bg-elevated px-2 text-muted">
            <Search className="size-3 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher…"
              aria-label="Chercher un objet"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-fg outline-none placeholder:text-subtle"
            />
          </label>
        )}
        <button
          type="button"
          aria-label="Fermer ressources"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {tab === "objs" && (
        <div className="flex shrink-0 gap-1 overflow-x-auto px-2 py-1.5">
          <GroupChip label="Tous" on={group === "all"} count={OBJECT_CATALOG.length} onClick={() => setGroup("all")} />
          {recents.length > 0 && (
            <GroupChip label="Récents" on={group === "recent"} count={recents.length} onClick={() => setGroup("recent")} />
          )}
          {OBJECT_GROUPS.map((g) => (
            <GroupChip
              key={g.id}
              label={g.label}
              on={group === g.id}
              count={g.kinds.length}
              onClick={() => setGroup(g.id)}
            />
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {tab === "mats" ? (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
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
                    "flex flex-col overflow-hidden rounded-md border",
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
          <>
            {objects.length === 0 && <p className="px-1 py-3 text-[11px] text-muted">Aucun objet</p>}
            <div className="grid grid-cols-4 gap-1.5">
              {objects.map((o) => (
                <ObjectTile
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
            <p className="mt-2 px-0.5 font-mono text-[10px] text-subtle tabular">
              {objects.length} / {OBJECT_CATALOG.length}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function GroupChip({
  label,
  on,
  count,
  onClick,
}: {
  label: string;
  on: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 shrink-0 rounded-full px-2.5 text-[10px] font-medium tracking-wide",
        on ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-elevated text-muted",
      )}
    >
      {label}
      <span className="ml-1 font-mono text-[9px] opacity-70">{count}</span>
    </button>
  );
}

function MiniSwatch({ kind, color }: { kind: TextureKind; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 72;
    c.height = 32;
    paintSwatch(c, kind, color);
  }, [kind, color]);
  return <canvas ref={ref} className="block h-8 w-full" aria-hidden />;
}

function ObjectTile({
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
        "flex min-h-11 flex-col items-center gap-0.5 rounded-md px-1 py-1.5",
        active ? "bg-elevated ring-1 ring-accent" : "hover:bg-elevated/70",
      )}
    >
      <span className="flex h-7 w-full items-end justify-center rounded-sm bg-bg">
        <span
          className="mb-1 block h-3.5 w-3.5 rounded-sm"
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
