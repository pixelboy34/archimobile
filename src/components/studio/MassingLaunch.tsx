import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { massingImpact, massingImpactLabel } from "@/lib/cad/massing";
import type { Project } from "@/lib/bim/types";

/**
 * Bouton de generation de volume, avec le garde-fou qui manquait.
 *
 * `generateMassing` ne se contente pas de vider le RDC : `stories.slice(0, 1)`
 * emporte tous les etages superieurs et `roofs = []` toutes les toitures. Un
 * appui remplacait donc la maquette entiere sans un mot — sur Villa Calanque,
 * 38 murs, 12 pieces et un niveau partaient en silence. C'est recuperable par
 * Annuler, encore faut-il savoir qu'il s'est passe quelque chose.
 *
 * Le remplacement est desormais arme en deux temps, et l'echappatoire demandee
 * par la dette produit — « ou alors un projet neuf » — est offerte au meme
 * endroit. Sur un projet vierge, rien ne change : un seul appui.
 */
export function MassingLaunch({
  project,
  label,
  hint,
  onRun,
  onRunFresh,
  className = "",
}: {
  project: Project | null;
  /** Ligne principale du bouton, p. ex. « Générer · R+7 (25,6 m) ». */
  label: ReactNode;
  /** Seconde ligne, plus discrete. */
  hint?: ReactNode;
  onRun: () => void;
  /** Genere dans un projet neuf, en laissant la maquette courante intacte. */
  onRunFresh: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const impact = project ? massingImpact(project) : null;
  const destructive = impact?.destructive ?? false;

  if (armed && impact) {
    return (
      <div
        className={`flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 ${className}`}
      >
        <p className="flex items-start gap-2 text-xs leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            Générer remplace la maquette entière :{" "}
            {massingImpactLabel(impact)}{" "}
            {impact.total + impact.stories > 1 ? "disparaissent" : "disparaît"}.
            <span className="block text-muted">Annuler rétablit tout.</span>
          </span>
        </p>
        <div className="flex flex-col gap-1.5">
          <Button
            variant="danger"
            className="h-11"
            onClick={() => {
              setArmed(false);
              onRun();
            }}
          >
            Remplacer la maquette
          </Button>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setArmed(false);
                onRunFresh();
              }}
            >
              Projet neuf
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => setArmed(false)}>
              Annuler
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="accent"
      onClick={() => (destructive ? setArmed(true) : onRun())}
      className={`h-12 flex-col gap-0.5 py-2 ${className}`}
    >
      <span className="text-sm font-semibold">{label}</span>
      {hint ? <span className="text-[10px] font-normal opacity-80">{hint}</span> : null}
    </Button>
  );
}
