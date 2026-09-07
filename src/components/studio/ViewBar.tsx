import { Box, Footprints, LayoutDashboard, Scan, SquareSplitVertical } from "lucide-react";
import type { Project, ViewMode } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";

const VIEW_META: { id: ViewMode; label: string; Icon: typeof Box }[] = [
  { id: "3d", label: "3D", Icon: Box },
  { id: "plan", label: "Plan", Icon: LayoutDashboard },
  { id: "visite", label: "Visite", Icon: Footprints },
  { id: "coupe", label: "Coupe", Icon: SquareSplitVertical },
  { id: "ar", label: "AR", Icon: Scan },
];

/** BOTTOM-LEFT corner: vues. */
export function ViewBar({
  docked = false,
}: {
  project: Project;
  onStories: () => void;
  onSite?: () => void;
  docked?: boolean;
}) {
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const workspace = useStudio((s) => s.workspace);
  const skill = useStudio((s) => s.skill);
  const simple = skill === "simple";
  if (workspace !== "modele" && view !== "ar") return null;

  const views = simple ? VIEW_META.slice(0, 3) : VIEW_META;

  return (
    <div
      className={
        docked
          ? "view-bar pointer-events-auto flex w-36 min-w-36 max-w-36 shrink-0 flex-nowrap gap-1 overflow-x-auto"
          : "view-bar pointer-events-auto z-10 flex max-w-[min(58%,14rem)] flex-nowrap gap-1 overflow-x-auto"
      }
      style={docked ? undefined : { position: "absolute", left: 8, bottom: 162 }}
    >
      {views.map((v) => {
        const Icon = v.Icon;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`hud-chip ${view === v.id ? "hud-chip-on" : ""}`}
          >
            <Icon className="ico-live size-3.5" />
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
