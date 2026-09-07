import { useMemo, useState } from "react";
import { Download, Table2 } from "lucide-react";
import { toast } from "sonner";
import {
  NOM_TITLES,
  buildNomenclature,
  exportAllNomenclaturesCsv,
  exportNomenclatureCsv,
  formatEuro,
  type NomKind,
} from "@/lib/bim/nomenclature";
import { downloadText } from "@/lib/bim/quantities";
import { cn } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";

const TABS: NomKind[] = ["postes", "murs", "portes", "fenetres", "pieces", "objets", "matieres"];

export function NomenclaturePanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const storyId = useStudio((s) => s.storyId);
  const select = useStudio((s) => s.select);
  const setIsolate = useStudio((s) => s.setIsolateStory);
  const setStory = useStudio((s) => s.setStory);
  const [kind, setKind] = useState<NomKind>("portes");
  const [levelOnly, setLevelOnly] = useState(false);

  const nom = useMemo(() => {
    if (!project) return null;
    return buildNomenclature(project, kind, levelOnly ? storyId : null);
  }, [project, kind, levelOnly, storyId]);

  if (!project || !nom) return <p className="text-sm text-muted">Aucun projet ouvert.</p>;

  const slug = project.name.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Table2 className="ico-live size-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold">Nomenclatures</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Listes groupées depuis le modèle. Tapez une ligne pour cadrer l’ouvrage.
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={cn(
              "h-8 shrink-0 rounded-full px-2.5 text-[11px] font-medium",
              kind === id ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-elevated text-fg/80",
            )}
          >
            {NOM_TITLES[id]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLevelOnly(false)}
          className={cn("h-8 rounded-full px-2.5 text-[11px] font-medium", !levelOnly ? "bg-accent/15 text-accent" : "text-muted")}
        >
          Tous les niveaux
        </button>
        <button
          type="button"
          onClick={() => setLevelOnly(true)}
          className={cn("h-8 rounded-full px-2.5 text-[11px] font-medium", levelOnly ? "bg-accent/15 text-accent" : "text-muted")}
        >
          {project.stories.find((s) => s.id === storyId)?.name ?? "Niveau"}
        </button>
        <span className="ml-auto font-mono text-[11px] text-muted tabular">
          {nom.rows.length} ligne{nom.rows.length > 1 ? "s" : ""}
        </span>
      </div>

      {nom.rows.length === 0 ? (
        <p className="rounded-xl bg-elevated px-3 py-6 text-center text-sm text-muted">
          Rien à lister sur ce filtre.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {nom.rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-3 py-2.5 text-left hover:bg-elevated/80"
                onClick={() => {
                  if (!r.entityIds.length) return;
                  select(r.entityIds);
                  const first = r.entityIds[0]!;
                  const wall = project.walls.find((w) => w.id === first);
                  const furn = project.furniture.find((f) => f.id === first);
                  const room = project.rooms.find((x) => x.id === first);
                  const op = project.openings.find((o) => o.id === first);
                  const sid =
                    wall?.storyId ??
                    furn?.storyId ??
                    room?.storyId ??
                    (op ? project.walls.find((w) => w.id === op.wallId)?.storyId : undefined);
                  if (sid) {
                    setStory(sid);
                    setIsolate(true);
                  }
                }}
              >
                <span className="w-10 shrink-0 font-mono text-[10px] font-semibold tracking-wide text-accent">
                  {r.mark}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{r.label}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {r.story} · {r.spec}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[12px] tabular text-fg">
                    {r.qty.toLocaleString("fr-FR")} {r.unit}
                  </span>
                  {r.total > 0 && (
                    <span className="block font-mono text-[10px] text-muted tabular">{formatEuro(r.total)}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-baseline justify-between rounded-lg bg-elevated px-3 py-2.5">
        <span className="text-sm">Total HT · {nom.title}</span>
        <span className="font-display text-lg font-semibold tabular">{formatEuro(nom.totalHT)}</span>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            downloadText(`${slug}-${kind}.csv`, exportNomenclatureCsv(nom, project.name), "text/csv");
            toast.success(`${nom.title} · CSV`);
          }}
        >
          <Download className="size-4" />
          Cette liste
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          onClick={() => {
            downloadText(`${slug}-nomenclatures.csv`, exportAllNomenclaturesCsv(project), "text/csv");
            toast.success("Toutes les nomenclatures");
          }}
        >
          <Download className="size-4" />
          Tout
        </Button>
      </div>
    </div>
  );
}
