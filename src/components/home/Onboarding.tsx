import { ArrowRight, Box, Home, Smartphone } from "lucide-react";
import { useState } from "react";
import { useStudio } from "@/lib/store/project-store";

const KEY = "forma-onboarded";

export function markOnboarded() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, "1");
}

export function shouldOnboard() {
  if (typeof window === "undefined") return false;
  return !window.localStorage.getItem(KEY);
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const skill = useStudio((s) => s.skill);
  const setSkillFn = useStudio((s) => s.setSkill);
  const [step, setStep] = useState(0);

  const finish = (next: "simple" | "pro") => {
    setSkillFn(next);
    markOnboarded();
    onDone();
  };

  const skip = () => finish(skill === "pro" ? "pro" : "simple");

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-bg/85 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center"
      onClick={skip}
      role="presentation"
    >
      <div
        className="panel-card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="onboard-title"
      >
        {step === 0 && (
          <div className="rise-in">
            <p className="hud-label">Studio BIM</p>
            <h2 id="onboard-title" className="mt-2 font-display text-3xl font-semibold tracking-tight">
              FORMA
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Le plan, le 3D et le métré sont le même modèle. Posez, mesurez, livrez.
            </p>
            <button
              type="button"
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-fg"
              onClick={() => setStep(1)}
            >
              Commencer
              <ArrowRight className="size-4" />
            </button>
            <button
              type="button"
              className="mt-2 flex h-11 w-full items-center justify-center text-sm text-muted"
              onClick={skip}
            >
              Passer
            </button>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <Smartphone className="size-3.5" /> Installable sur iPhone comme une app
            </p>
          </div>
        )}
        {step === 1 && (
          <div key="skill" className="rise-in">
            <h2 id="onboard-title" className="font-display text-xl font-semibold tracking-tight">
              Comment voulez-vous travailler ?
            </h2>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={() => finish("simple")} className="studio-tile">
                <span className="studio-tile-icon">
                  <Home className="size-4" />
                </span>
                <span>
                  <p className="text-sm font-medium">Amateur</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    3D guidée, murs et objets. Moins de boutons.
                  </p>
                </span>
              </button>
              <button type="button" onClick={() => finish("pro")} className="studio-tile">
                <span className="studio-tile-icon">
                  <Box className="size-4" />
                </span>
                <span>
                  <p className="text-sm font-medium">Expert</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    Esquisse, relevé, structure, 4D et paramètres d’ouvrage.
                  </p>
                </span>
              </button>
            </div>
            <button type="button" className="mt-3 h-11 w-full text-sm text-muted" onClick={skip}>
              Passer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
