import { loadProject } from "@/lib/db/repositories/projects";
import { CaptureCanvas } from "@/features/capture/CaptureCanvas";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CaptureCanvas graph={await loadProject((await params).id)} />;
}
