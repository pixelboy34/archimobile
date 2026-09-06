import { useEffect, useMemo, useState } from "react";
import { FIRE_LABELS, FURNITURE_LABELS, MATERIAL_LABELS, ROLE_LABELS, ROOM_LABELS, type Project } from "@/lib/bim/types";
import { polygonArea, wallLength } from "@/lib/bim/geometry";
import { formatMeters } from "@/lib/utils";
import { mergeDetectedRooms } from "@/lib/bim/rooms";
import { healWallEnds } from "@/lib/cad/ops";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PropertiesPanel } from "./PropertiesPanel";

type Family = "walls" | "openings" | "rooms" | "slabs" | "roofs" | "columns" | "stairs" | "furniture";

const FAMILIES: { id: Family; label: string }[] = [
  { id: "walls", label: "Murs" },
  { id: "openings", label: "Baies" },
  { id: "rooms", label: "Pièces" },
  { id: "slabs", label: "Dalles" },
  { id: "roofs", label: "Toits" },
  { id: "columns", label: "Poteaux" },
  { id: "stairs", label: "Escaliers" },
  { id: "furniture", label: "Objets" },
];

function detectFamily(project: Project, id: string | undefined): Family {
  if (!id) return "walls";
  if (project.walls.some((w) => w.id === id)) return "walls";
  if (project.openings.some((o) => o.id === id)) return "openings";
  if (project.rooms.some((r) => r.id === id)) return "rooms";
  if (project.slabs.some((s) => s.id === id)) return "slabs";
  if (project.roofs.some((r) => r.id === id)) return "roofs";
  if (project.columns.some((c) => c.id === id)) return "columns";
  if (project.stairs.some((s) => s.id === id)) return "stairs";
  if (project.furniture.some((f) => f.id === id)) return "furniture";
  return "walls";
}

export function OuvrageExplorer() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const selectedIds = useStudio((s) => s.selectedIds);
  const storyId = useStudio((s) => s.storyId);
  const isolateStory = useStudio((s) => s.isolateStory);
  const select = useStudio((s) => s.select);
  const commit = useStudio((s) => s.commit);
  const [family, setFamily] = useState<Family>("walls");
  const [levelOnly, setLevelOnly] = useState(true);

  useEffect(() => {
    if (!project || !selectedIds[0]) return;
    setFamily(detectFamily(project, selectedIds[0]));
  }, [project, selectedIds]);
  if (!project) return null;

  const activeStory = storyId ?? project.stories[0]?.id;
  const storyLabel = (id: string) => project.stories.find((s) => s.id === id)?.name ?? "";

  const counts = useMemo(() => {
    const on = (sid: string) => !levelOnly || sid === activeStory;
    return {
      walls: project.walls.filter((w) => on(w.storyId)).length,
      openings: project.openings.filter((o) => {
        const w = project.walls.find((x) => x.id === o.wallId);
        return w ? on(w.storyId) : false;
      }).length,
      rooms: project.rooms.filter((r) => on(r.storyId)).length,
      slabs: project.slabs.filter((s) => on(s.storyId)).length,
      roofs: project.roofs.filter((r) => on(r.storyId)).length,
      columns: project.columns.filter((c) => on(c.storyId)).length,
      stairs: project.stairs.filter((s) => on(s.storyId)).length,
      furniture: project.furniture.filter((f) => on(f.storyId)).length,
    };
  }, [project, levelOnly, activeStory]);

  const rows = useMemo(() => {
    const on = (sid: string) => !levelOnly || sid === activeStory;
    if (family === "walls") {
      return project.walls.filter((w) => on(w.storyId)).map((w) => ({
        id: w.id,
        title: `Mur ${formatMeters(wallLength(w))}`,
        meta: [
          `${Math.round(w.thickness * 100)} cm`,
          ROLE_LABELS[w.role ?? "interior"],
          w.uValue != null ? `U ${w.uValue.toFixed(2)}` : null,
          FIRE_LABELS[w.fireRating ?? "none"],
          MATERIAL_LABELS[w.materialId],
        ]
          .filter(Boolean)
          .join(" · "),
      }));
    }
    if (family === "openings") {
      return project.openings
        .filter((o) => {
          const w = project.walls.find((x) => x.id === o.wallId);
          return w ? on(w.storyId) : false;
        })
        .map((o) => ({
          id: o.id,
          title: `${o.kind === "door" ? "Porte" : "Fenêtre"} ${o.width.toFixed(2)} × ${o.height.toFixed(2)}`,
          meta: [
            o.variant ?? "single",
            o.glazing ? `vitrage ${o.glazing}` : null,
            o.uValue != null ? `Uw ${o.uValue.toFixed(1)}` : null,
            FIRE_LABELS[o.fireRating ?? "none"],
          ]
            .filter(Boolean)
            .join(" · "),
        }));
    }
    if (family === "rooms") {
      return project.rooms.filter((r) => on(r.storyId)).map((r) => ({
        id: r.id,
        title: r.name,
        meta: [
          r.name === ROOM_LABELS[r.function] ? null : ROOM_LABELS[r.function],
          `${polygonArea(r.polygon).toFixed(0)} m²`,
          r.heated === false ? "non chauffé" : "chauffé",
          r.floorFinish ? MATERIAL_LABELS[r.floorFinish] : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
    }
    if (family === "slabs") {
      return project.slabs.filter((s) => on(s.storyId)).map((s) => ({
        id: s.id,
        title: s.outdoor ? "Dalle extérieure" : "Plancher",
        meta: [
          `${polygonArea(s.polygon).toFixed(0)} m²`,
          `${Math.round(s.thickness * 100)} cm`,
          s.liveLoad ? `${s.liveLoad} kg/m²` : null,
          MATERIAL_LABELS[s.materialId],
        ]
          .filter(Boolean)
          .join(" · "),
      }));
    }
    if (family === "roofs") {
      return project.roofs.filter((r) => on(r.storyId)).map((r) => ({
        id: r.id,
        title: r.kind === "flat" ? "Toit-terrasse" : r.kind === "hip" ? "Croupe" : r.kind === "shed" ? "Une pente" : "Deux pentes",
        meta: [`${r.pitch}°`, `débord ${r.overhang.toFixed(2)} m`, MATERIAL_LABELS[r.materialId]].join(" · "),
      }));
    }
    if (family === "columns") {
      return project.columns.filter((c) => on(c.storyId)).map((c) => ({
        id: c.id,
        title: c.shape === "round" ? "Poteau circulaire" : "Poteau",
        meta: [`${c.width.toFixed(2)} × ${c.depth.toFixed(2)}`, MATERIAL_LABELS[c.materialId]].join(" · "),
      }));
    }
    if (family === "stairs") {
      return project.stairs.filter((s) => on(s.storyId)).map((s) => ({
        id: s.id,
        title: s.kind === "spiral" ? "Escalier hélicoïdal" : "Escalier droit",
        meta: [`${s.steps} marches`, `largeur ${s.width.toFixed(2)} m`, s.railing ? "garde-corps" : "sans rampe"].join(" · "),
      }));
    }
    return project.furniture.filter((f) => on(f.storyId)).map((f) => ({
      id: f.id,
      title: FURNITURE_LABELS[f.kind],
      meta: `${f.w.toFixed(2)} × ${f.d.toFixed(2)} · ${storyLabel(f.storyId)}`,
    }));
  }, [project, family, levelOnly, activeStory]);

  const selected = selectedIds[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {isolateStory || levelOnly
            ? `Niveau ${project.stories.find((s) => s.id === activeStory)?.name ?? ""}`
            : "Tous les niveaux"}
        </p>
        <button
          type="button"
          onClick={() => setLevelOnly((v) => !v)}
          className={`h-8 rounded-full px-3 text-[11px] ${
            levelOnly ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
          }`}
        >
          {levelOnly ? "Niveau actif" : "Tout le modèle"}
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {FAMILIES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFamily(f.id)}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs ${
              family === f.id ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
            }`}
          >
            {f.label}
            <span className="font-mono tabular opacity-80">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <ul className={`flex flex-col gap-1 overflow-y-auto ${selected ? "max-h-40" : "max-h-52"}`}>
        {rows.length === 0 ? (
          <li className="rounded-lg border border-border px-3 py-5 text-center text-sm text-muted">
            <p>Aucun ouvrage dans cette famille.</p>
            {(family === "rooms" || family === "walls") && (
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  variant="accent"
                  className="w-full"
                  onClick={() => {
                    const sid = activeStory;
                    if (!sid) return;
                    commit((p) => {
                      p.rooms = mergeDetectedRooms(p, sid);
                      return p;
                    });
                    setFamily("rooms");
                    toast.success("Pièces détectées");
                  }}
                >
                  Détecter pièces
                </Button>
                {family === "walls" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const sid = activeStory;
                      if (!sid) return;
                      commit((p) => healWallEnds(p, sid));
                      toast.success("Jonctions soignées");
                    }}
                  >
                    Soigner jonctions
                  </Button>
                )}
              </div>
            )}
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => select([row.id])}
                className={`w-full rounded-lg border px-3 py-2.5 text-left ${
                  selected === row.id ? "border-accent/60 bg-elevated" : "border-border bg-surface"
                }`}
              >
                <p className="text-sm font-medium">{row.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-subtle tabular">{row.meta}</p>
              </button>
            </li>
          ))
        )}
      </ul>

      <PropertiesPanel compact />
    </div>
  );
}
