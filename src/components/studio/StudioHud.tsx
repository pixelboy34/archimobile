import { TOOL_LABELS } from "@/lib/bim/types";
import { dist } from "@/lib/bim/geometry";
import { computeQuantities, formatEuro } from "@/lib/bim/quantities";
import { BUILD_PHASES } from "@/lib/bim/construction";
import { formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";

export function StudioHud() {
  const tool = useStudio((s) => s.tool);
  const draft = useStudio((s) => s.draft);
  const measure = useStudio((s) => s.measure);
  const view = useStudio((s) => s.view);
  const buildPhase = useStudio((s) => s.buildPhase);
  const showStructure = useStudio((s) => s.showStructure);
  const physicsOn = useStudio((s) => s.physics);
  const showHud = useStudio((s) => s.nav.showHud);
  const setDraft = useStudio((s) => s.setDraft);
  const setTool = useStudio((s) => s.setTool);
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  if (!project) return null;
  if (view === "ar") return null;
  if (!showHud) return null;
  const bill = computeQuantities(project);
  const hint =
    view === "visite"
      ? physicsOn
        ? "Physique Rapier · murs et portes solides · Espace pour sauter"
        : "Joystick ou WASD · glissez pour regarder · Maj pour courir"
      : view === "3d" && tool === "select"
        ? showStructure
          ? "Ossature · maquette sous le doigt · cube N-E-S-O"
          : "Maquette · 1 doigt tourne · 2 doigts déplace · Q/E 90°"
        : tool === "rect"
          ? draft
            ? "2e coin du rectangle — ortho au nord/est"
            : "Tapez le premier coin"
          : tool === "room"
            ? "Tapez pour détecter les pièces fermées"
        : tool === "wall"
      ? draft
        ? "2e point — tapez près de l’origine pour terminer"
        : "Tapez le départ du mur"
      : tool === "measure"
        ? draft
          ? "Tapez le 2e point de la cote"
          : "Tapez le premier point"
      : tool === "pen"
        ? "Glissez pour esquisser — stylet ou doigt"
        : tool === "furniture"
          ? "Choisissez un objet — tapez pour poser, aligné au mur proche · R pivote"
        : tool === "survey"
          ? "Tapez les angles du relevé — les cotes s’affichent"
          : tool === "select"
          ? showStructure
            ? "Structure porteuse"
            : BUILD_PHASES[buildPhase]?.label ?? "Livré"
          : `${TOOL_LABELS[tool]} — tapez dans le 3D ou le plan`;

  return (
    <div
      className={`pointer-events-none absolute left-3 z-10 flex items-start justify-between gap-2 ${
        view === "3d" || view === "coupe" ? "right-16" : "right-3"
      } ${view === "coupe" ? "top-[calc(env(safe-area-inset-top)+8.5rem)]" : view === "3d" ? "top-[calc(env(safe-area-inset-top)+7.25rem)]" : "top-[calc(env(safe-area-inset-top)+6.5rem)]"}`}
    >
      {tool !== "furniture" && (
        <div className="hud-panel px-3 py-2 text-xs text-muted">
          {hint}
          {measure && (
            <span className="ml-2 font-mono text-fg tabular">{formatMeters(dist(measure.a, measure.b))}</span>
          )}
          {draft && tool === "wall" && (
            <button
              type="button"
              className="pointer-events-auto ml-2 rounded-full bg-elevated px-2 py-1 text-[11px] text-fg"
              onClick={() => {
                setDraft(null);
                setTool("select");
              }}
            >
              Terminer
            </button>
          )}
        </div>
      )}
      {tool === "select" && (
      <div className="hud-panel ml-auto px-3 py-2 text-right">
        <p className="font-mono text-sm font-semibold tabular text-accent">{formatEuro(bill.totalHT)}</p>
        <p className="hud-label">Métré HT</p>
      </div>
      )}
    </div>
  );
}