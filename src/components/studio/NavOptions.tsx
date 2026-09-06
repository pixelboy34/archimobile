import { DEFAULT_NAV } from "@/lib/nav/prefs";
import { useStudio } from "@/lib/store/project-store";

export function NavOptions() {
  const nav = useStudio((s) => s.nav);
  const setNav = useStudio((s) => s.setNav);
  const maquette = nav.orbitMode !== "regard";

  return (
    <div className="flex flex-col gap-4">
      <p className="hud-label">Pilotage</p>
      <p className="text-sm text-muted">
        Maquette : le bâtiment suit le doigt. Regard : vous orientez la caméra, comme une visite.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={maquette}
          onClick={() => setNav({ orbitMode: "maquette" })}
          className={`flex h-16 flex-col items-center justify-center rounded-lg text-sm ${
            maquette ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
          }`}
        >
          Maquette
          <span className="mt-0.5 text-[10px] tracking-wide uppercase opacity-70">1 doigt = tourner</span>
        </button>
        <button
          type="button"
          aria-pressed={!maquette}
          onClick={() => setNav({ orbitMode: "regard" })}
          className={`flex h-16 flex-col items-center justify-center rounded-lg text-sm ${
            !maquette ? "bg-primary text-primary-fg" : "bg-elevated text-muted"
          }`}
        >
          Regard
          <span className="mt-0.5 text-[10px] tracking-wide uppercase opacity-70">1 doigt = viser</span>
        </button>
      </div>
      <p className="hud-label">Caméra</p>
      <Toggle label="Projection orthogonale" on={nav.orthoCam} onChange={(v) => setNav({ orthoCam: v })} />
      <Toggle label="Boussole" on={nav.showCompass} onChange={(v) => setNav({ showCompass: v })} />
      <Toggle label="HUD métré" on={nav.showHud} onChange={(v) => setNav({ showHud: v })} />
      <Slider
        label="Sensibilité"
        value={nav.sensitivity}
        min={0.4}
        max={2}
        step={0.1}
        onChange={(v) => setNav({ sensitivity: v })}
      />
      <details className="flex flex-col gap-3">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between bg-elevated px-3 text-xs tracking-wide text-muted uppercase">
          Axes et visite
        </summary>
      <Toggle
        label="Inverser gauche / droite"
        on={nav.invertOrbitX}
        onChange={(v) => setNav({ invertOrbitX: v })}
      />
      <Toggle
        label="Inverser haut / bas"
        on={nav.invertOrbitY}
        onChange={(v) => setNav({ invertOrbitY: v })}
      />
      <Toggle
        label="Inverser le déplacement (2 doigts)"
        on={nav.invertPan}
        onChange={(v) => setNav({ invertPan: v })}
      />
      <Toggle label="Inverser le zoom" on={nav.invertZoom} onChange={(v) => setNav({ invertZoom: v })} />
      <Toggle
        label="Inverser le regard (visite)"
        on={nav.invertLook}
        onChange={(v) => setNav({ invertLook: v })}
      />
      <Slider
        label="Amorti"
        value={nav.damping}
        min={6}
        max={22}
        step={1}
        onChange={(v) => setNav({ damping: v })}
      />
      <Slider
        label="Champ (FOV)"
        value={nav.fov}
        min={36}
        max={80}
        step={1}
        onChange={(v) => setNav({ fov: v })}
      />
      <Slider
        label="Vitesse de visite"
        value={nav.walkSpeed}
        min={0.5}
        max={2}
        step={0.1}
        onChange={(v) => setNav({ walkSpeed: v })}
      />
      </details>
      <button
        type="button"
        onClick={() => setNav({ ...DEFAULT_NAV })}
        className="h-11 rounded-lg border border-border bg-elevated text-sm"
      >
        Réinitialiser la navigation
      </button>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="flex h-11 items-center justify-between rounded-lg bg-elevated px-3 text-sm"
    >
      <span>{label}</span>
      <span className={`flex h-6 w-11 items-center rounded-full px-0.5 ${on ? "bg-accent" : "bg-border"}`}>
        <span className={`size-5 rounded-full bg-primary transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-xs tracking-wide text-muted uppercase">
        {label}
        <span className="font-mono text-fg">{value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-accent [touch-action:none]"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      />
    </label>
  );
}
