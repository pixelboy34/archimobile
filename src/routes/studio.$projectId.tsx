import { createFileRoute } from "@tanstack/react-router";
import { StudioShell } from "@/components/studio/StudioShell";

export const Route = createFileRoute("/studio/$projectId")({
  component: StudioPage,
});

function StudioPage() {
  const { projectId } = Route.useParams();
  return <StudioShell projectId={projectId} />;
}
