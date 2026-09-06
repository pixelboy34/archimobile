import {
  BrickWall,
  DoorOpen,
  LayoutGrid,
  MousePointer2,
  PenLine,
  Ruler,
  Scan,
  Sofa,
} from "lucide-react";
import type { Tool } from "@/lib/bim/types";
import { TOOL_LABELS } from "@/lib/bim/types";

const ITEMS: { tool: Tool; icon: typeof PenLine }[] = [
  { tool: "select", icon: MousePointer2 },
  { tool: "pen", icon: PenLine },
  { tool: "wall", icon: BrickWall },
  { tool: "door", icon: DoorOpen },
  { tool: "window", icon: LayoutGrid },
  { tool: "survey", icon: Scan },
  { tool: "measure", icon: Ruler },
  { tool: "furniture", icon: Sofa },
];

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
  if (!open) return null;
  const n = ITEMS.length;
  const r = 86;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center pb-[5.5rem]">
      <button
        type="button"
        aria-label="Fermer"
        className="pointer-events-auto absolute inset-0"
        onClick={onClose}
      />
      <div className="relative size-52">
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
        {ITEMS.map((item, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          const x = 104 + Math.cos(ang) * r - 22;
          const y = 104 + Math.sin(ang) * r - 22;
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
              className={`pointer-events-auto absolute flex size-11 items-center justify-center rounded-full border shadow-border ${
                on ? "border-transparent bg-primary text-primary-fg" : "border-border bg-surface text-fg"
              }`}
              style={{ left: x, top: y }}
            >
              <Icon className="size-4" />
              <span className="sr-only">{TOOL_LABELS[item.tool]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
