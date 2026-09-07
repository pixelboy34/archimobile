import type { Project, ViewMode } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";

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

  const views: { id: ViewMode; label: string }[] = [
    { id: "3d", label: "3D" },
    { id: "plan", label: "Plan" },
    { id: "visite", label: "Visite" },
    ...(!simple
      ? ([
          { id: "coupe", label: "Coupe" },
          { id: "ar", label: "AR" },
        ] as { id: ViewMode; label: string }[])
      : []),
  ];

  return (
    <div
      className="view-bar pointer-events-auto z-10 flex max-w-[min(58%,14rem)] flex-nowrap gap-1 overflow-x-auto"
      style={{ position: "absolute", left: 8, bottom: 136 }}
    >
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => setView(v.id)}
          className={`hud-chip ${view === v.id ? "hud-chip-on" : ""}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
