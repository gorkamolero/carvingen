import { readFile } from "node:fs/promises";
import { eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { jobs, assets } from "@/lib/db/schema";
import { loadProject } from "@/lib/db/repositories/projects";
import { buildNotes } from "@/lib/capture/notes";
import { currentOutputs } from "@/lib/capture/graph";
import { inspectGlb } from "@/lib/character/inspect";
import { jsonError } from "@/lib/http/json";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const graph = await loadProject(id);
    const ids = graph.nodes.flatMap(currentOutputs);
    const outputAssets = ids.length ? await db.select().from(assets).where(inArray(assets.id, ids)) : [];
    const jobIds = outputAssets.flatMap((a) => a.jobId ? [a.jobId] : []);
    const rows = await db.select().from(jobs).where(or(eq(jobs.projectId, id), jobIds.length ? inArray(jobs.id, jobIds) : undefined));
    // Legacy results predate sampler counts. Inspect their exact output, without changing the job.
    for (const row of rows) {
      const result = JSON.parse(row.responseSummaryJson ?? "{}");
      if (!Array.isArray(result.clips) || !result.clips.some((c: { frameCount?: number }) => c.frameCount === undefined)) continue;
      const asset = outputAssets.find((a) => a.id === result.outputAssetId);
      if (!asset) continue;
      const measured = inspectGlb(await readFile(asset.localPath));
      result.clips = result.clips.map((clip: { name: string; frameCount?: number }) => {
        const found = measured.clips.find((c) => c.name === clip.name);
        return clip.frameCount === undefined && found ? { ...clip, frameCount: found.frameCount, frameSource: "current GLB sampler count; legacy job" } : clip;
      });
      row.responseSummaryJson = JSON.stringify(result);
    }
    return new Response(buildNotes(graph, rows), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  } catch (e) { return jsonError(e); }
}
