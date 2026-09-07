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

/** Short visible labels under icons (Expert). */
const TOOL_SHORT: Record<Tool, string> = {
  select: "Sél.",
  measure: "Cote",
  delete: "Effacer",
  pen: "Trait",
  survey: "Relevé",
  wall: "Mur",
  rect: "Rect.",
  door: "Porte",
  window: "Fen.",
  room: "Pièce",
  column: "Poteau",
  stair: "Esc.",
  slab: "Dalle",
  roof: "Toit",
  furniture: "Objet",
};

/** Tool groups inside CommandRail — quieter inactive, accent underline on active group. */
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
    <div className="pointer-events-auto flex max-w-full gap-0.5 overflow-x-auto">
      {groups.map((g) => {
        const Icon = g.icon;
        const on = g.id === active.id;
        return (
          <button
            key={g.id}
            type="button"
            title={g.label}
            onClick={() => {
              if (!g.tools.includes(tool)) onTool(g.tools[0]!);
            }}
            className={cn(
              "hud-chip-press relative flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[11px] font-medium tracking-wide uppercase",
              on ? "text-accent" : "text-fg/70 hover:bg-elevated/60 hover:text-fg",
            )}
          >
            <Icon className="ico-live size-3.5" />
            <span>{g.label}</span>
          </button>
        );
      })}
      {sub.length > 1 &&
        sub.map((id) => {
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
                "ico-btn hud-chip-press flex size-8 shrink-0 items-center justify-center rounded-lg",
                on
                  ? "bg-accent/15 text-accent ring-1 ring-accent/45"
                  : "text-fg/70 hover:bg-elevated/70 hover:text-fg",
              )}
            >
              <Icon className="ico-live size-3.5" />
              <span className="sr-only">{TOOL_LABELS[id]}</span>
            </button>
          );
        })}
    </div>
  );
}
