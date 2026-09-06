import { useEffect, useState } from "react";

const KEY = "forma-nav-coached-v3";

export function NavCoach() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(KEY)) return;
    const id = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(id);
  }, []);
  if (!open) return null;
  return (
    <button
      type="button"
      className="pointer-events-auto absolute inset-x-4 top-1/2 z-20 -translate-y-1/2 rounded-2xl border border-accent/40 bg-surface/95 p-4 text-left shadow-border backdrop-blur-md"
      onClick={() => {
        window.localStorage.setItem(KEY, "1");
        setOpen(false);
      }}
    >
      <p className="hud-label">Pilotage maquette</p>
      <p className="mt-1 font-display text-base font-semibold">Le bâtiment suit votre doigt</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
        <li>Un doigt — faites tourner le volume</li>
        <li>Deux doigts — glissez le plan · pincez pour zoomer</li>
        <li>Cube N·E·S·O — façades · ±90° pour pivoter</li>
        <li>Nav — passez en « Regard » si vous visez comme une caméra</li>
      </ul>
      <p className="mt-3 text-xs text-accent">Touchez pour commencer</p>
    </button>
  );
}
