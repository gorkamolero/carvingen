import { captureCanvas } from "@/lib/capture/browser";
import { loadProject } from "@/lib/db/repositories/projects";
import { jsonError } from "@/lib/http/json";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await loadProject(id);
    // Use only this server's listening port, never a caller-provided remote URL.
    const port = new URL(request.url).port || process.env.PORT || "3000";
    const png = await captureCanvas(`http://127.0.0.1:${port}`, id);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="canvas.png"' } });
  } catch (e) { return jsonError(e); }
}
