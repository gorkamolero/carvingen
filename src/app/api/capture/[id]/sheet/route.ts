import { readFile } from "node:fs/promises";
import { loadProject } from "@/lib/db/repositories/projects";
import { getAssetById } from "@/lib/db/repositories/assets";
import { sheetEntries } from "@/lib/capture/graph";
import { buildSheet } from "@/lib/capture/sheet";
import { jsonError } from "@/lib/http/json";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const graph = await loadProject((await params).id);
    const nodeId = new URL(request.url).searchParams.get("node");
    const nodes = graph.nodes.filter((n) => n.type === "multiview" && (!nodeId || n.id === nodeId));
    const entries = nodes.flatMap((n, i) => sheetEntries(graph, n).map((e) => ({ ...e, label: nodes.length > 1 ? `${i + 1} · ${e.label}` : e.label })));
    const items = await Promise.all(entries.map(async (entry) => {
      const asset = await getAssetById(entry.asset);
      if (!asset) throw new Error(`Missing sheet asset ${entry.asset}`);
      return { label: entry.label, buffer: await readFile(asset.localPath) };
    }));
    return new Response(new Uint8Array(await buildSheet(items)), { headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="multiview-sheet.png"' } });
  } catch (e) { return jsonError(e); }
}
