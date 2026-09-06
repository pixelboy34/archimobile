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

export function ToolDock({
  tool,
  onTool,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
}) {
  const skill = useStudio((s) => s.skill);
  // Amateur: hide esquisse avancée + toiture, but keep slab/stair/column reachable
  const groups =
    skill === "simple"
      ? GROUPS.filter((g) => g.id === "edit" || g.id === "draw" || g.id === "struct" || g.id === "obj").map((g) =>
          g.id === "struct" ? { ...g, tools: (["column", "stair", "slab"] as Tool[]) } : g,
        )
      : GROUPS;
  const active = groups.find((g) => g.tools.includes(tool)) ?? groups[0]!;
  const sub = active.tools;

  return (
    <div className="pointer-events-auto flex max-w-full flex-col items-center gap-1.5">
      {sub.length > 1 && (
        <div className="flex gap-1 overflow-x-auto bg-surface/95 p-1 shadow-border backdrop-blur-md">
          {sub.map((id) => {
            const Icon = ICONS[id] ?? MousePointer2;
            return (
              <button
                key={id}
                type="button"
                title={TOOL_LABELS[id]}
                onClick={() => onTool(id)}
                className={cn(
                  "flex h-10 min-w-10 items-center justify-center px-3 text-muted transition-colors duration-150",
                  tool === id ? "bg-primary text-primary-fg" : "hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                <span className="sr-only">{TOOL_LABELS[id]}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto bg-surface/95 p-1.5 shadow-border backdrop-blur-md">
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
                "flex h-10 min-w-10 flex-col items-center justify-center px-2 text-[10px] tracking-wide text-muted uppercase transition-colors duration-150",
                on ? "bg-elevated text-accent" : "hover:bg-elevated/70 hover:text-fg",
              )}
            >
              <Icon className="size-4" />
              <span>{g.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
