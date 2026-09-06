import { ensureSketch } from "@/lib/bim/sketch";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";

export function LayersPanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const toggleLayer = useStudio((s) => s.toggleLayer);
  const addLayer = useStudio((s) => s.addLayer);
  const addRevision = useStudio((s) => s.addRevision);
  const clearSurvey = useStudio((s) => s.clearSurvey);
  if (!project) return null;
  const p = ensureSketch(project);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Calques vectoriels superposés au plan — comme une table lumineuse.</p>
      {p.layers!.map((l) => (
        <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <button
            type="button"
            onClick={() => toggleLayer(l.id, { visible: !l.visible })}
            className={`size-3 rounded-full ${l.visible ? "bg-accent" : "bg-elevated"}`}
            aria-label={l.visible ? "Masquer" : "Afficher"}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
          <button
            type="button"
            onClick={() => toggleLayer(l.id, { locked: !l.locked })}
            className="text-[11px] tracking-wide text-muted uppercase"
          >
            {l.locked ? "Verrouillé" : "Libre"}
          </button>
        </div>
      ))}
      <Button variant="outline" onClick={addLayer}>
        Nouveau calque
      </Button>
      <Button variant="outline" onClick={() => addRevision("Jalon")}>
        Jalon de version
      </Button>
      <Button variant="ghost" className="text-danger" onClick={clearSurvey}>
        Effacer le relevé
      </Button>
      <p className="text-[11px] text-subtle">
        {(p.strokes ?? []).length} traits · {(p.survey ?? []).length} points · {(p.revisions ?? []).length}{" "}
        versions
      </p>
    </div>
  );
}
