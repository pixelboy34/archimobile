import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { askArchitect, generateBuilding } from "@/lib/ai/copilot";
import { fallbackDraftFromPrompt, projectFromAiDraft } from "@/lib/bim/seed";
import { analyzeProject } from "@/lib/bim/analysis";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const PRESETS = [
  "Maison 120 m², 3 chambres, séjour sud, cuisine ouverte, toit plat.",
  "Villa 2 niveaux, 4 chambres, piscine, grandes baies mer.",
  "Loft 90 m² verrière nord, atelier + logement.",
  "Maison patio 140 m² de plain-pied, Aix-en-Provence.",
];

export function CopilotPanel({ onApplied }: { onApplied?: () => void }) {
  const addProject = useStudio((s) => s.addProject);
  const current = useStudio((s) => s.current());
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  const generate = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const res = await Promise.race([
        generateBuilding({ data: { prompt: text } }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 16000),
        ),
      ]);
      if (!res.ok) {
        toast.error("Génération impossible");
        return;
      }
      const project = projectFromAiDraft(res.draft);
      project.meta.brief = text;
      addProject(project);
      setAnswer(
        res.note
          ? `${res.note} Massing « ${project.name} » prêt.`
          : `Modèle « ${project.name} » généré. Ouvrez le 3D pour l'inspecter.`,
      );
      toast.success(project.name);
      onApplied?.();
    } catch {
      const project = projectFromAiDraft(fallbackDraftFromPrompt(text));
      project.meta.brief = text;
      addProject(project);
      setAnswer(`Massing local « ${project.name} » appliqué.`);
      toast.success(project.name);
      onApplied?.();
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    const text = prompt.trim();
    if (!text || !current || busy) return;
    setBusy(true);
    try {
      const a = analyzeProject(current);
      const ctx = `${current.name} — ${current.meta.location}\n${current.meta.brief}\nSurface ${a.netArea.toFixed(0)} m², ${current.stories.length} niveau(x), ${current.rooms.length} pièces.\nPièces: ${a.rooms.map((r) => `${r.name} ${r.area.toFixed(0)}m²`).join(", ")}`;
      const res = await askArchitect({ data: { question: text, context: ctx } });
      if (!res.ok) setAnswer(res.error);
      else setAnswer(res.text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Décrivez un programme : l'IA assemble un massing BIM éditable, ou commente le projet ouvert.
      </p>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ex. maison 4 chambres, séjour sud, 160 m², toit terrasse…"
        rows={4}
      />
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPrompt(p)}
            className="rounded-full border border-border bg-elevated px-3 py-1.5 text-left text-xs text-muted hover:text-fg"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={generate} disabled={busy || !prompt.trim()}>
          <Sparkles className="size-4" />
          {busy ? "Génération…" : "Générer le massing"}
        </Button>
        <Button variant="outline" onClick={ask} disabled={busy || !current || !prompt.trim()}>
          Analyser
        </Button>
      </div>
      {answer && (
        <div className="rounded-lg bg-elevated p-3 text-sm leading-relaxed text-fg">{answer}</div>
      )}
    </div>
  );
}
