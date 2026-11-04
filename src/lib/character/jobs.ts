import { withRetries } from "./retries";
export { withRetries } from "./retries";
import { TripoClient, tripoArtifact } from "@/lib/tripo/client";
import { generateCodexImage } from "@/lib/codex/image";
import { reconcileCodexJob } from "@/lib/codex/jobs";
import { combineAnimationGlbs } from "./pack";
import { fal } from "@fal-ai/client";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ANIMATION_PRESETS } from "./animation-library";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import { createJob, completeJob, getJobById, updateJobProgress } from "@/lib/db/repositories/jobs";
import { createAssetRecord, getAssetById, getAssetBySha } from "@/lib/db/repositories/assets";
import { getServerEnv, getFalKey } from "@/lib/env";
import { meshNodeDataSchema } from "@/lib/graph/types";
import { buildMeshRequest, pickMeshSlug } from "@/lib/fal/mesh";
import { persistRemoteAsset } from "@/lib/storage/persist-remote";
import { sha256 } from "@/lib/storage/hash";
import { pipelineDataSchema } from "./schema";
import { CHARACTER_ENDPOINTS, buildAnimationRequest, buildRemeshRequest, buildRigRequest, extractCharacterArtifacts, viewPrompts } from "./fal";
import { runBlender, type BlenderResult } from "./blender";
import { inspectGlb } from "./inspect";
import { makeZip } from "./zip";

export const pipelineRequestSchema = z.object({
  projectId: z.string().min(1), nodeId: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  inputRigEngine: z.enum(["meshy", "tripo"]).optional(),
  inputTripoRigTaskId: z.string().min(1).optional(),
  providerUrls: z.record(z.string(), z.url()).optional(),
  publicUrl: z.url().optional(),
  imageAssetIds: z.array(z.string()).max(14).default([]),
  meshAssetIds: z.array(z.string()).max(30).default([]),
  animationAssetIds: z.array(z.string()).max(10).default([]),
  viewNames: z.array(z.enum(["front", "left", "back", "right"])).max(4).optional(),
});
export type PipelineRequest = z.infer<typeof pipelineRequestSchema>;
export type JobOutput = { name: string; kind: string; assetId: string };
export type PipelineResult = { assets: JobOutput[]; outputAssetId: string | null; triangleCount?: number; boneNames?: string[]; rigEngine?: "meshy" | "tripo"; tripoRigTaskId?: string | null; rigTaskId?: string | null; budgetPass?: boolean; clips?: unknown[] };
export const RUNNABLE_KINDS = ["mesh", "multiview", "bake", "rig", "animate", "export"] as const;
export type RunnableKind = typeof RUNNABLE_KINDS[number];
const globalJobs = globalThis as typeof globalThis & { characterJobs?: Set<string> };
const active = globalJobs.characterJobs ??= new Set<string>();

export async function startCharacterJob(kind: RunnableKind, raw: unknown) {
  const request = pipelineRequestSchema.parse(raw);
  if (kind === "mesh") meshNodeDataSchema.parse(request.data); else pipelineDataSchema.parse(request.data);
  if (["mesh", "multiview"].includes(kind) ? !request.imageAssetIds.length : !request.meshAssetIds.length) throw new Error("Connect an input before running.");
  const job = await createJob({ projectId: request.projectId, nodeId: request.nodeId, provider: "local", providerJobId: `server-managed:${randomUUID()}`, providerSlug: `character/${kind}`, requestInput: request });
  active.add(job.jobId);
  void executeCharacterJob(kind, request, job.jobId).then(async (result) => {
    await completeJob({ id: job.jobId, state: "succeeded", responseSummary: result, outputAssetIds: result.assets.map((a) => a.assetId) });
  }).catch(async (error) => {
    await completeJob({ id: job.jobId, state: "failed", error: error instanceof Error ? error.message : "Character job failed." });
  }).finally(() => active.delete(job.jobId));
  return job;
}
export async function characterJobStatus(id: string) {
  await reconcileCodexJob(id);
  let job = await getJobById(id);
  if (!job) throw new Error("Job not found.");
  if (job.providerSlug.startsWith("character/") && ["queued", "running"].includes(job.state) && !active.has(id)) {
    await completeJob({ id, state: "failed", error: "Server restarted during this job. Review provider status before re-running a paid generation." });
    job = (await getJobById(id))!;
  }
  return { id: job.id, state: job.state, error: job.error, result: job.responseSummaryJson ? JSON.parse(job.responseSummaryJson) : null };
}

export async function executeCharacterJob(kind: RunnableKind, request: PipelineRequest, jobId: string): Promise<PipelineResult> {
  const d = pipelineDataSchema.parse(request.data);
  const directory = join(getServerEnv().ASSET_STORAGE_PATH, "character-jobs", jobId);
  await mkdir(directory, { recursive: true });
  const assets: JobOutput[] = [];
  let metadata: Omit<PipelineResult, "assets" | "outputAssetId"> = {};
  async function progress(value: number, status: string) { await updateJobProgress(jobId, value, status); }
  async function asset(id: string) { const a = await getAssetById(id); if (!a) throw new Error(`Input asset ${id} not found.`); return a; }
  const uploaded = new Map<string, string>();
  async function url(id: string) {
    const a = await asset(id);
    const known = request.providerUrls?.[id] ?? a.sourceUrl;
    if (known) return known;
    const served = request.publicUrl ? new URL(`/api/assets/${encodeURIComponent(id)}`, request.publicUrl).toString() : null;
    if (served && !isPrivateUrl(served)) return served;
    // Locally made files (e.g. a Blender bake) have no public URL; providers fetch them from fal storage.
    const cached = uploaded.get(id);
    if (cached) return cached;
    fal.config({ credentials: getFalKey() });
    // Providers such as Meshy read the format from the URL's extension, so keep the real file name.
    const extension = a.localPath.split(".").pop()?.toLowerCase() || "bin";
    const stored = await fal.storage.upload(new File([await readFile(a.localPath)], `${id}.${extension}`, { type: a.mimeType }));
    uploaded.set(id, stored);
    return stored;
  }
  /**
   * Tripo multi-view slots are [front, left, back, right]. Verified in real runs: Tripo's "left" slot wants the
   * profile facing screen left, which is the character's right side (Multi-view's "right" view). A mirrored
   * profile there leaves a ghost face on the back of the head, so nothing is mirrored.
   */
  async function tripoViewUrls(names: string[], ids: string[]) {
    const byName = new Map(names.map((n, i) => [n, ids[i]]));
    const front = byName.get("front");
    if (!front) throw new Error("Tripo multi-view needs a front view.");
    const facingScreenLeft = byName.get("right"), facingScreenRight = byName.get("left"), back = byName.get("back");
    if (!facingScreenLeft) return [await url(front)];
    return [await url(front), await url(facingScreenLeft), ...(back ? [await url(back)] : []), ...(back && facingScreenRight ? [await url(facingScreenRight)] : [])];
  }
  async function local(id: string) {
    const a = await asset(id);
    const ext = a.mimeType === "model/gltf-binary" || /glb/.test(a.kind) ? "glb" : /fbx/.test(a.kind) ? "fbx" : a.originalFileName?.split(".").pop()?.toLowerCase() ?? a.localPath.split(".").pop();
    if (!["glb", "fbx", "bvh"].includes(ext ?? "")) throw new Error("Input must be GLB, FBX or BVH.");
    const path = join(directory, `${id}.${ext}`); await copyFile(a.localPath, path); return path;
  }
  async function saveLocal(file: BlenderResult["files"][number]) {
    if (!resolve(file.path).startsWith(resolve(directory) + "/")) throw new Error("Blender returned a path outside its output directory.");
    const buffer = await readFile(file.path);
    const mime = ({ image: "image/png", glb: "model/gltf-binary", fbx: "application/octet-stream", texture: "image/png", manifest: "application/json", zip: "application/zip" } as Record<string, string>)[file.kind] ?? "application/octet-stream";
    const hash = sha256(buffer);
    // A rerun can produce a byte-identical file (same clip, same settings); reuse that asset.
    const saved = (await getAssetBySha(hash, buffer.length)) ?? await createAssetRecord({ jobId, kind: file.kind, mimeType: mime, localPath: file.path, sha256: hash, bytes: buffer.length, originalFileName: basename(file.path) });
    if (!saved) throw new Error("Could not save output.");
    assets.push({ name: file.name, kind: file.kind, assetId: saved.id });
  }
  async function blender(script: "bake" | "retarget" | "export", args: Record<string, unknown>, suffix: string = script) {
    let writes = Promise.resolve();
    const result = await runBlender(script, args, join(directory, suffix), (p, s) => { writes = writes.then(() => progress(p, s)); });
    await writes;
    for (const file of result.files) await saveLocal({ ...file, name: suffix.startsWith("custom-") ? `${suffix}-${file.kind}` : file.name });
    const { files: _files, ...rest } = result; void _files; metadata = { ...metadata, ...rest };
  }
  function tripoClient() {
    return new TripoClient({ onProgress: progress, onTask: async (taskId, endpoint) => {
      await writeFile(join(directory, `tripo-${taskId}.json`), JSON.stringify({ taskId, endpoint }));
    } });
  }
  async function saveTripoPair(client: TripoClient, task: import("@/lib/tripo/client").TripoTask, name: string) {
    const glb = tripoArtifact(task, "glb", name);
    const saved = await persistRemoteAsset({ ...glb, jobId });
    if (!saved) throw new Error(`Could not persist ${glb.name}`);
    assets.push({ name: glb.name, kind: glb.kind, assetId: saved.id });
    const fbx = tripoArtifact(await client.convertFbx(glb.sourceUrl), "fbx", name);
    const savedFbx = await persistRemoteAsset({ ...fbx, jobId });
    if (!savedFbx) throw new Error(`Could not persist ${fbx.name}`);
    assets.push({ name: fbx.name, kind: fbx.kind, assetId: savedFbx.id });
  }
  async function generate(slug: string, input: Record<string, unknown>, prefix = "") {
    fal.config({ credentials: getFalKey() });
    await progress(5, `Submitting ${slug}`);
    const submission = await fal.queue.submit(slug, { input });
    // Persist request IDs immediately for reconciliation after an interrupted server.
    await writeFile(join(directory, `provider-${Date.now()}.json`), JSON.stringify({ slug, requestId: submission.request_id }));
    const deadline = Date.now() + 30 * 60 * 1000;
    while (true) {
      // A dropped connection while polling must not fail a job the provider is still running (and billing).
      const status = await withRetries(() => fal.queue.status(slug, { requestId: submission.request_id, logs: true }));
      if (status.status === "COMPLETED") break;
      if (Date.now() > deadline) throw new Error("Provider polling timed out; the provider may still finish. Do not blindly rerun.");
      await progress(20, status.status); await new Promise((r) => setTimeout(r, 2000));
    }
    const result = await withRetries(() => fal.queue.result(slug, { requestId: submission.request_id }));
    const data = result.data as Record<string, unknown>;
    if (typeof data.rig_task_id === "string") metadata.rigTaskId = data.rig_task_id;
    for (const file of extractCharacterArtifacts(data)) {
      const saved = await persistRemoteAsset({ sourceUrl: file.sourceUrl, kind: file.kind, jobId });
      if (!saved) throw new Error(`Could not persist ${file.name}`);
      assets.push({ name: prefix || file.name, kind: file.kind, assetId: saved.id });
    }
  }
  const inputId = request.meshAssetIds[0];
  switch (kind) {
    case "mesh": {
      const mesh = meshNodeDataSchema.parse(request.data);
      const images = request.viewNames && mesh.provider === "tripo-h31" && (mesh as { tripoMultiview?: boolean }).tripoMultiview
        ? await tripoViewUrls(request.viewNames, request.imageAssetIds)
        : await Promise.all(request.imageAssetIds.map(url));
      await generate(pickMeshSlug(mesh.mode, mesh.provider, mesh), buildMeshRequest({ ...mesh, imageUrls: images }));
      break;
    }
    case "multiview": {
      const views = viewPrompts(d.includeBack, d.equipment);
      for (const [index, view] of views.entries()) {
        if (d.imageModel === "codex/gpt-image") {
          await progress(Math.round(index / views.length * 90), `Codex image ${index + 1}/${views.length}: ${view.name}`);
          const path = await generateCodexImage({ prompt: view.prompt, referencePaths: [(await asset(request.imageAssetIds[0])).localPath], aspectRatio: "3:4", workDir: join(directory, `view-${index}`) });
          await saveLocal({ name: view.name, kind: "image", path });
        } else await generate(CHARACTER_ENDPOINTS.multiview, { prompt: view.prompt, image_urls: [await url(request.imageAssetIds[0])], aspect_ratio: "3:4", resolution: "1K", num_images: 1 }, view.name);
      }
      break;
    }
    case "bake":
      if (d.engine === "tripo") await generate(CHARACTER_ENDPOINTS.remesh, buildRemeshRequest(await url(inputId), d.targetTriangles, d.quad));
      else await blender("bake", { input: await local(inputId), targetTriangles: d.targetTriangles, keepUvs: d.keepUvs, textureSize: d.textureSize, turnDegrees: d.turnDegrees });
      break;
    case "rig":
      if (d.engine === "tripo") {
        const tripo = tripoClient();
        await progress(0, "Tripo upload");
        const source = await tripo.uploadGlb(await readFile(await local(inputId)));
        await tripo.rigCheck(source);
        const rig = await tripo.rig(source);
        metadata = { rigEngine: "tripo", tripoRigTaskId: rig.task_id };
        await saveTripoPair(tripo, rig, "rigged-character");
        break;
      }
      metadata.rigEngine = "meshy";
      await generate(CHARACTER_ENDPOINTS.rig, buildRigRequest(await url(inputId), d.heightMeters)); break;
    case "animate":
      if (request.inputRigEngine === "tripo") {
        if (!request.inputTripoRigTaskId) throw new Error("Tripo animation needs the upstream Tripo rig task ID. Run Rig again.");
        if (!d.tripoPresetIds.length && !request.animationAssetIds.length) throw new Error("Select a preset or connect a custom animation.");
        if (d.tripoPresetIds.length) {
          const tripo = tripoClient();
          for (const preset of new Set(d.tripoPresetIds)) await saveTripoPair(tripo, await tripo.retarget(request.inputTripoRigTaskId, preset), `animations-tripo-${preset.slice(7)}`);
        }
        metadata = { rigEngine: "tripo", tripoRigTaskId: request.inputTripoRigTaskId };
      } else {
        if (!d.presetIds.length && !request.animationAssetIds.length) throw new Error("Select a preset or connect a custom animation.");
        if (d.presetIds.length) await generate(CHARACTER_ENDPOINTS.animate, buildAnimationRequest(await url(inputId), d.heightMeters, d.presetIds));
      }
      for (const [i, clip] of request.animationAssetIds.entries()) await blender("retarget", { input: await local(assets.find((a) => a.kind === "glb" && /rigged_character/.test(a.name))?.assetId ?? inputId), clip: await local(clip) }, `custom-${i}`);
      break;
    case "export":
      await blender("export", { inputs: await Promise.all(request.meshAssetIds.map(async (id, i) => ({ path: await local(id), name: `character-${i}` }))), target: d.target, characterName: d.characterName, triangleBudget: d.triangleBudget });
      break;
  }
  // Quad providers may return only FBX. Make an actual GLB for downstream rigging/viewing.
  if (kind !== "multiview" && !assets.some((a) => a.kind === "glb") && assets.some((a) => a.kind === "fbx")) {
    await blender("export", { input: await local(assets.find((a) => a.kind === "fbx")!.assetId), convertOnly: true }, "convert");
  }
  if (kind === "animate") {
    const clips = assets.filter((a) => a.kind === "glb" && /animations|custom/.test(a.name) && !/basic_animations/.test(a.name));
    if (clips.length) {
      const path = join(directory, "combined.glb");
      await combineAnimationGlbs(await Promise.all(clips.map(async (a) => ({ path: (await asset(a.assetId)).localPath, name: clipDisplayName(a.name, d.presetIds) }))), path);
      await saveLocal({ name: "combined-glb", kind: "glb", path });
    }
  }
  const glb = assets.find((a) => a.name === "combined-glb") ?? (kind === "animate" ? assets.find((a) => a.kind === "glb" && /animations|custom/.test(a.name) && !/basic_animations/.test(a.name)) : undefined) ?? assets.find((a) => a.kind === "glb" && /rigged|pbr|model_mesh|model-glb/.test(a.name)) ?? assets.find((a) => a.kind === "glb");
  if (glb) metadata = { ...metadata, ...inspectGlb(await readFile((await asset(glb.assetId)).localPath)) };
  if (kind !== "multiview" && !glb) throw new Error("Provider did not return a usable mesh.");
  if (kind === "multiview" && !assets.length) throw new Error("Provider did not return images.");
  if (["animate", "export"].includes(kind)) {
    const files = await Promise.all(assets.map(async (a, i) => ({ name: `${i}-${a.name}.${a.kind === "manifest" ? "json" : a.kind}`, data: await readFile((await asset(a.assetId)).localPath) })));
    const path = join(directory, "all-clips.zip"); await writeFile(path, makeZip(files)); await saveLocal({ name: "all-clips", kind: "zip", path });
  }
  return { ...metadata, assets, outputAssetId: glb?.assetId ?? null };
}

export function isPrivateUrl(value: string) {
  const host = new URL(value).hostname.toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

/** Meshy returns clips as animations-<index>-…; name them after the preset that was asked for. */
export function clipDisplayName(assetName: string, presetIds: number[]) {
  const index = /^animations-(\d+)-/.exec(assetName)?.[1];
  const preset = index === undefined ? undefined : ANIMATION_PRESETS.find((p) => p.id === presetIds[Number(index)]);
  return preset?.name ?? assetName;
}
