import { notFound } from "next/navigation";
import { CanvasScreen } from "@/features/canvas/CanvasScreen";
import { loadProject } from "@/lib/db/repositories/projects";
import { ApiError } from "@/lib/http/errors";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadProject(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  return <CanvasScreen key={id} projectId={id} />;
}
