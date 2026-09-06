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
  const expert = skill === "pro";
  const groups =
    skill === "simple"
      ? GROUPS.filter((g) => g.id === "edit" || g.id === "draw" || g.id === "struct" || g.id === "obj").map((g) =>
          g.id === "struct" ? { ...g, tools: (["column", "stair", "slab"] as Tool[]) } : g,
        )
      : GROUPS;
  const active = groups.find((g) => g.tools.includes(tool)) ?? groups[0]!;
  const sub = active.tools;

  return (
    <div className="pointer-events-auto flex max-w-full flex-col items-stretch gap-1">
      {sub.length > 1 && (
        <div className="flex gap-0.5 overflow-x-auto">
          {sub.map((id) => {
            const Icon = ICONS[id] ?? MousePointer2;
            const on = tool === id;
            return (
              <button
                key={id}
                type="button"
                title={TOOL_LABELS[id]}
                onClick={() => onTool(id)}
                className={cn(
                  "flex min-w-11 items-center justify-center rounded-lg px-2 transition-colors duration-150",
                  expert ? "h-11 flex-col gap-0.5 py-1" : "h-10",
                  on
                    ? "bg-accent/15 text-accent ring-1 ring-accent/45"
                    : "text-muted/70 hover:bg-elevated/70 hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {expert ? (
                  <span className="max-w-[3.2rem] truncate text-[9px] font-medium leading-none tracking-wide">
                    {TOOL_SHORT[id]}
                  </span>
                ) : (
                  <span className="sr-only">{TOOL_LABELS[id]}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-0.5 overflow-x-auto">
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
                "relative flex h-11 min-w-11 flex-col items-center justify-center rounded-lg px-2 text-[10px] tracking-wide uppercase transition-colors duration-150",
                on ? "text-accent" : "text-muted/65 hover:bg-elevated/60 hover:text-fg",
              )}
            >
              <Icon className="size-4" />
              <span>{g.label}</span>
              {on && (
                <span className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
