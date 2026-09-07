let registered = false;

/** Register the FORMA custom service worker (public/sw.js). Safe to call once from client. */
export function registerFormaServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (registered) return;
  registered = true;

  const boot = () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("[forma] SW registration failed", err);
    });
  };

  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
}

export function isFormaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export type PwaInstallState = "installed" | "installable" | "offline" | "browser";

export function readPwaInstallState(opts?: {
  deferred?: boolean;
  online?: boolean;
}): PwaInstallState {
  const online = opts?.online ?? (typeof navigator !== "undefined" ? navigator.onLine : true);
  if (!online) return "offline";
  if (isFormaStandalone()) return "installed";
  if (opts?.deferred) return "installable";
  return "browser";
}
