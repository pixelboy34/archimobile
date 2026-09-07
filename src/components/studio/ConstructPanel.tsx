import { Download, Pause, Play, Printer, Share2, PackageCheck, Table2 } from "lucide-react";
import { toast } from "sonner";
import { BUILD_PHASES, PHASE_DONE } from "@/lib/bim/construction";
import {
  computeQuantities,
  downloadText,
  exportBimJson,
  exportQuantitiesCsv,
  formatEuro,
  shareProject,
} from "@/lib/bim/quantities";
import { deliverDossier } from "@/lib/bim/dossier";
import { exportDxf } from "@/lib/cad/dxf";
import { exportIfc } from "@/lib/cad/ifc";
import { formatArea, formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";

export function ConstructPanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const phase = useStudio((s) => s.buildPhase);
  const playing = useStudio((s) => s.playing);
  const setBuildPhase = useStudio((s) => s.setBuildPhase);
  const setPlaying = useStudio((s) => s.setPlaying);
  if (!project) return null;
  const bill = computeQuantities(project);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Chantier 4D</p>
        <p className="text-sm text-muted">
          Faites défiler les phases — le modèle se construit réellement, dans l’ordre du chantier.
        </p>
        <div className="flex gap-2">
          <Button
            variant={playing ? "outline" : "accent"}
            className="flex-1"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                if (phase >= PHASE_DONE) setBuildPhase(0);
                setPlaying(true);
              }
            }}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing ? "Pause" : "Construire"}
          </Button>
          <Button variant="outline" onClick={() => setBuildPhase(PHASE_DONE)}>
            Livré
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BUILD_PHASES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setBuildPhase(p.id)}
              className={`h-10 rounded-full px-3 text-xs font-medium ${
                phase === p.id ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={PHASE_DONE}
          step={1}
          value={phase}
          aria-label="Phase de construction"
          onChange={(e) => setBuildPhase(Number(e.target.value))}
          className="h-11 w-full cursor-pointer accent-accent"
        />
      </section>

      <section>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Métré réel</p>
        <ul className="divide-y divide-border">
          {bill.lines.map((l) => (
            <li key={l.key} className="flex items-baseline justify-between py-2 text-sm">
              <span>
                {l.label}
                <span className="ml-2 font-mono text-xs text-subtle tabular">
                  {l.qty.toLocaleString("fr-FR")} {l.unit}
                </span>
              </span>
              <span className="font-mono text-xs tabular">{formatEuro(l.total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between rounded-lg bg-elevated px-3 py-3">
          <span className="text-sm">Total HT</span>
          <span className="font-display text-xl font-semibold tabular">{formatEuro(bill.totalHT)}</span>
        </div>
        <p className="mt-2 text-xs text-subtle">
          Murs {formatArea(bill.wallM2)} · Dalles {formatArea(bill.slabM2)} · Verre{" "}
          {formatArea(bill.glassM2)} · Béton {formatMeters(bill.concreteM3, 1)}³
        </p>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => window.dispatchEvent(new CustomEvent("forma-open-nomen"))}
        >
          <Table2 className="size-4" />
          Nomenclatures (portes, fenêtres, pièces…)
        </Button>
      </section>

      <div className="flex flex-col gap-2">
        <Button
          variant="accent"
          className="h-12"
          onClick={() => {
            const r = deliverDossier(project);
            toast.success(`Dossier · ${r.planCount} plans · IFC+DXF+CSV`);
          }}
        >
          <PackageCheck className="size-4" />
          Livrer le dossier
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadText(
              `${project.name.replace(/\s+/g, "-").toLowerCase()}.forma.json`,
              exportBimJson(project),
            )
          }
        >
          <Download className="size-4" />
          Exporter le BIM JSON
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadText(
              `${project.name.replace(/\s+/g, "-").toLowerCase()}.dxf`,
              exportDxf(project),
              "application/dxf",
            )
          }
        >
          <Download className="size-4" />
          Exporter DXF (plan)
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadText(
              `${project.name.replace(/\s+/g, "-").toLowerCase()}-metre.csv`,
              exportQuantitiesCsv(project),
              "text/csv",
            )
          }
        >
          <Download className="size-4" />
          Métré CSV
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadText(
              `${project.name.replace(/\s+/g, "-").toLowerCase()}.ifc`,
              exportIfc(project),
              "application/x-step",
            )
          }
        >
          <Download className="size-4" />
          Exporter IFC (murs / dalles / baies)
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const r = deliverDossier(project);
            toast.message(`Dossier · ${r.planCount} plans · IFC+DXF+CSV`);
          }}
        >
          <Printer className="size-4" />
          Imprimer le dossier
        </Button>
        <Button variant="outline" onClick={() => void shareProject(project)}>
          <Share2 className="size-4" />
          Partager
        </Button>
      </div>
    </div>
  );
}
