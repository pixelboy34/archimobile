import { Maximize2, RotateCcw, RotateCw, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useStudio } from "@/lib/store/project-store";
import { dispatchCam } from "@/lib/viewport/cam";

export function NavPad({ docked = false }: { docked?: boolean }) {
  const north = useStudio(
    (s) => s.projects.find((p) => p.id === s.currentId)?.meta.north ?? 0,
  );
  const showCompass = useStudio((s) => s.nav.showCompass);
  const [theta, setTheta] = useState(0.7);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onPose = (e: Event) => {
      const d = (e as CustomEvent<{ theta: number }>).detail;
      if (d) setTheta(d.theta);
    };
    window.addEventListener("forma-pose", onPose);
    return () => window.removeEventListener("forma-pose", onPose);
  }, []);

  const rose = ((theta - (north * Math.PI) / 180 + Math.PI / 2) * 180) / Math.PI;

  return (
    <div
      className="nav-pad pointer-events-auto z-10 flex flex-col items-end gap-1"
      style={{ position: "absolute", right: 8, bottom: 162 }}
    >
      {open && (
        <div className="grid grid-cols-3 overflow-hidden rounded-md bg-surface/80 shadow-border backdrop-blur-sm">
          <PadBtn hint="Cadrer" onClick={() => dispatchCam({ kind: "fit" })}>
            <Maximize2 className="size-3.5" />
          </PadBtn>
          <PadBtn hint="Nord / façade" onClick={() => dispatchCam({ kind: "north" })}>
            N
          </PadBtn>
          <PadBtn hint="Tourner +90°" onClick={() => dispatchCam({ kind: "yawR" })}>
            <RotateCw className="size-3.5" />
          </PadBtn>
          <PadBtn hint="Façade ouest" onClick={() => dispatchCam({ kind: "left" })}>
            O
          </PadBtn>
          <PadBtn hint="Axonométrie" onClick={() => dispatchCam({ kind: "iso" })}>
            ·
          </PadBtn>
          <PadBtn hint="Façade est" onClick={() => dispatchCam({ kind: "right" })}>
            E
          </PadBtn>
          <PadBtn hint="Tourner −90°" onClick={() => dispatchCam({ kind: "yawL" })}>
            <RotateCcw className="size-3.5" />
          </PadBtn>
          <PadBtn hint="Façade sud" onClick={() => dispatchCam({ kind: "front" })}>
            S
          </PadBtn>
          <PadBtn
            hint="Options de navigation"
            onClick={() => window.dispatchEvent(new CustomEvent("forma-open-nav"))}
          >
            <Settings2 className="size-3.5" />
          </PadBtn>
        </div>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Cadrer"
          aria-label="Cadrer"
          onClick={() => dispatchCam({ kind: "fit" })}
          className="flex size-10 items-center justify-center rounded-full bg-surface/70 text-fg/80 shadow-border backdrop-blur-sm hover:text-accent"
        >
          <Maximize2 className="ico-live size-3.5" />
        </button>
        {showCompass && (
          <button
            type="button"
            title={open ? "Fermer le pavé caméra" : "Pavé caméra"}
            aria-label={open ? "Fermer le pavé caméra" : "Pavé caméra"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="relative flex size-10 items-center justify-center rounded-full bg-surface/70 shadow-border backdrop-blur-sm"
          >
            <span className="absolute inset-1 rounded-full border border-border/80" />
            <span
              className="absolute inset-0 flex items-start justify-center pt-1 font-mono text-[10px] font-semibold tracking-wide text-accent"
              style={{ transform: `rotate(${rose}deg)` }}
            >
              N
            </span>
            <span className="size-1 rounded-full bg-fg" />
          </button>
        )}
      </div>
    </div>
  );
}

function PadBtn({
  children,
  hint,
  onClick,
}: {
  children: React.ReactNode;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={hint}
      aria-label={hint}
      onClick={onClick}
      className="flex size-9 items-center justify-center font-mono text-[10px] text-muted hover:bg-elevated hover:text-fg"
    >
      {children}
    </button>
  );
}