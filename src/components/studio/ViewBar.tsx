import {
  Box,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Layers,
  LayoutDashboard,
  Scan,
  SquareSplitVertical,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Project, ViewMode } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";

const VIEW_META: { id: ViewMode; label: string; Icon: typeof Box }[] = [
  { id: "3d", label: "3D", Icon: Box },
  { id: "plan", label: "Plan", Icon: LayoutDashboard },
  { id: "visite", label: "Visite", Icon: Footprints },
  { id: "coupe", label: "Coupe", Icon: SquareSplitVertical },
  { id: "ar", label: "AR", Icon: Scan },
];

/**
 * Coin bas-gauche : les vues, puis le bandeau d'etages decrit au §4.
 *
 * Les vues tenaient dans un plafond max-w-[min(58%,14rem)] double d'un
 * overflow-x-auto : 364 px de contenu pour 186 / 218 / 224 / 224 / 224 px utiles
 * a 320 / 375 / 393 / 430 / 768, soit 178 a 140 px hors champ. Coupe et AR
 * n'etaient atteignables a AUCUNE largeur, Visite non plus a 320, et l'ascenseur
 * de 5 px n'existe pas au doigt. Le plafond est leve, les puces passent a la
 * ligne, et la barre remonte au-dessus du NavPad — qui occupe les 54 px du bas a
 * droite — pour disposer de toute la largeur.
 *
 * Le bandeau d'etages avait disparu : un R+40 n'offrait plus qu'un bouton texte
 * de 21x17 px dans le rail de commande, un seul sens, 40 appuis pour atteindre le
 * dernier niveau.
 */
export function ViewBar({ project, onStories }: { project: Project; onStories: () => void }) {
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const workspace = useStudio((s) => s.workspace);
  const skill = useStudio((s) => s.skill);
  const storyId = useStudio((s) => s.storyId);
  const setStory = useStudio((s) => s.setStory);
  const cycleStory = useStudio((s) => s.cycleStory);
  const [listOpen, setListOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listOpen) return;
    listRef.current?.querySelector<HTMLElement>('[data-current="true"]')?.scrollIntoView({ block: "nearest" });
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setListOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setListOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [listOpen]);

  if (workspace !== "modele" && view !== "ar") return null;

  const views = skill === "simple" ? VIEW_META.slice(0, 3) : VIEW_META;
  const stories = project.stories;
  const activeId = storyId ?? stories[0]?.id ?? null;
  const idx = Math.max(0, stories.findIndex((st) => st.id === activeId));
  const active = stories[idx];
  // Le haut du batiment en haut de la liste, comme sur une coupe.
  const ordered = stories.map((st, i) => ({ st, rank: i + 1 })).reverse();

  return (
    /*
     * Conteneur transparent en pleine largeur : il doit laisser passer l'orbite
     * de la maquette, seules les puces captent le doigt.
     */
    <div
      ref={wrapRef}
      className="view-bar pointer-events-none z-10 flex flex-col items-start gap-1.5"
      style={{ position: "absolute", left: 8, right: 8, bottom: 214 }}
    >
      {active && (
        <div className="relative flex flex-wrap items-center gap-0.5">
          {listOpen && (
            <div className="panel-card pointer-events-auto absolute bottom-full left-0 mb-2 w-[min(19rem,calc(100vw-1.25rem))] overflow-hidden">
              <div ref={listRef} className="grid max-h-[34dvh] grid-cols-3 gap-1 overflow-y-auto p-1.5">
                {ordered.map(({ st, rank }) => (
                  <button
                    key={st.id}
                    type="button"
                    data-current={st.id === activeId}
                    onClick={() => {
                      setStory(st.id);
                      setListOpen(false);
                    }}
                    className={`flex h-11 min-h-11 items-center justify-center rounded-lg px-1 text-[11px] font-medium ${
                      st.id === activeId
                        ? "bg-accent/15 text-accent ring-1 ring-accent/45"
                        : "bg-elevated/70 text-fg/80"
                    }`}
                  >
                    <span className="truncate">{st.name || `Niveau ${rank}`}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setListOpen(false);
                  onStories();
                }}
                className="flex h-11 min-h-11 w-full items-center justify-center gap-1.5 border-t border-border/60 text-xs text-muted"
              >
                <Layers className="size-3.5" />
                Gérer les niveaux
              </button>
            </div>
          )}
          <button
            type="button"
            aria-label="Niveau inférieur"
            disabled={stories.length < 2}
            onClick={() => cycleStory(-1)}
            className="hud-chip pointer-events-auto w-11 justify-center disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Choisir un niveau"
            aria-expanded={listOpen}
            onClick={() => setListOpen((v) => !v)}
            className={`hud-chip pointer-events-auto max-w-[11rem] ${listOpen ? "hud-chip-on" : ""}`}
          >
            <Layers className="ico-live size-3.5 shrink-0" />
            <span className="truncate">{active.name || `Niveau ${idx + 1}`}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted tabular-nums">
              {idx + 1}/{stories.length}
            </span>
          </button>
          <button
            type="button"
            aria-label="Niveau supérieur"
            disabled={stories.length < 2}
            onClick={() => cycleStory(1)}
            className="hud-chip pointer-events-auto w-11 justify-center disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-0.5">
        {views.map((v) => {
          const Icon = v.Icon;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`hud-chip pointer-events-auto ${view === v.id ? "hud-chip-on" : ""}`}
            >
              <Icon className="ico-live size-3.5" />
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
