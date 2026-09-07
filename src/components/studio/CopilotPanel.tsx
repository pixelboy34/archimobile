import { useEffect, useMemo, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  askArchitect,
  chatCopilot,
  copilotStatus,
  generateBuilding,
} from "@/lib/ai/copilot";
import {
  AGENT_CHIPS,
  parseAgentIntent,
  projectHasWalls,
  type AgentId,
  type AgentOpts,
} from "@/lib/ai/agents";
import { fallbackDraftFromPrompt, projectFromAiDraft } from "@/lib/bim/seed";
import { analyzeProject } from "@/lib/bim/analysis";
import type { Project } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PRESETS = [
  "Maison 120 m², 3 chambres, séjour sud, cuisine ouverte, toit plat.",
  "Villa 2 niveaux, 4 chambres, piscine, grandes baies mer.",
  "Loft 90 m² verrière nord, atelier + logement.",
  "Maison patio 140 m² de plain-pied, Aix-en-Provence.",
];

function compactProjectSummary(project: Project | null): string {
  if (!project) return "Aucun projet ouvert.";
  const a = analyzeProject(project);
  const cesCap = project.meta.ces ?? 0;
  const cosCap = project.meta.cos ?? 0;
  return [
    `${project.name} — ${project.meta.location}`,
    project.meta.brief?.slice(0, 160) ?? "",
    `Étages ${project.stories.length} · murs ${project.walls.length} · pièces ${project.rooms.length}`,
    `SDP ~${a.netArea.toFixed(0)} m² · emprise ~${a.footprint.toFixed(0)} m²`,
    `CES ${(a.cesActual * 100).toFixed(0)} %${cesCap ? ` / ${(cesCap * 100).toFixed(0)} %` : ""} · COS ${a.cosActual.toFixed(2)}${cosCap ? ` / ${cosCap.toFixed(2)}` : ""}`,
    `Pièces: ${a.rooms
      .slice(0, 12)
      .map((r) => `${r.name} ${r.area.toFixed(0)}m²`)
      .join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function CopilotPanel({ onApplied }: { onApplied?: () => void }) {
  const addProject = useStudio((s) => s.addProject);
  const current = useStudio((s) => s.current());
  const storyId = useStudio((s) => s.storyId);
  const runAgent = useStudio((s) => s.runAgent);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await copilotStatus();
        if (!cancelled) setLive(Boolean(st.available));
      } catch {
        // fallback HTTP status probe
        try {
          const res = await fetch("/api/copilot");
          const json = (await res.json()) as { available?: boolean };
          if (!cancelled) setLive(Boolean(json.available));
        } catch {
          if (!cancelled) setLive(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasWalls = useMemo(
    () => projectHasWalls(current, storyId),
    [current, storyId],
  );
  const hasSurvey = useMemo(() => {
    if (!current || !storyId) return false;
    const n = (current.survey ?? []).filter((s) => s.storyId === storyId).length;
    const strokes = (current.strokes ?? []).some(
      (s) => s.storyId === storyId && (s.points?.length ?? 0) >= 2,
    );
    return n >= 3 || strokes;
  }, [current, storyId]);

  const summary = useMemo(() => compactProjectSummary(current), [current]);

  const executeAgent = (id: AgentId, opts?: AgentOpts) => {
    if (!current) {
      toast.error("Ouvrez un projet d’abord");
      return;
    }
    const chip = AGENT_CHIPS.find((c) => c.id === id);
    if (chip?.needsWalls && !hasWalls) {
      toast.error("Cet agent nécessite des murs sur l’étage actif");
      return;
    }
    if (chip?.needsSurvey && !hasSurvey) {
      toast.error("Relevé insuffisant — ≥3 points ou traits");
      return;
    }
    setBusy(true);
    setAnswer(null);
    try {
      const report = runAgent(id, { ...opts, storyId });
      if (!report) {
        toast.error("Agent impossible");
        return;
      }
      setAnswer(report.summary);
      toast.success(report.summary);
      onApplied?.();
    } catch {
      toast.error("Échec de l’agent");
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const res = await Promise.race([
        generateBuilding({ data: { prompt: text, summary } }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 16000),
        ),
      ]);
      if (!res.ok) {
        toast.error("Génération impossible");
        return;
      }
      if (res.source === "local") {
        toast.message(res.note || "Massing local (sans XAI_API_KEY)");
      }
      const project = projectFromAiDraft(res.draft);
      project.meta.brief = text;
      addProject(project);
      setAnswer(
        res.note
          ? `${res.note} Massing « ${project.name} » prêt.`
          : `Modèle « ${project.name} » généré (Grok live). Ouvrez le 3D pour l'inspecter.`,
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
      const res = await askArchitect({ data: { question: text, context: summary } });
      if (!res.ok) {
        setAnswer(res.error);
        toast.message(res.error);
      } else setAnswer(res.text);
    } finally {
      setBusy(false);
    }
  };

  const chatLive = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const res = await chatCopilot({ data: { prompt: text, summary } });
      if (!res.ok) {
        setAnswer(res.error);
        toast.message(res.error);
        return;
      }
      setAnswer(res.text);
    } catch {
      toast.message("Copilote indisponible — agents locaux");
    } finally {
      setBusy(false);
    }
  };

  const submitPrompt = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    const intent = parseAgentIntent(text);
    if (intent.kind === "agent") {
      if (!current) {
        toast.error("Ouvrez un projet pour lancer un agent");
        return;
      }
      executeAgent(intent.id, intent.opts);
      return;
    }
    if (intent.kind === "analyze") {
      if (live) await chatLive();
      else await ask();
      return;
    }
    // generate or unknown
    if (live && current && intent.kind !== "generate") {
      await chatLive();
      return;
    }
    await generate();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-display text-sm font-semibold text-fg">Agents</p>
          {live === true && <Badge variant="accent">Grok live</Badge>}
          {live === false && <Badge variant="default">Hors ligne</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          Un tap — mutation locale du projet ouvert (hors ligne). L’IA reste optionnelle.
        </p>
        {live === false && (
          <p className="mt-1 text-[11px] text-muted">
            Définir <span className="font-mono text-fg">XAI_API_KEY</span> pour activer Grok
            live.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {AGENT_CHIPS.map((chip) => {
            const disabled =
              busy ||
              !current ||
              (chip.needsWalls && !hasWalls) ||
              (!!chip.needsSurvey && !hasSurvey);
            return (
              <button
                key={chip.id + chip.label}
                type="button"
                disabled={disabled}
                onClick={() => executeAgent(chip.id, chip.opts)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  disabled
                    ? "cursor-not-allowed border-border/60 bg-elevated/40 text-muted/60"
                    : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 hover:text-fg",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-sm text-muted">
        Phrase libre : l’agent correspondant mute le projet courant ; sinon génération / analyse.
      </p>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ex. relevé → murs · baies 1,35 m · attique · pack T2…"
        rows={3}
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
        <Button className="flex-1" onClick={submitPrompt} disabled={busy || !prompt.trim()}>
          <Wand2 className="size-4" />
          {busy ? "Exécution…" : "Lancer"}
        </Button>
        <Button
          variant="outline"
          onClick={generate}
          disabled={busy || !prompt.trim()}
          title="Toujours générer un nouveau massing"
        >
          <Sparkles className="size-4" />
          Générer
        </Button>
        <Button
          variant="outline"
          onClick={() => (live ? void chatLive() : void ask())}
          disabled={busy || !prompt.trim() || (!current && !live)}
        >
          Analyser
        </Button>
      </div>
      {answer && (
        <div className="rounded-lg border border-accent/25 bg-accent/10 p-3 text-sm leading-relaxed text-fg">
          {answer}
        </div>
      )}
    </div>
  );
}
