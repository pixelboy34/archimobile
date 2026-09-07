import { Download, Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { canShowInstallBanner, INSTALL_KEY } from "@/lib/nav/overlays";
import { useFormaPwa } from "@/lib/pwa/use-pwa";

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallBanner({
  compact = false,
  blocked = false,
  discreet = false,
}: {
  compact?: boolean;
  /** Parent says another overlay is active — hide. */
  blocked?: boolean;
  /** Compact chip-style install affordance (no auto banner). */
  discreet?: boolean;
}) {
  const { deferred, clearDeferred, standalone, state } = useFormaPwa();
  const [show, setShow] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (standalone) return;
    setIos(isIos());
    if (discreet) return;
    let id = 0;
    const tryShow = () => {
      if (!canShowInstallBanner()) return;
      setShow(true);
      if (id) window.clearInterval(id);
    };
    id = window.setInterval(tryShow, 800);
    const boot = window.setTimeout(tryShow, 1400);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(boot);
    };
  }, [standalone, discreet]);

  const dismiss = () => {
    window.localStorage.setItem(INSTALL_KEY, "1");
    setShow(false);
    setSheet(false);
  };

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      clearDeferred();
      dismiss();
      return;
    }
    if (ios) {
      window.location.assign("/?install=1&platform=ios");
      return;
    }
    setSheet(true);
  };

  if (blocked || standalone) return null;

  if (discreet) {
    if (state !== "installable" && !ios) return null;
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-accent/35 bg-surface/90 px-3 text-[11px] font-medium text-accent shadow-border backdrop-blur-md"
      >
        <Download className="size-3.5" />
        Installer
      </button>
    );
  }

  if (!show && !sheet) return null;

  return (
    <>
      {show && (
        <div
          className={`pointer-events-auto z-30 flex items-center gap-3 border border-border bg-surface/95 px-3 py-2.5 shadow-border backdrop-blur-md ${
            compact
              ? "absolute right-3 bottom-[5.5rem] left-3 rounded-xl"
              : "fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-4 rounded-2xl"
          }`}
        >
          <Smartphone className="size-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {ios ? "Installer sur l’iPhone" : deferred ? "Installer FORMA" : "Ajouter à l’écran d’accueil"}
            </p>
            <p className="text-[11px] text-muted">
              {ios
                ? "Plein écran, comme une app native"
                : deferred
                  ? "Android / Chrome — installation en un tap"
                  : "Safari → Partager → Écran d’accueil"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void install()}
            className="h-10 shrink-0 rounded-full bg-primary px-3 text-xs font-medium text-primary-fg"
          >
            Installer
          </button>
          <button type="button" aria-label="Fermer" onClick={dismiss} className="flex size-10 items-center justify-center text-muted">
            <X className="size-4" />
          </button>
        </div>
      )}
      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end bg-bg/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="w-full rounded-2xl border border-border bg-surface p-5">
            <p className="font-display text-lg font-semibold">FORMA sur l’écran d’accueil</p>
            <ol className="mt-3 flex list-decimal flex-col gap-2 pl-4 text-sm text-muted">
              <li className="flex items-start gap-2">
                <Share className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>Touchez le bouton Partager de Safari (carré avec flèche).</span>
              </li>
              <li>Choisissez « Ajouter à l’écran d’accueil ».</li>
              <li>Validez — FORMA s’ouvre ensuite hors Safari, en plein écran.</li>
            </ol>
            <a
              href="/?install=1&platform=ios"
              className="mt-3 block text-center text-xs text-accent underline-offset-2 hover:underline"
            >
              Voir le tutoriel illustré
            </a>
            <p className="mt-3 text-xs text-subtle">
              L’app reste disponible hors ligne pour vos maquettes enregistrées.
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-fg"
            >
              {ios ? "Compris" : "Fermer"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
