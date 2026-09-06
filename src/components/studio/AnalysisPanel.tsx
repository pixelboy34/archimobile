import { analyzeProject } from "@/lib/bim/analysis";
import { assessFeasibility, VERDICT_LABELS } from "@/lib/bim/feasibility";
import { ROOM_LABELS } from "@/lib/bim/types";
import { formatArea, formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import {
  LIGHT_PRESETS,
  MONTH_LABELS,
  type InteriorMode,
} from "@/lib/render/lighting";

export function AnalysisPanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const lighting = useStudio((s) => s.lighting);
  const setLighting = useStudio((s) => s.setLighting);
  const clipY = useStudio((s) => s.clipY);
  const setClipY = useStudio((s) => s.setClipY);
  const setView = useStudio((s) => s.setView);
  if (!project) return <p className="text-sm text-muted">Aucun projet ouvert.</p>;
  const a = analyzeProject(project);
  const feas = assessFeasibility(project, lighting, a);
  const hour = lighting.sunHour;

  return (
    <div className="flex flex-col gap-5">
      <section className="panel-card flex flex-col gap-2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Faisabilité</p>
          <span className="text-[11px] font-semibold text-accent">{VERDICT_LABELS[feas.verdict]} · {feas.score}</span>
        </div>
        <p className="font-mono text-[11px] text-muted tabular">
          CES {(feas.gauges.ces.actual * 100).toFixed(0)} %{feas.gauges.ces.cap > 0 ? ` / ${(feas.gauges.ces.cap * 100).toFixed(0)} %` : ""}
          {" · "}
          COS {feas.gauges.cos.actual.toFixed(2)}{feas.gauges.cos.cap > 0 ? ` / ${feas.gauges.cos.cap.toFixed(2)}` : ""}
        </p>
        <p className="text-[11px] text-subtle">{feas.solarHint}</p>
      </section>
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Ambiances</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {LIGHT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setLighting(p.patch)}
              className="h-11 shrink-0 rounded-full bg-elevated px-3.5 text-xs font-medium"
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3" onPointerDown={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Soleil</p>
        <Range
          label="Heure"
          value={hour}
          min={5}
          max={22}
          step={0.25}
          display={`${String(Math.floor(hour)).padStart(2, "0")}h${hour % 1 >= 0.5 ? "30" : hour % 1 >= 0.25 ? "15" : "00"}`}
          onChange={(v) => setLighting({ sunHour: v })}
        />
        <Range
          label="Saison"
          value={lighting.month}
          min={1}
          max={12}
          step={1}
          display={MONTH_LABELS[Math.min(11, Math.max(0, Math.round(lighting.month) - 1))]}
          onChange={(v) => setLighting({ month: Math.round(v) })}
        />
        <Range
          label="Intensité soleil"
          value={lighting.sunIntensity}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => setLighting({ sunIntensity: v })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Ombres</p>
        <Toggle label="Ombres portées" on={lighting.shadows} onChange={(v) => setLighting({ shadows: v })} />
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Range
            label="Douceur"
            value={lighting.shadowSoftness}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setLighting({ shadowSoftness: v })}
          />
        </div>
        <p className="text-xs text-subtle">Dure, PCF ou douce. Désactivez les ombres sur un téléphone lent.</p>
      </section>

      <section className="flex flex-col gap-3" onPointerDown={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Ambiance</p>
        <Range
          label="Ciel (hémisphère)"
          value={lighting.hemi}
          min={0}
          max={1.2}
          step={0.05}
          onChange={(v) => setLighting({ hemi: v })}
        />
        <Range
          label="Lumière d'ambiance"
          value={lighting.ambient}
          min={0}
          max={0.8}
          step={0.02}
          onChange={(v) => setLighting({ ambient: v })}
        />
        <Range
          label="Fill opposé"
          value={lighting.fill}
          min={0}
          max={0.8}
          step={0.02}
          onChange={(v) => setLighting({ fill: v })}
        />
        <Range
          label="Exposition"
          value={lighting.exposure}
          min={0.5}
          max={1.8}
          step={0.05}
          onChange={(v) => setLighting({ exposure: v })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Intérieur</p>
        <div className="flex gap-1.5">
          {(["auto", "on", "off"] as InteriorMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setLighting({ interior: m })}
              className={`h-11 flex-1 rounded-full text-xs font-medium ${
                lighting.interior === m ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
              }`}
            >
              {m === "auto" ? "Auto" : m === "on" ? "Allumé" : "Éteint"}
            </button>
          ))}
        </div>
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Range
            label="Puissance plafonniers"
            value={lighting.interiorGain}
            min={0.15}
            max={2}
            step={0.05}
            onChange={(v) => setLighting({ interiorGain: v })}
          />
        </div>
        <p className="text-xs text-subtle">Auto allume les pièces après 19 h 30 et avant 7 h.</p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Surface nette" value={formatArea(a.netArea)} />
        <Stat label="Extérieur" value={formatArea(a.outdoorArea)} />
        <Stat label="Murs" value={formatMeters(a.wallLength, 1)} />
        <Stat label="Vitrages" value={formatArea(a.windowArea)} />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Scores</p>
        <Bar label="Lumière naturelle" value={a.daylightScore} />
        <Bar label="Compacité / énergie" value={a.energyScore} />
      </div>
      <div onPointerDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Plan de coupe</p>
          <span className="font-mono text-xs tabular">{Math.round(clipY * 100)} %</span>
        </div>
        <input
          type="range"
          min={0.15}
          max={1}
          step={0.02}
          value={clipY}
          aria-label="Hauteur de coupe"
          onChange={(e) => {
            setClipY(Number(e.target.value));
            setView("coupe");
          }}
          className="h-11 w-full cursor-pointer accent-accent"
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Pièces</p>
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
          <li key={n} className="rounded-md bg-elevated px-3 py-2 text-sm text-muted">
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between">
        <span className="text-xs tracking-wide text-muted uppercase">{label}</span>
        <span className="font-mono text-sm tabular">
          {display ?? value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-accent"
      />
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex h-11 items-center justify-between rounded-lg bg-elevated px-3 text-sm"
    >
      <span>{label}</span>
      <span className={`flex h-6 w-11 items-center rounded-full px-0.5 ${on ? "bg-accent" : "bg-border"}`}>
        <span className={`size-5 rounded-full bg-primary transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-elevated px-3 py-3">
      <p className="text-[11px] tracking-wide text-subtle uppercase">{label}</p>
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