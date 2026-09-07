import { useEffect, useState } from "react";
import {
  Archive,
  Building2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Hammer,
  HardDrive,
  HelpCircle,
  Layers,
  MapPinned,
  PackageCheck,
  Sparkles,
  Sun,
  Table2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useStudio } from "@/lib/store/project-store";
import { cn } from "@/lib/utils";

export type OverflowAction =
  | "building"
  | "faisabilite"
  | "struct"
  | "analyse"
  | "nomen"
  | "ai"
  | "dossier"
  | "chantier"
  | "collab"
  | "offline"
  | "layers"
  | "help";

type Folder = "root" | "analyser" | "livrer";

type Tile =
  | { kind: "action"; id: OverflowAction; label: string; icon: LucideIcon; pro?: boolean }
  | { kind: "folder"; id: Folder; label: string; icon: LucideIcon };

const ROOT: Tile[] = [
  { kind: "action", id: "building", label: "Bâtiment", icon: Building2 },
  { kind: "action", id: "dossier", label: "Dossier", icon: PackageCheck },
  { kind: "folder", id: "analyser", label: "Analyser", icon: Sun },
  { kind: "folder", id: "livrer", label: "Livrer", icon: Archive },
];

const ANALYSER: Tile[] = [
  { kind: "action", id: "faisabilite", label: "Site", icon: MapPinned },
  { kind: "action", id: "struct", label: "Structure", icon: Columns3, pro: true },
  { kind: "action", id: "analyse", label: "Chiffres", icon: Sun },
  { kind: "action", id: "nomen", label: "Nomen.", icon: Table2 },
  { kind: "action", id: "ai", label: "Copilote", icon: Sparkles },
];

const LIVRER: Tile[] = [
  { kind: "action", id: "chantier", label: "Chantier", icon: Hammer, pro: true },
  { kind: "action", id: "collab", label: "Collab", icon: Users, pro: true },
  { kind: "action", id: "offline", label: "Hors ligne", icon: HardDrive },
  { kind: "action", id: "layers", label: "Calques", icon: Layers, pro: true },
  { kind: "action", id: "help", label: "Guide", icon: HelpCircle },
];

const FOLDER_TITLE: Record<Folder, string> = {
  root: "Atelier",
  analyser: "Analyser",
  livrer: "Livrer",
};

/** Atelier — Bâtiment, Dossier, Analyser, Livrer. Objets et matières : rail Ressources. */
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
  const [folder, setFolder] = useState<Folder>("root");
  const expert = skill === "pro";

  useEffect(() => {
    if (!open) setFolder("root");
  }, [open]);

  if (!open) return null;

  const tiles = (folder === "analyser" ? ANALYSER : folder === "livrer" ? LIVRER : ROOT).filter(
    (t) => t.kind === "folder" || expert || !(t.kind === "action" && t.pro),
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <button
        type="button"
        aria-label="Fermer"
        className="pointer-events-auto absolute inset-0"
        onClick={onClose}
      />
      <div
        className="pointer-events-auto absolute z-[31] flex flex-col overflow-hidden rounded-xl border border-border bg-surface/94 shadow-border"
        style={{ left: 8, right: 8, bottom: 162 }}
      >
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-1.5">
          {folder !== "root" ? (
            <button
              type="button"
              aria-label="Retour"
              onClick={() => setFolder("root")}
              className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg"
            >
              <ChevronLeft className="size-4" />
            </button>
          ) : null}
          <p className="min-w-0 flex-1 px-1 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
            {FOLDER_TITLE[folder]}
          </p>
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="overflow-grid p-2">
          {tiles.map((tile) => {
            if (tile.kind === "folder") {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => setFolder(tile.id)}
                  className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg bg-elevated/80 px-1 py-1.5 text-muted ring-1 ring-border/40 hover:bg-accent/10 hover:text-fg hover:ring-accent/30"
                >
                  <span className="flex items-center gap-0.5">
                    <Icon className="ico-live size-3.5" />
                    <ChevronRight className="size-3 opacity-60" />
                  </span>
                  <span className="w-full truncate text-center text-[11px] font-medium leading-tight">{tile.label}</span>
                </button>
              );
            }
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => onAction(tile.id)}
                className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg bg-elevated/80 px-1 py-1.5 text-muted ring-1 ring-border/40 hover:bg-accent/10 hover:text-fg hover:ring-accent/30"
              >
                <Icon className={cn("ico-live size-3.5", tile.id === "dossier" && "text-accent")} />
                <span className="w-full truncate text-center text-[11px] font-medium leading-tight">{tile.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
