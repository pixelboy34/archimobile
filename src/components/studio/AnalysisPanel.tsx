import { checkCoherence, resumeCoherence } from "@/lib/bim/coherence";
import { analyzeProject } from "@/lib/bim/analysis";
import { assessFeasibility, VERDICT_LABELS } from "@/lib/bim/feasibility";
import { ROOM_LABELS } from "@/lib/bim/types";
import { formatArea, formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";

/** KPIs & faisabilité only — lumière / soleil / ombres / coupe vivent dans l’onglet Vue. */
export function AnalysisPanel({ onOpenVue }: { onOpenVue?: () => void }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const lighting = useStudio((s) => s.lighting);
  const setTool = useStudio((s) => s.setTool);
  const setView = useStudio((s) => s.setView);
  const select = useStudio((s) => s.select);
  const setStory = useStudio((s) => s.setStory);
  if (!project) return <p className="text-sm text-muted">Aucun projet ouvert.</p>;

  // Sur un modèle sans rien de bâti, toutes les entrées du calcul valent zéro :
  // le panneau affichait quand même « À surveiller · 79 » avec CES 0 % et des
  // scores de 35 et 33 issus des seules valeurs par défaut. Un verdict sans
  // matière est un verdict inventé.
  if (project.walls.length === 0 && project.rooms.length === 0 && project.slabs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <section className="panel-card flex flex-col gap-2 p-3.5">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
            Rien à chiffrer
          </p>
          <p className="text-sm text-muted">
            Ce modèle ne contient ni mur, ni pièce, ni dalle. Sans emprise ni surface, le CES,
            le COS et les scores n’auraient aucune matière — ils ne sont pas affichés.
          </p>
        </section>
        <SheetClose asChild>
          <Button
            variant="accent"
            onClick={() => {
              setTool("wall");
              setView("plan");
            }}
          >
            Tracer un premier mur
          </Button>
        </SheetClose>
        <p className="text-xs text-subtle">
          La parcelle et les plafonds CES / COS se saisissent dans PARAMS → Site ; ils
          conditionnent la faisabilité.
        </p>
      </div>
    );
  }

  const a = analyzeProject(project);
  const feas = assessFeasibility(project, lighting, a);
  const coherence = checkCoherence(project);

  return (
    <div className="flex flex-col gap-5">
      {/* La cohérence passe avant la faisabilité : un CES juste sur un modèle
          faux ne vaut rien. Groupé par nature, sinon un R+40 afficherait
          quarante lignes pour un seul défaut de génération. */}
      <section className="panel-card flex flex-col gap-2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Cohérence</p>
          <span
            className={`text-[11px] font-semibold ${
              coherence.critiques > 0 ? "text-danger" : coherence.sain ? "text-ok" : "text-warn"
            }`}
          >
            {resumeCoherence(coherence)}
          </span>
        </div>
        {coherence.sain ? (
          <p className="text-[11px] text-subtle">
            Aucun ouvrage orphelin, aucune baie hors de son mur, aucun escalier qui manque son
            niveau.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {coherence.parNature.map((g) => (
              <div key={g.nature} className="flex flex-col gap-1">
                <p className="text-[11px] font-medium">
                  {g.titre}
                  <span className="ml-1.5 text-subtle">{g.defauts.length}</span>
                </p>
                {g.defauts.slice(0, 4).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      if (d.storyId) setStory(d.storyId);
                      select(d.cibles);
                    }}
                    className="min-h-11 rounded-lg bg-elevated/70 px-2.5 py-2 text-left text-[11px] leading-snug text-fg/85"
                  >
                    {d.message}
                  </button>
                ))}
                {g.defauts.length > 4 && (
                  <p className="text-[11px] text-subtle">
                    et {g.defauts.length - 4} autre{g.defauts.length - 4 > 1 ? "s" : ""} du même
                    type
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card flex flex-col gap-2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Faisabilité</p>
          <span className="text-[11px] font-semibold text-accent">
            {VERDICT_LABELS[feas.verdict]} · {feas.score}
          </span>
        </div>
        <p className="font-mono text-[11px] text-muted tabular">
          CES {(feas.gauges.ces.actual * 100).toFixed(0)} %
          {feas.gauges.ces.cap > 0 ? ` / ${(feas.gauges.ces.cap * 100).toFixed(0)} %` : ""}
          {" · "}
          COS {feas.gauges.cos.actual.toFixed(2)}
          {feas.gauges.cos.cap > 0 ? ` / ${feas.gauges.cos.cap.toFixed(2)}` : ""}
        </p>
        <p className="text-[11px] text-subtle">{feas.solarHint}</p>
        {onOpenVue && (
          <button
            type="button"
            onClick={onOpenVue}
            className="mt-1 flex h-11 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-xs font-medium tracking-wide text-accent uppercase"
          >
            Ouvrir Vue (lumière)
          </button>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Surface nette" value={formatArea(a.netArea)} />
        <Stat label="Extérieur" value={formatArea(a.outdoorArea)} />
        <Stat label="Murs" value={formatMeters(a.wallLength, 1)} />
        <Stat label="Vitrages" value={formatArea(a.windowArea)} />
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Scores</p>
        <Bar label="Lumière naturelle" value={a.daylightScore} />
        <Bar label="Compacité / énergie" value={a.energyScore} />
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
          Pièces
          {a.rooms.length > 0 && (
            <span className="ml-2 font-mono text-[11px] normal-case tabular">{a.rooms.length}</span>
          )}
        </p>
        {a.rooms.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune pièce : les surfaces restent à zéro tant que les murs ne délimitent pas de
            local. Lancez « Détecter pièces » depuis Structure.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {a.rooms.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {r.name}
                  <span className="ml-2 text-xs text-subtle">
                    {ROOM_LABELS[r.function]} · {r.story}
                  </span>
                </span>
                <span className="font-mono text-xs tabular">{formatArea(r.area)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {a.notes.map((n) => (
          <li key={n} className="rounded-xl bg-elevated px-3 py-2 text-sm text-muted">
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-elevated/90 px-3 py-3">
      <p className="text-[10px] tracking-[0.18em] text-subtle uppercase">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular">{value}</p>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono tabular">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
        <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
