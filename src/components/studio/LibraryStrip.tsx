import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ESSENTIAL_KINDS, OBJECT_CATALOG, OBJECT_GROUPS, objectDef } from "@/lib/bim/catalog";
import { MATERIAL_COLORS } from "@/lib/bim/materials";
import type { FurnitureKind } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";

export function LibraryStrip() {
  const kind = useStudio((s) => s.furnitureKind);
  const setKind = useStudio((s) => s.setFurnitureKind);
  const skill = useStudio((s) => s.skill);
  const groupOf = OBJECT_GROUPS.find((g) => g.kinds.includes(kind))?.id ?? "living";
  const [group, setGroup] = useState(skill === "simple" ? "essentials" : groupOf);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (q) return;
    const g = OBJECT_GROUPS.find((x) => x.kinds.includes(kind))?.id;
    if (g && g !== group && group !== "essentials") setGroup(g);
  }, [kind, group, q]);

  const groups = useMemo(() => {
    const base = OBJECT_GROUPS.map((g) => ({ id: g.id, label: g.label, kinds: g.kinds }));
    return [{ id: "essentials", label: "Essentiels", kinds: ESSENTIAL_KINDS }, ...base];
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle) {
      return OBJECT_CATALOG.filter(
        (o) => o.label.toLowerCase().includes(needle) || o.kind.includes(needle) || o.group.includes(needle),
      );
    }
    const g = groups.find((x) => x.id === group) ?? groups[0]!;
    return g.kinds.map((k) => objectDef(k));
  }, [q, group, groups]);

  const def = objectDef(kind);

  return (
    <div className="absolute right-3 bottom-[5.75rem] left-3 z-20 rounded-xl border border-border bg-surface/95 p-2 shadow-border backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-elevated px-2.5 text-muted">
          <Search className="size-3.5 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Canapé, lit, arbre…"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          />
        </label>
        <p className="hidden shrink-0 font-mono text-[10px] text-subtle sm:block">
          {def.w.toFixed(2)} × {def.d.toFixed(2)} m
        </p>
      </div>
      <div className="mb-2 flex gap-1 overflow-x-auto">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              setGroup(g.id);
              setQ("");
            }}
            className={`h-8 shrink-0 rounded-full px-3 text-[11px] tracking-wide uppercase ${
              !q && g.id === group ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {shown.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted">Aucun objet — essayez « lit » ou « cuisine »</p>
        )}
        {shown.map((o) => (
          <ObjectTile key={o.kind} kind={o.kind} active={kind === o.kind} onClick={() => setKind(o.kind)} />
        ))}
      </div>
    </div>
  );
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
  const ratio = Math.min(1.6, o.w / Math.max(o.d, 0.15));
  const w = Math.min(28, 12 + ratio * 8);
  const h = Math.min(22, 22 / Math.max(0.7, ratio * 0.55));
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 ${
        active ? "bg-elevated ring-1 ring-accent" : ""
      }`}
    >
      <span className="flex h-11 w-full items-end justify-center rounded-md bg-bg">
        <span
          className="mb-1.5 block rounded-sm"
          style={{
            width: w,
            height: h,
            background: fill,
            borderRadius: o.style === "plant" || o.style === "tree" || o.style === "people" ? 999 : 3,
          }}
        />
      </span>
      <span className="w-full truncate text-center text-[10px] leading-tight text-fg">{o.label}</span>
      <span className="font-mono text-[9px] text-subtle">
        {o.w.toFixed(o.w >= 10 ? 0 : 1)}×{o.d.toFixed(o.d >= 10 ? 0 : 1)}
      </span>
    </button>
  );
}
