import type { LucideIcon } from "lucide-react";
import {
  Box,
  BrickWall,
  Columns3,
  Cuboid,
  DoorOpen,
  Eraser,
  Home,
  LayoutGrid,
  MousePointer2,
  PenLine,
  Scan,
  Sofa,
  Square,
  SquareStack,
  Ruler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tool } from "@/lib/bim/types";
import { TOOL_LABELS } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";

const GROUPS: { id: string; label: string; tools: Tool[]; icon: LucideIcon }[] = [
  { id: "edit", label: "Éditer", icon: MousePointer2, tools: ["select", "measure", "delete"] },
  { id: "sketch", label: "Esquisse", icon: PenLine, tools: ["pen", "survey"] },
  { id: "draw", label: "Tracer", icon: BrickWall, tools: ["wall", "rect", "door", "window", "room"] },
  { id: "struct", label: "Ouvrage", icon: Columns3, tools: ["column", "stair", "slab", "roof"] },
  { id: "obj", label: "Objets", icon: Sofa, tools: ["furniture"] },
];

const ICONS: Partial<Record<Tool, LucideIcon>> = {
  select: MousePointer2,
  measure: Ruler,
  delete: Eraser,
  pen: PenLine,
  survey: Scan,
  wall: BrickWall,
  rect: Square,
  door: DoorOpen,
  window: LayoutGrid,
  room: Home,
  column: Columns3,
  stair: SquareStack,
  slab: Box,
  roof: Cuboid,
  furniture: Sofa,
};

/**
 * Une seule rangee, qui ne defile jamais. Le bandeau bas est fige a 150 px :
 * ViewBar, NavPad, RadialMenu et ResourcesPeek sont ancres en dur a
 * bottom: 162 px, donc une deuxieme ligne les recouvrirait. La rangee doit
 * donc tenir en largeur : a 320 px elle mesurait 491 px pour 289 px utiles,
 * et Ouvrage, Objets puis les trois sous-outils tombaient hors ecran derriere
 * une barre de defilement de 5 px, inexistante au doigt.
 *
 * D'ou deux regimes. Sous 500 px les cellules se partagent la largeur a parts
 * egales (basis-0) et ne gardent que l'icone : dix cellules de 27,7 px a
 * 320 px, toutes dans l'ecran. Au-dessus, la rangee tient a sa taille
 * naturelle et les libelles reviennent.
 */
export function ToolDock({
  tool,
  onTool,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
}) {
  const skill = useStudio((s) => s.skill);
  const groups =
    skill === "simple"
      ? GROUPS.filter((g) => g.id === "edit" || g.id === "draw" || g.id === "struct" || g.id === "obj").map((g) =>
          g.id === "struct" ? { ...g, tools: (["column", "stair", "slab"] as Tool[]) } : g,
        )
      : GROUPS;
  const active = groups.find((g) => g.tools.includes(tool)) ?? groups[0]!;
  const sub = active.tools;

  return (
    <div className="pointer-events-auto flex w-full items-center gap-px">
      {groups.map((g) => {
        const Icon = g.icon;
        const on = g.id === active.id;
        return (
          <button
            key={g.id}
            type="button"
            title={g.label}
            aria-label={g.label}
            aria-pressed={on}
            onClick={() => {
              if (!g.tools.includes(tool)) onTool(g.tools[0]!);
            }}
            className={cn(
              "hud-chip-press relative flex h-8 min-w-0 flex-1 basis-0 items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium tracking-wide uppercase min-[500px]:basis-auto",
              on ? "text-accent" : "text-fg/70 hover:bg-elevated/60 hover:text-fg",
            )}
          >
            <Icon className="ico-live size-3.5 shrink-0" />
            <span aria-hidden className="hidden truncate min-[500px]:inline">
              {g.label}
            </span>
            {on && (
              <span aria-hidden className="absolute inset-x-1 bottom-0.5 h-px rounded-full bg-accent" />
            )}
          </button>
        );
      })}
      {sub.length > 1 && (
        <>
          <span aria-hidden className="mx-px h-4 w-px shrink-0 rounded-full bg-border" />
          {sub.map((id) => {
            const Icon = ICONS[id] ?? MousePointer2;
            const on = tool === id;
            return (
              <button
                key={id}
                type="button"
                title={TOOL_LABELS[id]}
                aria-label={TOOL_LABELS[id]}
                aria-pressed={on}
                onClick={() => onTool(id)}
                className={cn(
                  // meme px-1 que les groupes : sans lui, flex-basis 0 laisse les
                  // icones a 23,6 px quand les groupes tiennent 31,6 px a 320 px
                  "ico-btn hud-chip-press flex h-8 min-w-0 flex-1 basis-0 items-center justify-center rounded-lg px-1 min-[500px]:size-8 min-[500px]:flex-none min-[500px]:basis-auto",
                  on
                    ? "bg-accent/15 text-accent ring-1 ring-accent/45"
                    : "text-fg/70 hover:bg-elevated/70 hover:text-fg",
                )}
              >
                <Icon className="ico-live size-3.5 shrink-0" />
                <span className="sr-only">{TOOL_LABELS[id]}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
