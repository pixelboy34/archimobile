import {
  Building2,
  Columns3,
  Hammer,
  HardDrive,
  HelpCircle,
  Layers,
  MapPinned,
  PackageCheck,
  Palette,
  Sofa,
  Sparkles,
  Sun,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useStudio } from "@/lib/store/project-store";
import { cn } from "@/lib/utils";

export type OverflowAction =
  | "building"
  | "objects"
  | "materials"
  | "faisabilite"
  | "struct"
  | "analyse"
  | "ai"
  | "dossier"
  | "chantier"
  | "collab"
  | "offline"
  | "layers"
  | "help";

const SECTIONS: { title: string; items: { id: OverflowAction; label: string; icon: LucideIcon; pro?: boolean }[] }[] = [
  {
    title: "Concevoir",
    items: [
      { id: "building", label: "Bâtiment", icon: Building2 },
      { id: "objects", label: "Objets", icon: Sofa },
      { id: "materials", label: "Matières", icon: Palette },
    ],
  },
  {
    title: "Analyser",
    items: [
      { id: "faisabilite", label: "Site", icon: MapPinned },
      { id: "struct", label: "Structure", icon: Columns3, pro: true },
      { id: "analyse", label: "Chiffres", icon: Sun },
      { id: "ai", label: "Copilote", icon: Sparkles },
    ],
  },
  {
    title: "Livrer",
    items: [
      { id: "dossier", label: "Dossier", icon: PackageCheck },
      { id: "chantier", label: "Chantier", icon: Hammer, pro: true },
      { id: "collab", label: "Collab", icon: Users, pro: true },
      { id: "offline", label: "Hors ligne", icon: HardDrive },
      { id: "layers", label: "Calques", icon: Layers, pro: true },
      { id: "help", label: "Guide", icon: HelpCircle },
    ],
  },
];

/** Compact atelier overflow — one menu, no radial rings, no second Studio sheet. */
export function RadialMenu({
  open,
  onClose,
  onAction,
}: {
  open: boolean;
  tool?: string;
  onTool?: (t: never) => void;
  onClose: () => void;
  onStudio?: () => void;
  onAction: (id: OverflowAction) => void;
}) {
  const skill = useStudio((s) => s.skill);
  if (!open) return null;
  const expert = skill === "pro";

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <button
        type="button"
        aria-label="Fermer"
        className="pointer-events-auto absolute inset-0 bg-bg/40"
        onClick={onClose}
      />
      <div
        className="pointer-events-auto absolute right-3 left-3 z-[31] flex max-h-[min(42dvh,22rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface/98 shadow-border"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 11.75rem)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-2.5 py-1.5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Atelier</p>
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-2.5 py-2">
          {SECTIONS.map((section) => {
            const items = section.items.filter((it) => expert || !it.pro);
            if (!items.length) return null;
            return (
              <div key={section.title}>
                <p className="mb-1.5 text-[10px] font-medium tracking-[0.16em] text-subtle uppercase">{section.title}</p>
                <div className="overflow-grid">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onAction(item.id)}
                        className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md bg-elevated px-1 py-1.5 text-muted hover:bg-accent/10 hover:text-fg"
                      >
                        <Icon className={cn("size-3.5", item.id === "dossier" && "text-accent")} />
                        <span className="w-full truncate text-center text-[9px] font-medium leading-tight">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
