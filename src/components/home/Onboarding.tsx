import { ArrowRight, Box, Home, Smartphone } from "lucide-react";
import { useState } from "react";
import { useStudio } from "@/lib/store/project-store";

const KEY = "forma-onboarded";

export function shouldOnboard() {
  if (typeof window === "undefined") return false;
  return !window.localStorage.getItem(KEY);
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const setSkillFn = useStudio((s) => s.setSkill);
  const [step, setStep] = useState(0);

  const finish = (skill: "simple" | "pro") => {
    setSkillFn(skill);
    window.localStorage.setItem(KEY, "1");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-bg/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center">
      <div className="panel-card w-full max-w-md p-5">
        {step === 0 && (
          <div className="rise-in">
            <p className="hud-label">Studio BIM</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">FORMA</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Le plan, le 3D et le métré sont le même modèle. Posez, mesurez, livrez.
            </p>
            <button
              type="button"
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-fg"
              onClick={() => setStep(1)}
            >
              Continuer
              <ArrowRight className="size-4" />
            </button>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <Smartphone className="ico-live size-3.5" /> Installable sur iPhone comme une app
            </p>
          </div>
        )}
        {step === 1 && (
          <div key="skill" className="rise-in">
            <h2 className="font-display text-xl font-semibold tracking-tight">Comment voulez-vous travailler ?</h2>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => finish("simple")}
                className="studio-tile"
              >
                <span className="studio-tile-icon">
                  <Home className="size-4" />
                </span>
                <span>
                  <p className="text-sm font-medium">Amateur</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    3D guidée, murs et objets, IA pour générer. Moins de boutons.
                  </p>
                </span>
              </button>
              <button
                type="button"
                onClick={() => finish("pro")}
                className="studio-tile"
              >
                <span className="studio-tile-icon">
                  <Box className="ico-live size-4" />
                </span>
                <span>
                  <p className="text-sm font-medium">Expert</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    Esquisse, relevé, structure, 4D, calques et paramètres d’ouvrage.
                  </p>
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
