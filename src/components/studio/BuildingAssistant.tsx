import { useState } from "react";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { massingFootprintHint } from "@/lib/cad/massing";
import { useStudio } from "@/lib/store/project-store";
import { MassingLaunch } from "./MassingLaunch";

/** Focused A→Z massing entry — étages, HSP, emprise, façade, toiture, Générer. */
export function BuildingAssistant({
  onDone,
  onPropagate,
}: {
  onDone?: () => void;
  onPropagate?: () => void;
}) {
  const beginEdit = useStudio((s) => s.beginEdit);
  const addMassing = useStudio((s) => s.addMassing);
  const createBlank = useStudio((s) => s.createBlank);
  const propagateTypical = useStudio((s) => s.propagateTypical);
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const multi = (project?.stories.length ?? 0) > 1;

  const [spanW, setSpanW] = useState(18);
  const [spanD, setSpanD] = useState(16);
  const [floors, setFloors] = useState(8);
  const [hsp, setHsp] = useState(2.8);
  const [groundH, setGroundH] = useState(3.2);
  const [winSpacing, setWinSpacing] = useState(3.0);
  const [roofKind, setRoofKind] = useState<"flat" | "shed" | "gable">("flat");

  const rLabel = massingFootprintHint({ width: spanW, depth: spanD, floors });
  const tall =
    floors <= 1 ? groundH : groundH + Math.max(0, floors - 1) * hsp;

  const opts = () => ({
    width: spanW,
    depth: spanD,
    floors,
    floorHeight: hsp,
    groundHeight: groundH,
    windowSpacing: winSpacing,
    roofKind,
    columns: floors >= 4,
    balconyDepth: floors >= 4 ? 1.4 : 0,
  });

  const run = () => {
    addMassing(opts());
    toast.success(`${rLabel} généré · ${tall.toFixed(1)} m`);
    onDone?.();
  };

  const runFresh = () => {
    // createBlank bascule `currentId` de facon synchrone : le addMassing qui
    // suit s'applique donc bien au projet neuf, pas a la maquette d'origine.
    createBlank(rLabel);
    addMassing(opts());
    toast.success(`${rLabel} généré dans un projet neuf`);
    onDone?.();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Building2 className="size-5" />
        </div>
        <div>
          <p className="font-display text-base font-semibold">Assistant Bâtiment</p>
          <p className="mt-0.5 text-xs text-muted">
            Volume A→Z — façades, poteaux, toiture. Jusqu’à R+80.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {(
          [
            { id: "maison", label: "Maison", w: 12, d: 9, f: 1, roof: "gable" as const, col: false, bal: 0 },
            { id: "villa", label: "Villa", w: 16, d: 12, f: 2, roof: "gable" as const, col: false, bal: 0 },
            { id: "immeuble", label: "Immeuble", w: 18, d: 16, f: 8, roof: "flat" as const, col: true, bal: 1.4 },
          ] as const
        ).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setSpanW(c.w);
              setSpanD(c.d);
              setFloors(c.f);
              setRoofKind(c.roof);
            }}
            className={`h-11 rounded-lg text-[12px] font-medium ${
              spanW === c.w && floors === c.f ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-elevated text-fg/80"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <Field label="Étages" value={floors} unit="" digits={0} min={1} max={80} step={1} onBegin={beginEdit} onChange={setFloors} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="HSP RDC" value={groundH} min={2.4} max={6} step={0.05} onBegin={beginEdit} onChange={setGroundH} />
        <Field label="HSP courant" value={hsp} min={2.4} max={5} step={0.05} onBegin={beginEdit} onChange={setHsp} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Emprise L" value={spanW} min={8} max={60} step={0.5} onBegin={beginEdit} onChange={setSpanW} />
        <Field label="Emprise P" value={spanD} min={8} max={50} step={0.5} onBegin={beginEdit} onChange={setSpanD} />
      </div>
      <Field
        label="Module façade"
        value={winSpacing}
        min={1.6}
        max={6}
        step={0.1}
        onBegin={beginEdit}
        onChange={setWinSpacing}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] tracking-wide text-muted uppercase">Toiture</span>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              ["flat", "Plate"],
              ["shed", "1 pente"],
              ["gable", "2 pentes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRoofKind(id)}
              className={`h-11 text-[11px] font-medium ${
                roofKind === id ? "bg-accent text-accent-fg" : "bg-elevated text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5">
        <p className="font-mono text-sm font-semibold text-accent">
          {rLabel} · {tall.toFixed(1)} m
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          {floors} × HSP (RDC {groundH.toFixed(2)} m
          {floors > 1 ? ` · courant ${hsp.toFixed(2)} m` : ""}) · {spanW.toFixed(1)} × {spanD.toFixed(1)} m
        </p>
      </div>

      <MassingLaunch
        project={project}
        label={`Générer · ${rLabel} (${tall.toFixed(1)} m)`}
        hint={`${floors} niveau${floors > 1 ? "x" : ""} · emprise ${spanW.toFixed(0)}×${spanD.toFixed(0)} m`}
        onRun={run}
        onRunFresh={runFresh}
      />

      <button
        type="button"
        className="text-left text-xs text-accent underline-offset-2 hover:underline"
        onClick={() => {
          if (!multi) {
            toast.message("Générez d’abord un immeuble multi-étages");
            onPropagate?.();
            return;
          }
          propagateTypical();
          toast.success("Étage type propagé");
          onPropagate?.();
          onDone?.();
        }}
      >
        Propager étage type →
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  min,
  max,
  step,
  unit = "m",
  digits = 2,
  onBegin,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  digits?: number;
  onBegin: () => void;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] tracking-wide text-muted uppercase">{label}</span>
        <span className="font-mono text-xs tabular text-accent">
          {digits === 0 ? Math.round(value) : value.toFixed(digits)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onBegin}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
  );
}
