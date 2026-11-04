import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { nodes } from "@/lib/db/schema";
import { loadProject } from "@/lib/db/repositories/projects";
import { createAssetRecord, getAssetById, getAssetBySha } from "@/lib/db/repositories/assets";
import { buildAssetPath } from "@/lib/storage/paths";
import { writeFileIfMissing } from "@/lib/storage/files";
import { sha256 } from "@/lib/storage/hash";
import { ApiError } from "@/lib/http/errors";
import { jsonError, jsonOk, parseJson } from "@/lib/http/json";
import { captureViewerStill, captureViewerClip } from "./viewer";
import { queueCapture } from "./queue";
import { CaptureUnavailableError } from "./errors";

const id = z.string().regex(/^[\w-]+$/).max(128);
const schema = z.object({
  projectId: id, nodeId: id, assetId: id, clip: z.string().max(512).optional(),
  seconds: z.number().positive().max(300).default(10),
  autoRotate: z.boolean().optional(), exposure: z.number().min(0).max(10).optional(),
}).strict();

export async function viewerCaptureRoute(request: Request, record: boolean) {
  try {
    const input = schema.parse(await parseJson(request));
    const result = await queueCapture(async () => {
      const graph = await loadProject(input.projectId);
      const node = graph.nodes.find(n => n.id === input.nodeId);
      if (node?.type !== "viewer") throw new ApiError(404, "Viewer node not found.");
      const source = await getAssetById(input.assetId);
      if (!source || source.mimeType !== "model/gltf-binary") throw new ApiError(400, "A GLB asset is required.");
      const options = { ...input, baseUrl: new URL(request.url).origin, autoRotate: input.autoRotate ?? node.data.autoRotate, exposure: input.exposure ?? node.data.exposure };
      const buffer = record ? await captureViewerClip(options) : (await captureViewerStill(options)).buffer;
      const extension = record ? "mp4" : "png";
      const hash = sha256(buffer), localPath = buildAssetPath("capture", `${hash}.${extension}`);
      await writeFileIfMissing(localPath, buffer);
      const asset = await getAssetBySha(hash, buffer.length) ?? await createAssetRecord({
        kind: record ? "video" : "image", mimeType: record ? "video/mp4" : "image/png",
        localPath, sha256: hash, bytes: buffer.length, originalFileName: `capture.${extension}`,
        width: record ? 700 : 1400, height: record ? 800 : 1600,
      });
      // Read the latest node inside a transaction: capture can take minutes.
      db.transaction(tx => {
        const row = tx.select().from(nodes).where(and(eq(nodes.id, input.nodeId), eq(nodes.projectId, input.projectId))).get();
        if (!row || row.type !== "viewer") throw new ApiError(404, "Viewer was deleted during capture.");
        const data = JSON.parse(row.dataJson);
        data.captureAssetIds = [...new Set([...(data.captureAssetIds ?? []), asset!.id])];
        tx.update(nodes).set({ dataJson: JSON.stringify(data) }).where(and(eq(nodes.id, input.nodeId), eq(nodes.projectId, input.projectId))).run();
      });
      return { asset, assetId: asset!.id, extension };
    });
    return jsonOk(result);
  } catch (error) {
    if (error instanceof CaptureUnavailableError) return jsonOk({ error: error.message, code: error.code }, { status: 503 });
    if (error instanceof z.ZodError) return jsonError(new ApiError(400, error.issues[0]?.message ?? "Invalid capture request."));
    return jsonError(error);
  }
}
