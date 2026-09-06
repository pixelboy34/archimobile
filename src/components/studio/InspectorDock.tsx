import { X } from "lucide-react";
import { PropertiesPanel, type ParamsTab } from "./PropertiesPanel";

const TABS: { id: ParamsTab; label: string }[] = [
  { id: "ouvrage", label: "Ouvrage" },
  { id: "niveaux", label: "Étages" },
  { id: "projet", label: "Site" },
  { id: "rendu", label: "Vue" },
];

export function InspectorDock({
  tab,
  onTab,
  onClose,
}: {
  tab: ParamsTab;
  onTab: (t: ParamsTab) => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex max-h-[46dvh] flex-col border-t border-accent/30 bg-surface/95 shadow-border backdrop-blur-md">
      <div className="flex items-center gap-1 px-2 pt-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`h-10 shrink-0 px-3 text-xs font-medium tracking-wide ${
                tab === t.id ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Fermer" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center text-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(0.8rem,env(safe-area-inset-bottom))]">
        <PropertiesPanel tab={tab} onTab={onTab} />
      </div>
    </div>
  );
}
