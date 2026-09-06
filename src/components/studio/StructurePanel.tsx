import { analyzeStructure, markLoadBearing } from "@/lib/bim/structure";
import { mergeDetectedRooms } from "@/lib/bim/rooms";
import { healWallEnds } from "@/lib/cad/ops";
import { formatMeters } from "@/lib/utils";
import { useStudio } from "@/lib/store/project-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SYSTEM: Record<string, string> = {
  murs: "Murs porteurs",
  poteaux: "Poteaux-poutres",
  mixte: "Mixte murs + poteaux",
};

export function StructurePanel() {
  const project = useStudio((s) => s.projects.find((p) => p.id === s.currentId) ?? null);
  const show = useStudio((s) => s.showStructure);
  const setShow = useStudio((s) => s.setShowStructure);
  const select = useStudio((s) => s.select);
  const setView = useStudio((s) => s.setView);
  const commit = useStudio((s) => s.commit);
  const storyId = useStudio((s) => s.storyId);
  if (!project) return <p className="text-sm text-muted">Aucun projet ouvert.</p>;
  const r = analyzeStructure(project);

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => {
          const next = !show;
          setShow(next);
          if (next) setView("3d");
        }}
        className={`flex h-12 items-center justify-between rounded-xl px-4 text-sm ${
          show ? "bg-primary text-primary-fg" : "bg-elevated"
        }`}
      >
        Isoler la structure
        <span className="font-mono text-xs tabular">{show ? "on" : "off"}</span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Kpi k="Système" v={SYSTEM[r.system] ?? r.system} />
        <Kpi k="Indice" v={`${r.score}/100`} />
        <Kpi k="Porteurs" v={`${r.bearingMl.toFixed(0)} ml`} />
        <Kpi k="Cloisons" v={`${r.partitionMl.toFixed(0)} ml`} />
        <Kpi k="Poteaux" v={`${r.columns}`} />
        <Kpi k="Planchers" v={`${r.slabM2.toFixed(0)} m²`} />
        <Kpi k="Portée max" v={formatMeters(r.maxSpan)} />
        <Kpi k="Charge max" v={`${r.maxLineLoad.toFixed(0)} kN/ml`} />
      </div>


      <div className="flex flex-col gap-2">
        <Button
          variant="accent"
          onClick={() => {
            const sid = storyId ?? project.stories[0]?.id;
            if (!sid) return;
            commit((p) => {
              p.rooms = mergeDetectedRooms(p, sid);
              return p;
            });
            toast.success("Pièces détectées sur le niveau actif");
          }}
        >
          Détecter pièces
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const sid = storyId ?? project.stories[0]?.id;
            if (!sid) return;
            commit((p) => healWallEnds(p, sid));
            toast.success("Jonctions de murs soignées");
          }}
        >
          Soigner jonctions
        </Button>
      </div>

      <Button
        variant="outline"
        onClick={() => commit((p) => markLoadBearing(p))}
      >
        Déduire les porteurs (e ≥ 20 cm)
      </Button>

      {r.issues.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Points de vigilance</p>
          {r.issues.map((iss, i) => (
            <button
              key={`${iss.text}-${i}`}
              type="button"
              onClick={() => {
                if (iss.id) select([iss.id]);
              }}
              className="rounded-lg border border-border px-3 py-2.5 text-left text-sm"
            >
              <span
                className={`mr-2 text-[10px] tracking-wide uppercase ${
                  iss.level === "crit" ? "text-danger" : iss.level === "warn" ? "text-accent" : "text-muted"
                }`}
              >
                {iss.level === "crit" ? "Critique" : iss.level === "warn" ? "À vérifier" : "Note"}
              </span>{" "}
              {iss.text}
            </button>
          ))}
        </section>
      )}

      {r.issues.length === 0 && (
        <p className="text-sm text-muted">Chemin de descente des charges cohérent sur ce modèle.</p>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Murs porteurs</p>
        {r.walls.length === 0 ? (
          <p className="text-sm text-muted">Aucun mur porteur. Lancez la déduction ou marquez-les dans Ouvrages.</p>
        ) : (
          r.walls.slice(0, 16).map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => select([w.id])}
              className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2 text-left"
            >
              <span className="text-sm">
                {w.story} · {formatMeters(w.length)} · {Math.round(w.thickness * 100)} cm
              </span>
              <span className="font-mono text-[11px] text-subtle tabular">
                libre {w.unbraced.toFixed(1)} m · L/e {w.slenderness.toFixed(0)} · baies{" "}
                {Math.round(w.openingRatio * 100)} % · {w.lineLoad.toFixed(0)} kN/ml
              </span>
            </button>
          ))
        )}
      </section>
    </div>
  );
}

function Kpi({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-elevated px-3 py-2.5">
      <p className="text-[10px] tracking-wide text-muted uppercase">{k}</p>
      <p className="mt-1 font-mono text-sm tabular">{v}</p>
    </div>
  );
}
