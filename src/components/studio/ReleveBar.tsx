import { useRef, useState } from "react";
import { toast } from "sonner";
import { closedSurveyPerimeter } from "@/lib/bim/survey-to-walls";
import {
  defaultUnderlay,
  extractStrokesFromUnderlay,
  fileToUnderlaySrc,
} from "@/lib/bim/survey-underlay";
import { surveyPerimeter } from "@/lib/bim/sketch";
import { formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";

/**
 * Compact bar above CommandOrb in workspace Relevé (or survey/pen tools).
 * Import plan → underlay + extract traits → Fermer/Traits → murs.
 * Underlay adjusters collapse by default on narrow screens to keep the plan visible.
 */
export function ReleveBar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const workspace = useStudio((s) => s.workspace);
  const tool = useStudio((s) => s.tool);
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const storyId = useStudio((s) => s.storyId);
  const clearSurvey = useStudio((s) => s.clearSurvey);
  const buildWallsFromSurvey = useStudio((s) => s.buildWallsFromSurvey);
  const buildWallsFromStrokes = useStudio((s) => s.buildWallsFromStrokes);
  const setWorkspace = useStudio((s) => s.setWorkspace);
  const setView = useStudio((s) => s.setView);
  const setSurveyUnderlay = useStudio((s) => s.setSurveyUnderlay);
  const patchSurveyUnderlay = useStudio((s) => s.patchSurveyUnderlay);
  const clearSurveyUnderlay = useStudio((s) => s.clearSurveyUnderlay);
  const addStrokesFromPolylines = useStudio((s) => s.addStrokesFromPolylines);

  const active =
    workspace === "releve" || tool === "survey" || (workspace === "esquisse" && tool === "pen");
  if (!active || !project || !storyId) return null;

  const survey = (project.survey ?? []).filter((s) => s.storyId === storyId);
  const strokes = (project.strokes ?? []).filter((s) => s.storyId === storyId);
  const underlay =
    project.surveyUnderlay?.storyId === storyId ? project.surveyUnderlay : null;
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

  const onImport = async (file: File | undefined) => {
    if (!file || !storyId) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      toast.error("Formats : JPG, PNG ou WebP");
      return;
    }
    setBusy(true);
    try {
      const { src, naturalWidth, naturalHeight, ephemeral } = await fileToUnderlaySrc(file);
      setSurveyUnderlay(defaultUnderlay(storyId, src, naturalWidth, naturalHeight, ephemeral));
      setAdjustOpen(false);
      toast.success(
        ephemeral
          ? "Plan importé (blob) — compresser/réimporter pour persister"
          : "Plan importé sous le relevé",
      );
    } catch {
      toast.error("Import impossible");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onExtract = async () => {
    if (!underlay) {
      toast.message("Importez d’abord un plan");
      return;
    }
    setBusy(true);
    try {
      const { polylines, edgeCount } = await extractStrokesFromUnderlay(underlay);
      if (edgeCount < 40 || polylines.length === 0) {
        toast.message("Peu de traits détectés — ajustez le seuil / le contraste ou tracez à la main");
      }
      if (!polylines.length) return;
      const n = addStrokesFromPolylines(polylines);
      toast.success(`${n} trait(s) extraits — éditez puis « Traits → murs »`);
    } catch {
      toast.error("Extraction impossible");
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "min-h-11 rounded-xl px-3 text-[11px] font-medium tracking-wide uppercase disabled:opacity-40";

  return (
    <div className="pointer-events-auto mb-2 w-full max-w-md px-1">
      <div className="hud-panel flex max-h-[42dvh] flex-col gap-2 overflow-y-auto px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] tracking-wide text-accent uppercase">
            Relevé · {survey.length} pts · {formatMeters(peri)}
            {strokes.length ? ` · ${strokes.length} traits` : ""}
            {underlay ? " · plan" : ""}
          </p>
          <p className="text-[10px] text-muted">Tapez les angles</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className={`${btn} border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20`}
          >
            Importer un plan
          </button>
          <button
            type="button"
            disabled={busy || !underlay}
            onClick={() => void onExtract()}
            className={`${btn} border border-border/60 bg-elevated/50 text-fg`}
          >
            Extraire les traits
          </button>
          {underlay && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAdjustOpen((v) => !v)}
                className={`${btn} border border-border/50 bg-elevated/40 text-muted`}
                aria-expanded={adjustOpen}
              >
                {adjustOpen ? "Masquer réglages" : "Ajuster le plan"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  clearSurveyUnderlay(storyId);
                  setAdjustOpen(false);
                  toast.message("Plan retiré");
                }}
                className={`${btn} text-muted hover:bg-elevated`}
              >
                Effacer plan
              </button>
            </>
          )}
        </div>

        {underlay && adjustOpen && (
          <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
            <label className="flex flex-col gap-0.5">
              <span className="flex justify-between text-[10px] tracking-wide text-muted uppercase">
                Opacité
                <span className="font-mono text-fg">{Math.round(underlay.opacity * 100)} %</span>
              </span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={underlay.opacity}
                onChange={(e) => patchSurveyUnderlay({ opacity: Number(e.target.value) })}
                className="h-11 w-full accent-accent [touch-action:none]"
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="flex justify-between text-[10px] tracking-wide text-muted uppercase">
                Échelle
                <span className="font-mono text-fg">{underlay.scale.toFixed(1)} m</span>
              </span>
              <input
                type="range"
                min={2}
                max={40}
                step={0.5}
                value={underlay.scale}
                onChange={(e) => patchSurveyUnderlay({ scale: Number(e.target.value) })}
                className="h-11 w-full accent-accent [touch-action:none]"
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="flex justify-between text-[10px] tracking-wide text-muted uppercase">
                Rotation
                <span className="font-mono text-fg">
                  {Math.round((underlay.rotation * 180) / Math.PI)}°
                </span>
              </span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={Math.round((underlay.rotation * 180) / Math.PI)}
                onChange={(e) =>
                  patchSurveyUnderlay({ rotation: (Number(e.target.value) * Math.PI) / 180 })
                }
                className="h-11 w-full accent-accent [touch-action:none]"
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["←", -0.5, 0],
                  ["→", 0.5, 0],
                  ["↑", 0, 0.5],
                  ["↓", 0, -0.5],
                ] as const
              ).map(([label, dx, dy]) => (
                <button
                  key={label}
                  type="button"
                  className="min-h-11 min-w-11 rounded-lg bg-elevated px-3 text-sm text-fg hover:bg-elevated/80"
                  onClick={() =>
                    patchSurveyUnderlay({
                      offset: {
                        x: underlay.offset.x + dx,
                        y: underlay.offset.y + dy,
                      },
                    })
                  }
                >
                  {label}
                </button>
              ))}
              <span className="self-center text-[10px] text-muted">Pan 0,5 m</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!canClose}
            onClick={onClose}
            className={`${btn} flex-1 ${
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
            className={`${btn} flex-1 ${
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
            className={`${btn} text-muted hover:bg-elevated`}
          >
            Effacer relevé
          </button>
        </div>
      </div>
    </div>
  );
}
