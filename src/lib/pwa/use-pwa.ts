import { useEffect, useState } from "react";
import {
  isFormaStandalone,
  readPwaInstallState,
  registerFormaServiceWorker,
  type PwaInstallState,
} from "./register-sw";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function useFormaPwa() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [online, setOnline] = useState(true);
  const [swReady, setSwReady] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    registerFormaServiceWorker();
    setOnline(navigator.onLine);
    setStandalone(isFormaStandalone());

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    void navigator.serviceWorker?.ready.then(() => setSwReady(true)).catch(() => undefined);
    if (navigator.serviceWorker?.controller) setSwReady(true);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  const state: PwaInstallState = readPwaInstallState({
    deferred: Boolean(deferred),
    online,
  });

  return {
    deferred,
    clearDeferred: () => setDeferred(null),
    online,
    swReady,
    standalone,
    state,
  };
}
