import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
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
  const visible = (p.layers ?? []).filter((l) => l.visible).length;
  const locked = (p.layers ?? []).filter((l) => l.locked).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-muted">Calques vectoriels — table lumineuse.</p>
        <p className="font-mono text-[11px] text-accent tabular">
          {visible}/{p.layers!.length} · {locked} verrou
        </p>
      </div>
      {p.layers!.map((l) => {
        const strokes = (p.strokes ?? []).filter((s) => s.layerId === l.id).length;
        return (
          <div
            key={l.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${
              l.visible ? "border-accent/30 bg-accent/5" : "border-border opacity-70"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleLayer(l.id, { visible: !l.visible })}
              className={`flex size-9 items-center justify-center rounded-md ${
                l.visible ? "text-accent" : "text-muted"
              }`}
              aria-label={l.visible ? "Masquer" : "Afficher"}
            >
              {l.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.name}</p>
              <p className="font-mono text-[10px] text-subtle tabular">{strokes} traits</p>
            </div>
            <button
              type="button"
              onClick={() => toggleLayer(l.id, { locked: !l.locked })}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] tracking-wide uppercase ${
                l.locked ? "bg-elevated text-muted" : "text-muted"
              }`}
            >
              {l.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
              {l.locked ? "Verrou" : "Libre"}
            </button>
          </div>
        );
      })}
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
