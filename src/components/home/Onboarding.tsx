import { Box, Smartphone, Sparkles } from "lucide-react";
import { useState } from "react";
import { useStudio } from "@/lib/store/project-store";

const KEY = "forma-onboarded";

export function shouldOnboard() {
  if (typeof window === "undefined") return false;
  return !window.localStorage.getItem(KEY);
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const setSkill = useStudio((s) => s.setSkill);
  const [step, setStep] = useState(0);

  const finish = (skill: "simple" | "pro") => {
    setSkill(skill);
    window.localStorage.setItem(KEY, "1");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-bg/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5">
        {step === 0 && (
          <>
            <p className="text-[11px] tracking-[0.2em] text-muted uppercase">Bienvenue</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">FORMA</h2>
            <p className="mt-2 text-sm text-muted">
              Studio BIM dans la poche. Le plan, le 3D et le métré sont le même modèle.
            </p>
            <button
              type="button"
              className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-fg"
              onClick={() => setStep(1)}
            >
              Continuer
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <h2 className="font-display text-xl font-semibold">Comment voulez-vous travailler ?</h2>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => finish("simple")}
                className="rounded-xl border border-border bg-elevated p-4 text-left"
              >
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="size-4 text-accent" /> Amateur
                </p>
                <p className="mt-1 text-xs text-muted">
                  3D guidée, murs et objets, IA pour générer. Moins de boutons.
                </p>
              </button>
              <button
                type="button"
                onClick={() => finish("pro")}
                className="rounded-xl border border-border bg-elevated p-4 text-left"
              >
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Box className="size-4 text-accent" /> Expert
                </p>
                <p className="mt-1 text-xs text-muted">
                  Esquisse, relevé, structure, 4D, calques et paramètres d’ouvrage.
                </p>
              </button>
            </div>
          </>
        )}
        {step === 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-subtle">
            <Smartphone className="size-3.5" /> Installable sur iPhone comme une app
          </p>
        )}
      </div>
    </div>
  );
}
