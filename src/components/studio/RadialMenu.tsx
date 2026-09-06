import {
  Box,
  BrickWall,
  Columns3,
  Cuboid,
  DoorOpen,
  Home,
  LayoutGrid,
  MousePointer2,
  PenLine,
  Ruler,
  Scan,
  Sofa,
  Square,
  SquareStack,
} from "lucide-react";
import type { Tool } from "@/lib/bim/types";
import { TOOL_LABELS } from "@/lib/bim/types";
import { useStudio } from "@/lib/store/project-store";

const CORE: { tool: Tool; icon: typeof PenLine }[] = [
  { tool: "select", icon: MousePointer2 },
  { tool: "wall", icon: BrickWall },
  { tool: "rect", icon: Square },
  { tool: "door", icon: DoorOpen },
  { tool: "window", icon: LayoutGrid },
  { tool: "room", icon: Home },
  { tool: "measure", icon: Ruler },
  { tool: "furniture", icon: Sofa },
];

const STRUCT: { tool: Tool; icon: typeof PenLine }[] = [
  { tool: "pen", icon: PenLine },
  { tool: "survey", icon: Scan },
  { tool: "column", icon: Columns3 },
  { tool: "stair", icon: SquareStack },
  { tool: "slab", icon: Box },
  { tool: "roof", icon: Cuboid },
];

function Ring({
  items,
  radius,
  tool,
  onTool,
  onClose,
  size = 44,
}: {
  items: { tool: Tool; icon: typeof PenLine }[];
  radius: number;
  tool: Tool;
  onTool: (t: Tool) => void;
  onClose: () => void;
  size?: number;
}) {
  const n = items.length;
  const cx = 120;
  const cy = 120;
  return (
    <>
      {items.map((item, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + Math.cos(ang) * radius - size / 2;
        const y = cy + Math.sin(ang) * radius - size / 2;
        const Icon = item.icon;
        const on = tool === item.tool;
        return (
          <button
            key={item.tool}
            type="button"
            title={TOOL_LABELS[item.tool]}
            onClick={() => {
              onTool(item.tool);
              onClose();
            }}
            className={`pointer-events-auto absolute flex items-center justify-center rounded-full border shadow-border ${
              on ? "border-transparent bg-primary text-primary-fg" : "border-border bg-surface text-fg"
            }`}
            style={{ left: x, top: y, width: size, height: size }}
          >
            <Icon className="size-4" />
            <span className="sr-only">{TOOL_LABELS[item.tool]}</span>
          </button>
        );
      })}
    </>
  );
}

export function RadialMenu({
  open,
  tool,
  onTool,
  onClose,
  onStudio,
}: {
  open: boolean;
  tool: Tool;
  onTool: (t: Tool) => void;
  onClose: () => void;
  onStudio: () => void;
}) {
  const skill = useStudio((s) => s.skill);
  if (!open) return null;
  const pro = skill === "pro";
  const inner = CORE;
  const outer = pro ? STRUCT : STRUCT.filter((i) => ["column", "stair", "slab"].includes(i.tool));

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center pb-[7.5rem]">
      <button
        type="button"
        aria-label="Fermer"
        className="pointer-events-auto absolute inset-0"
        onClick={onClose}
      />
      <div className="relative size-60">
        <button
          type="button"
          onClick={() => {
            onStudio();
            onClose();
          }}
          className="pointer-events-auto absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-primary text-[10px] tracking-wide text-primary-fg uppercase"
        >
          Studio
        </button>
        <Ring items={inner} radius={78} tool={tool} onTool={onTool} onClose={onClose} size={42} />
        <Ring items={outer} radius={118} tool={tool} onTool={onTool} onClose={onClose} size={40} />
      </div>
    </div>
  );
}
