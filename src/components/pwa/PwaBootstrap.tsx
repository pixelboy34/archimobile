import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useFormaPwa } from "@/lib/pwa/use-pwa";

/** Registers SW and toasts once when the app is offline with an active controller. */
export function PwaBootstrap() {
  const { online, swReady } = useFormaPwa();
  const toasted = useRef(false);

  useEffect(() => {
    if (!online && swReady && !toasted.current) {
      toasted.current = true;
      toast.message("Mode hors ligne");
    }
    if (online) toasted.current = false;
  }, [online, swReady]);

  return null;
}
