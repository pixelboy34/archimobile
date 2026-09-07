import { TOOL_LABELS, ROLE_LABELS, type Project, type ViewMode } from "@/lib/bim/types";
import { dist, polygonArea, wallLength } from "@/lib/bim/geometry";
import { formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { linkedTypicalHint } from "@/lib/cad/typical";

const VIEW_LABELS: Record<ViewMode, string> = {
  "3d": "3D",
  plan: "Plan",
  visite: "Visite",
  coupe: "Coupe",
  ar: "AR",
};

/** Thin TOP status line: mode · outil · dims · types liés */
export function StudioHud() {
  const tool = useStudio((s) => s.tool);
  const draft = useStudio((s) => s.draft);
  const measure = useStudio((s) => s.measure);
  const view = useStudio((s) => s.view);
  const showStructure = useStudio((s) => s.showStructure);
  const physicsOn = useStudio((s) => s.physics);
  const setPhysics = useStudio((s) => s.setPhysics);
  const showHud = useStudio((s) => s.nav.showHud);
  const selectedIds = useStudio((s) => s.selectedIds);
  const setDraft = useStudio((s) => s.setDraft);
  const setTool = useStudio((s) => s.setTool);
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const storyId = useStudio((s) => s.storyId);
  const isolateStory = useStudio((s) => s.isolateStory);
  if (!project) return null;
  const typicalHint = linkedTypicalHint(project, storyId);
  if (view === "ar") return null;
  if (!showHud) return null;
  const sel = selectedIds[0] ? selectionHud(project, selectedIds[0]) : null;

  const parts = [
    VIEW_LABELS[view],
    TOOL_LABELS[tool],
    showStructure ? "Ossature" : null,
    sel?.dims ?? null,
    measure ? formatMeters(dist(measure.a, measure.b)) : null,
    typicalHint,
  ].filter(Boolean) as string[];

  const surveyCount = (project.survey ?? []).filter((s) => s.storyId === storyId).length;
  const hint =
    view === "visite"
      ? physicsOn
        ? "Physique · Espace pour sauter"
        : "Joystick ou WASD · glissez pour regarder"
      : draft && tool === "wall"
        ? "2e point — longueur live"
        : draft && tool === "rect"
          ? "2e coin du rectangle"
          : tool === "survey"
            ? surveyCount < 3
              ? "Tapez les angles — 3 points min. pour Fermer → murs"
              : `Fermer → murs · ${surveyCount} points — ou continuez le polygone`
            : tool === "pen"
              ? "Tracez un trait — Traits → murs dans la barre Relevé"
              : tool === "window" || tool === "door"
                ? "Accroche façade — tapez pour poser"
                : sel
                  ? sel.line
                  : project.stories.length >= 8 && !isolateStory
                    ? "Isoler l’étage pour plus de détail"
                    : null;

  return (
    <div
      className={`pointer-events-none absolute left-3 right-3 z-10 flex items-center gap-2 ${
        view === "coupe"
          ? "top-[calc(env(safe-area-inset-top)+8.5rem)]"
          : view === "3d" || view === "visite"
            ? "top-[calc(env(safe-area-inset-top)+7.1rem)]"
            : "top-[calc(env(safe-area-inset-top)+6.4rem)]"
      }`}
    >
      <div className="hud-panel flex min-w-0 max-w-full items-center gap-2 px-3 py-1.5 text-xs text-muted">
        <p className="truncate font-mono text-[10px] tracking-wide text-accent uppercase">
          {parts.join(" · ")}
        </p>
        {hint && <span className="hidden truncate text-[11px] text-muted sm:inline">{hint}</span>}
        {view === "visite" && (
          <button
            type="button"
            className={`pointer-events-auto ml-auto h-8 shrink-0 rounded-full px-2.5 text-[10px] font-medium tracking-wide uppercase ${
              physicsOn ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-elevated text-muted"
            }`}
            onClick={() => setPhysics(!physicsOn)}
          >
            Physique
          </button>
        )}
        {draft && tool === "wall" && (
          <button
            type="button"
            className="pointer-events-auto ml-auto h-8 shrink-0 rounded-full bg-elevated px-2.5 text-[11px] text-fg"
            onClick={() => {
              setDraft(null);
              setTool("select");
            }}
          >
            Terminer
          </button>
        )}
      </div>
    </div>
  );
}

function selectionHud(project: Project, id: string) {
  const wall = project.walls.find((w) => w.id === id);
  if (wall) {
    return {
      label: wall.loadBearing ? "Mur porteur" : "Mur",
      line: `${ROLE_LABELS[wall.role ?? "interior"]} · L×H×ép`,
      dims: `${formatMeters(wallLength(wall))} × ${formatMeters(wall.height)} × ${wall.thickness.toFixed(2)} m`,
    };
  }
  const opening = project.openings.find((o) => o.id === id);
  if (opening) {
    return {
      label: opening.kind === "door" ? "Porte" : "Fenêtre",
      line: "Baie · L×H",
      dims: `${formatMeters(opening.width)} × ${formatMeters(opening.height)}`,
    };
  }
  const room = project.rooms.find((r) => r.id === id);
  if (room) {
    return {
      label: room.name,
      line: "Pièce",
      dims: `${polygonArea(room.polygon).toFixed(1)} m²`,
    };
  }
  const column = project.columns.find((c) => c.id === id);
  if (column) {
    return {
      label: "Poteau",
      line: "L×P×H",
      dims: `${column.width.toFixed(2)} × ${column.depth.toFixed(2)} × ${column.height.toFixed(2)} m`,
    };
  }
  const stair = project.stairs.find((s) => s.id === id);
  if (stair) {
    return {
      label: "Escalier",
      line: "Course × largeur",
      dims: `${stair.run.toFixed(2)} × ${stair.width.toFixed(2)} m`,
    };
  }
  const slab = project.slabs.find((s) => s.id === id);
  if (slab) {
    return {
      label: "Dalle",
      line: "Surface · épaisseur",
      dims: `${polygonArea(slab.polygon).toFixed(1)} m² · é ${slab.thickness.toFixed(2)} m`,
    };
  }
  const roof = project.roofs.find((r) => r.id === id);
  if (roof) {
    return {
      label: "Toiture",
      line: "Pente · débord",
      dims: `${roof.pitch}° · ${roof.overhang.toFixed(2)} m`,
    };
  }
  const furn = project.furniture.find((f) => f.id === id);
  if (furn) {
    return {
      label: "Objet",
      line: "L×P×H",
      dims: `${furn.w.toFixed(2)} × ${furn.d.toFixed(2)} × ${furn.h.toFixed(2)} m`,
    };
  }
  return null;
}
