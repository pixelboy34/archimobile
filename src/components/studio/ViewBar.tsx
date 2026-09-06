import { ChevronLeft, ChevronRight, Layers, Plus } from "lucide-react";
import type { Project, ViewMode } from "@/lib/bim/types";
import { assessFeasibility } from "@/lib/bim/feasibility";
import { useStudio } from "@/lib/store/project-store";
import { isLiveTypical, typicalGroupSize } from "@/lib/cad/typical";

/** TOP-LEFT: vues + niveaux + Isoler (drawing toggles → CommandOrb). */
export function ViewBar({
  project,
  onStories,
  onSite,
}: {
  project: Project;
  onStories: () => void;
  onSite?: () => void;
}) {
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const workspace = useStudio((s) => s.workspace);
  const storyId = useStudio((s) => s.storyId);
  const setStory = useStudio((s) => s.setStory);
  const isolateStory = useStudio((s) => s.isolateStory);
  const setIsolateStory = useStudio((s) => s.setIsolateStory);
  const skill = useStudio((s) => s.skill);
  const addStory = useStudio((s) => s.addStory);
  const active = storyId ?? project.stories[0]?.id;
  const idx = Math.max(0, project.stories.findIndex((s) => s.id === active));
  const simple = skill === "simple";
  if (workspace !== "modele" && view !== "ar") return null;

  const views: { id: ViewMode; label: string }[] = simple
    ? [
        { id: "3d", label: "3D" },
        { id: "plan", label: "Plan" },
        { id: "visite", label: "Visite" },
      ]
    : [
        { id: "3d", label: "3D" },
        { id: "plan", label: "Plan" },
        { id: "visite", label: "Visite" },
        { id: "coupe", label: "Coupe" },
        { id: "ar", label: "AR" },
      ];

  const feas = assessFeasibility(project);
  const failBadge =
    feas.verdict === "fail"
      ? !feas.gauges.ces.ok
        ? "CES dépassé"
        : !feas.gauges.cos.ok
          ? "COS dépassé"
          : "Site non conforme"
      : null;

  const go = (dir: number) => {
    const n = project.stories[(idx + dir + project.stories.length) % project.stories.length];
    if (!n) return;
    setStory(n.id);
    if (project.stories.length > 2) setIsolateStory(true);
  };

  return (
    <div className="pointer-events-auto absolute top-[calc(env(safe-area-inset-top)+3.1rem)] left-2 z-10 flex max-w-[calc(100%-5.25rem)] flex-col gap-1.5">
      <div className="flex flex-nowrap gap-1 overflow-x-auto pb-0.5">
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
      <div className="flex flex-nowrap gap-1 overflow-x-auto pb-0.5">
        {project.stories.length > 5 ? (
          <>
            <button type="button" aria-label="Niveau précédent" className="hud-chip px-2" onClick={() => go(-1)}>
              <ChevronLeft className="size-3.5" />
            </button>
            <button type="button" onClick={onStories} className="hud-chip hud-chip-on">
              {project.stories[idx]?.name ?? "Niveau"} · {idx + 1}/{project.stories.length}
            </button>
            <button type="button" aria-label="Niveau suivant" className="hud-chip px-2" onClick={() => go(1)}>
              <ChevronRight className="size-3.5" />
            </button>
          </>
        ) : (
          project.stories.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                if (st.id === active) onStories();
                else {
                  setStory(st.id);
                  if (project.stories.length > 2) setIsolateStory(true);
                }
              }}
              className={`hud-chip ${st.id === active ? "hud-chip-on" : ""}`}
            >
              {st.name}
              {isLiveTypical(st) && typicalGroupSize(project, st.id) > 1 ? " ↔" : ""}
            </button>
          ))
        )}
        <button type="button" aria-label="Ajouter un niveau" title="Ajouter un niveau" onClick={() => addStory()} className="hud-chip px-2">
          <Plus className="size-3.5" />
        </button>
        {project.stories.length > 1 && (
          <button type="button" onClick={() => setIsolateStory(!isolateStory)} className={`hud-chip gap-1 ${isolateStory ? "hud-chip-on" : ""}`}>
            <Layers className="size-3.5" />
            {isolateStory ? "Seul" : "Tous"}
          </button>
        )}
        {failBadge && (
          <button
            type="button"
            onClick={() => (onSite ? onSite() : onStories())}
            className="hud-chip gap-1 border-danger/40 text-danger"
            title="Ouvrir Site / Faisabilité"
          >
            {failBadge}
          </button>
        )}
      </div>
    </div>
  );
}
