import { TOOL_LABELS, ROLE_LABELS, type Project, type ViewMode } from "@/lib/bim/types";
import { dist, polygonArea, wallLength } from "@/lib/bim/geometry";
import { computeQuantities, formatEuro } from "@/lib/bim/quantities";
import { BUILD_PHASES } from "@/lib/bim/construction";
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

export function StudioHud() {
  const tool = useStudio((s) => s.tool);
  const draft = useStudio((s) => s.draft);
  const measure = useStudio((s) => s.measure);
  const view = useStudio((s) => s.view);
  const buildPhase = useStudio((s) => s.buildPhase);
  const showStructure = useStudio((s) => s.showStructure);
  const physicsOn = useStudio((s) => s.physics);
  const showHud = useStudio((s) => s.nav.showHud);
  const selectedIds = useStudio((s) => s.selectedIds);
  const setDraft = useStudio((s) => s.setDraft);
  const setTool = useStudio((s) => s.setTool);
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const storyId = useStudio((s) => s.storyId);
  const cursorHint = useStudio((s) => s.draft);
  if (!project) return null;
  const typicalHint = linkedTypicalHint(project, storyId);
  if (view === "ar") return null;
  if (!showHud) return null;
  const bill = computeQuantities(project);
  const sel = selectedIds[0] ? selectionHud(project, selectedIds[0]) : null;
  const modeLine = `${VIEW_LABELS[view]} · ${TOOL_LABELS[tool]}${showStructure ? " · Ossature" : ""}`;

  const hint =
    view === "visite"
      ? physicsOn
        ? "Physique Rapier · murs et portes solides · Espace pour sauter"
        : "Joystick ou WASD · glissez pour regarder · Maj pour courir"
      : view === "3d" && tool === "select"
        ? showStructure
          ? "Ossature · maquette sous le doigt · cube N-E-S-O"
          : sel
            ? sel.line
            : "Maquette · flèches pour nudger · Q/E 90°"
        : tool === "rect"
          ? draft
            ? "2e coin du rectangle — longueur live affichée"
            : "Tapez le premier coin"
          : tool === "room"
            ? "Tapez pour détecter les pièces fermées"
        : tool === "wall"
      ? draft
        ? "2e point — longueur live · près de l’origine pour terminer"
        : "Tapez le départ du mur"
      : tool === "measure"
        ? draft
          ? "Tapez le 2e point de la cote"
          : "Tapez le premier point"
      : tool === "pen"
        ? "Glissez pour esquisser — stylet ou doigt"
        : tool === "window" || tool === "door"
          ? "Accroche façade — passez sur un mur pour l’aperçu, tapez pour poser"
        : tool === "furniture"
          ? "Choisissez un objet — tapez pour poser, aligné au mur proche · R pivote"
        : tool === "survey"
          ? "Tapez les angles du relevé — les cotes s’affichent"
          : tool === "select"
          ? showStructure
            ? "Structure porteuse"
            : sel
              ? sel.line
              : BUILD_PHASES[buildPhase]?.label ?? "Livré"
          : `${TOOL_LABELS[tool]} — tapez dans le 3D ou le plan`;

  let liveDims: string | null = null;
  if (draft && (tool === "wall" || tool === "measure") && cursorHint) {
    // draft alone — length shown in plan canvas; HUD echoes when measure locked
  }
  if (measure) liveDims = formatMeters(dist(measure.a, measure.b));
  if (sel) liveDims = sel.dims;

  return (
    <div
      className={`pointer-events-none absolute left-3 z-10 flex items-start justify-between gap-2 ${
        view === "3d" || view === "coupe" ? "right-16" : "right-3"
      } ${view === "coupe" ? "top-[calc(env(safe-area-inset-top)+8.5rem)]" : view === "3d" ? "top-[calc(env(safe-area-inset-top)+7.25rem)]" : "top-[calc(env(safe-area-inset-top)+6.5rem)]"}`}
    >
      {tool !== "furniture" && (
        <div className="hud-panel px-3 py-2 text-xs text-muted">
          <p className="mb-0.5 font-mono text-[10px] tracking-wide text-accent uppercase">{modeLine}</p>
          {typicalHint && <p className="mb-0.5 text-[11px] font-medium text-accent">{typicalHint}</p>}
          <p>{hint}</p>
          {sel && tool === "select" && (
            <span className="ml-0 font-mono text-fg tabular">{sel.dims}</span>
          )}
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
        {sel ? (
          <>
            <p className="font-mono text-sm font-semibold tabular text-accent">{sel.dims}</p>
            <p className="hud-label">{sel.label}</p>
          </>
        ) : (
          <>
            <p className="font-mono text-sm font-semibold tabular text-accent">{formatEuro(bill.totalHT)}</p>
            <p className="hud-label">Métré HT</p>
          </>
        )}
        {showStructure && <p className="mt-0.5 text-[10px] tracking-wide text-accent uppercase">Ossature</p>}
        {liveDims && !sel && <p className="font-mono text-[11px] text-muted tabular">{liveDims}</p>}
      </div>
      )}
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
