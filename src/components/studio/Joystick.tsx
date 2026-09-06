import { useRef } from "react";

export function Joystick() {
  const origin = useRef<{ x: number; y: number } | null>(null);

  const emit = (x: number, y: number) => {
    window.dispatchEvent(new CustomEvent("forma-joy", { detail: { x, y } }));
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-28 left-4 size-28 rounded-full border border-accent/35 bg-surface/70 shadow-border backdrop-blur-md"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!origin.current) return;
        const dx = (e.clientX - origin.current.x) / 48;
        const dy = (e.clientY - origin.current.y) / 48;
        const mag = Math.hypot(dx, dy);
        const s = mag > 1 ? 1 / mag : 1;
        emit(dx * s, dy * s);
      }}
      onPointerUp={() => {
        origin.current = null;
        emit(0, 0);
      }}
    >
      <div className="absolute inset-2 rounded-full border border-border/80" />
      <div className="absolute inset-8 rounded-full bg-elevated" />
    </div>
  );
}
