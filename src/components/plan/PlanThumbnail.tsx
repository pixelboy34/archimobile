import { projectBounds } from "@/lib/bim/geometry";
import { ROOM_HATCH } from "@/lib/bim/materials";
import type { Project } from "@/lib/bim/types";

export function PlanThumbnail({
  project,
  className,
}: {
  project: Project;
  className?: string;
}) {
  const storyId = project.stories[0]?.id;
  const rooms = project.rooms.filter((r) => !storyId || r.storyId === storyId);
  const walls = project.walls.filter((w) => !storyId || w.storyId === storyId);
  const b = projectBounds(project, storyId);
  const pad = 1.4;
  const w = Math.max(4, b.max.x - b.min.x + pad * 2);
  const h = Math.max(4, b.max.y - b.min.y + pad * 2);
  const ox = b.min.x - pad;
  const oy = b.min.y - pad;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={w} height={h} fill="#141412" />
      {rooms.map((r) => {
        const xs = r.polygon.map((p) => p.x);
        const ys = r.polygon.map((p) => p.y);
        const rw = Math.max(...xs) - Math.min(...xs);
        const rh = Math.max(...ys) - Math.min(...ys);
        return (
          <rect
            key={r.id}
            x={Math.min(...xs) - ox}
            y={h - (Math.min(...ys) - oy) - rh}
            width={rw}
            height={rh}
            fill={ROOM_HATCH[r.function] ?? "#c4bfb4"}
            fillOpacity={0.28}
          />
        );
      })}
      {walls.map((wall) => (
        <line
          key={wall.id}
          x1={wall.a.x - ox}
          y1={h - (wall.a.y - oy)}
          x2={wall.b.x - ox}
          y2={h - (wall.b.y - oy)}
          stroke="#e8e4d9"
          strokeWidth={0.18}
          strokeLinecap="square"
        />
      ))}
    </svg>
  );
}
