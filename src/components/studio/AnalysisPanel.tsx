import { analyzeProject } from "@/lib/bim/analysis";
import { assessFeasibility, VERDICT_LABELS } from "@/lib/bim/feasibility";
import { ROOM_LABELS } from "@/lib/bim/types";
import { formatArea, formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";

/** KPIs & faisabilité only — lumière / soleil / ombres / coupe vivent dans l’onglet Vue. */
export function AnalysisPanel({ onOpenVue }: { onOpenVue?: () => void }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const lighting = useStudio((s) => s.lighting);
  if (!project) return <p className="text-sm text-muted">Aucun projet ouvert.</p>;
  const a = analyzeProject(project);
  const feas = assessFeasibility(project, lighting, a);

  return (
    <div className="flex flex-col gap-5">
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
            className="mt-1 flex h-10 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-xs font-medium tracking-wide text-accent uppercase"
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
        <p className="mb-2 text-[10px] font-medium tracking-[0.18em] text-muted uppercase">Pièces</p>
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
