import { toast } from "sonner";
import { closedSurveyPerimeter } from "@/lib/bim/survey-to-walls";
import { surveyPerimeter } from "@/lib/bim/sketch";
import { formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";

/**
 * Compact bar above CommandOrb in workspace Relevé (or survey/pen tools).
 * Fermer → murs / Traits → murs / Effacer relevé.
 */
export function ReleveBar() {
  const workspace = useStudio((s) => s.workspace);
  const tool = useStudio((s) => s.tool);
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const storyId = useStudio((s) => s.storyId);
  const clearSurvey = useStudio((s) => s.clearSurvey);
  const buildWallsFromSurvey = useStudio((s) => s.buildWallsFromSurvey);
  const buildWallsFromStrokes = useStudio((s) => s.buildWallsFromStrokes);
  const setWorkspace = useStudio((s) => s.setWorkspace);
  const setView = useStudio((s) => s.setView);

  const active =
    workspace === "releve" || tool === "survey" || (workspace === "esquisse" && tool === "pen");
  if (!active || !project || !storyId) return null;

  const survey = (project.survey ?? []).filter((s) => s.storyId === storyId);
  const strokes = (project.strokes ?? []).filter((s) => s.storyId === storyId);
  const pts = survey.map((s) => s.position);
  const peri =
    pts.length >= 3 ? closedSurveyPerimeter(pts) : surveyPerimeter(survey);
  const canClose = pts.length >= 3;
  const canStrokes = strokes.some((s) => (s.points?.length ?? 0) >= 2);

  const onClose = () => {
    const r = buildWallsFromSurvey();
    if (!r || r.wallCount === 0) {
      toast.message("Relevé insuffisant — tapez au moins 3 angles");
      return;
    }
    toast.success(`Relevé · ${r.wallCount} murs · ${r.perimeter.toFixed(1)} m`);
    setWorkspace("modele");
    setView("3d");
  };

  const onStrokes = () => {
    const r = buildWallsFromStrokes();
    if (!r || r.wallCount === 0) {
      toast.message("Aucun trait à vectoriser");
      return;
    }
    toast.success(`Relevé · ${r.wallCount} murs · ${r.perimeter.toFixed(1)} m`);
    setWorkspace("modele");
    setView("3d");
  };

  return (
    <div className="pointer-events-auto mb-2 w-full max-w-md px-1">
      <div className="hud-panel flex flex-col gap-2 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] tracking-wide text-accent uppercase">
            Relevé · {survey.length} pts · {formatMeters(peri)}
            {strokes.length ? ` · ${strokes.length} traits` : ""}
          </p>
          <p className="text-[10px] text-muted">Tapez les angles</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!canClose}
            onClick={onClose}
            className={`h-9 flex-1 rounded-xl px-2.5 text-[11px] font-semibold tracking-wide uppercase ${
              canClose
                ? "bg-accent text-accent-fg"
                : "cursor-not-allowed bg-elevated text-muted/50"
            }`}
          >
            Fermer → murs
          </button>
          <button
            type="button"
            disabled={!canStrokes}
            onClick={onStrokes}
            className={`h-9 flex-1 rounded-xl px-2.5 text-[11px] font-medium tracking-wide uppercase ${
              canStrokes
                ? "border border-accent/40 bg-accent/10 text-accent"
                : "cursor-not-allowed border border-border/50 bg-elevated/40 text-muted/50"
            }`}
          >
            Traits → murs
          </button>
          <button
            type="button"
            disabled={survey.length === 0}
            onClick={() => {
              clearSurvey();
              toast.message("Relevé effacé");
            }}
            className="h-9 rounded-xl px-2.5 text-[11px] text-muted hover:bg-elevated disabled:opacity-40"
          >
            Effacer relevé
          </button>
        </div>
      </div>
    </div>
  );
}
