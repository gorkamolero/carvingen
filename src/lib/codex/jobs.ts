import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { generateCodexImage } from "./image";
import { getServerEnv } from "@/lib/env";
import { createJob, completeJob, getJobById, updateJobProgress } from "@/lib/db/repositories/jobs";
import { createAssetRecord, getAssetById, getAssetBySha } from "@/lib/db/repositories/assets";
import { sha256 } from "@/lib/storage/hash";

export const codexJobSchema = z.object({
  projectId: z.string().min(1), nodeId: z.string().min(1), provider: z.literal("local"), providerSlug: z.literal("codex/gpt-image"),
  requestInput: z.object({ prompt: z.string().trim().min(1), referenceAssetIds: z.array(z.string()).max(10).default([]), aspectRatio: z.enum(["1:1", "3:4", "4:3", "9:16", "16:9"]) }),
});
const globalJobs = globalThis as typeof globalThis & { codexJobs?: Set<string> };
const active = globalJobs.codexJobs ??= new Set<string>();
export async function startCodexJob(raw: unknown) {
  const request = codexJobSchema.parse(raw);
  const job = await createJob({ ...request, providerJobId: `server-managed:${randomUUID()}` });
  active.add(job.jobId);
  void (async () => {
    await updateJobProgress(job.jobId, 5, "Waiting for Codex · about a minute per image");
    const referencePaths = await Promise.all(request.requestInput.referenceAssetIds.map(async (id) => {
      const asset = await getAssetById(id);
      if (!asset || !asset.mimeType.startsWith("image/")) throw new Error(`Image asset ${id} not found.`);
      return asset.localPath;
    }));
    const path = await generateCodexImage({ ...request.requestInput, referencePaths, workDir: join(getServerEnv().ASSET_STORAGE_PATH, "codex-jobs", job.jobId) });
    await updateJobProgress(job.jobId, 95, "Saving image");
    const bytes = await readFile(path), hash = sha256(bytes);
    const asset = await getAssetBySha(hash, bytes.length) ?? await createAssetRecord({ jobId: job.jobId, kind: "image", mimeType: "image/png", localPath: path, sha256: hash, bytes: bytes.length, originalFileName: "output.png" });
    if (!asset) throw new Error("Could not save Codex image.");
    await completeJob({ id: job.jobId, state: "succeeded", responseSummary: { assets: [{ name: "image", kind: "image", assetId: asset.id }], outputAssetId: asset.id }, outputAssetIds: [asset.id] });
  })().catch(async (error) => {
    await completeJob({ id: job.jobId, state: "failed", error: error instanceof Error ? error.message : "Codex image failed." });
  }).finally(() => active.delete(job.jobId));
  return job;
}
export async function reconcileCodexJob(id: string) {
  const job = await getJobById(id);
  if (job?.providerSlug === "codex/gpt-image" && ["queued", "running"].includes(job.state) && !active.has(id)) {
    await completeJob({ id, state: "failed", error: "Server restarted during this Codex image job. Run it again." });
  }
}
