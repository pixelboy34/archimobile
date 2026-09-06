import { Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { canShowInstallBanner, INSTALL_KEY } from "@/lib/nav/overlays";

function isStandalone() {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallBanner({
  compact = false,
  blocked = false,
}: {
  compact?: boolean;
  /** Parent says another overlay is active — hide. */
  blocked?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    setIos(isIos());
    let id = 0;
    const tryShow = () => {
      if (!canShowInstallBanner()) return;
      setShow(true);
      if (id) window.clearInterval(id);
    };
    // Poll briefly until help has been dismissed / deferred
    id = window.setInterval(tryShow, 800);
    const boot = window.setTimeout(tryShow, 1400);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(boot);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(INSTALL_KEY, "1");
    setShow(false);
    setSheet(false);
  };

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      setDeferred(null);
      dismiss();
      return;
    }
    setSheet(true);
  };

  if (blocked) return null;
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
            <p className="text-sm font-medium">Installer sur l’iPhone</p>
            <p className="text-[11px] text-muted">Plein écran, comme une app native</p>
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
            <p className="mt-3 text-xs text-subtle">
              iPhone 17 Pro : l’encoche et les bords sont pris en charge. L’app reste disponible hors ligne pour vos projets.
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

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
