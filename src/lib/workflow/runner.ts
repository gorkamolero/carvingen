import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { fal } from "@fal-ai/client";
import { extension, lookup } from "mime-types";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { buildImageRequest, pickImageSlug } from "@/lib/fal/image";
import { buildMeshRequest, extractMeshArtifacts, pickMeshSlug } from "@/lib/fal/mesh";
import { buildVideoRequest, extractVideoUrl, pickVideoSlug } from "@/lib/fal/video";
import { buildVisionRequest, extractVisionAnswer, pickVisionSlug } from "@/lib/fal/vision";
import { getHandleKind } from "@/lib/graph/connections";
import { validateProjectGraph } from "@/lib/graph/serialization";
import {
  createImageNodeData,
  createMeshNodeData,
  createPromptNodeData,
  createVideoNodeData,
  createVisionNodeData,
  createViewerNodeData,
  type CarvingEdge,
  type CarvingNode,
  type EdgeKind,
  type ImageNodeData,
  type ProjectGraph,
} from "@/lib/graph/types";
import { ApiError } from "@/lib/http/errors";
import { getAssetUrl } from "@/lib/assets/url";
import { writeFileIfMissing } from "@/lib/storage/files";
import { sha256 } from "@/lib/storage/hash";
import { buildAssetPath } from "@/lib/storage/paths";
import { normalizeUpload } from "@/lib/storage/uploads";

const positionSchema = z.object({ x: z.number(), y: z.number() });
const viewportSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().default(1),
});

const workflowAssetSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  kind: z.string().default("image"),
});

const workflowNodeSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(["image", "prompt", "vision", "video", "mesh", "viewer"]),
  position: positionSchema.default({ x: 0, y: 0 }),
  asset: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  run: z.boolean().optional().default(false),
});

const workflowEdgeSchema = z.object({
  id: z.string().min(1).optional(),
  source: z.string().min(1),
  sourceHandle: z.string().min(1),
  target: z.string().min(1),
  targetHandle: z.string().min(1),
});

export const workflowSchema = z.object({
  project: z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).default("Workflow project"),
    mode: z.enum(["create", "update"]).default("create"),
  }),
  assets: z.array(workflowAssetSchema).optional().default([]),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema).optional().default([]),
  viewport: viewportSchema.default({ x: 0, y: 0, zoom: 1 }),
});

export type WorkflowDefinition = z.infer<typeof workflowSchema>;
export type WorkflowAsset = z.infer<typeof workflowAssetSchema>;
export type WorkflowNodeDefinition = z.infer<typeof workflowNodeSchema>;

export type UploadedWorkflowAsset = {
  id: string;
  assetId: string;
  url: string;
  providerUrl?: string;
  path: string;
  kind: string;
};

export type WorkflowRunOptions = {
  baseUrl?: string;
  publicUrl?: string;
  dryRun?: boolean;
  cwd?: string;
  falStorageInputs?: boolean;
};

export type WorkflowSummary = {
  projectId: string;
  projectName: string;
  dryRun: boolean;
  nodesRun: string[];
  outputs: Record<string, Array<{ assetId: string; kind: string; url: string }>>;
  graph: ProjectGraph;
};

type RunContext = {
  projectId: string;
  projectName: string;
  graph: ProjectGraph;
  publicUrl: string;
  providerUrlsByAssetId: Map<string, string>;
  nodesRun: string[];
  outputs: WorkflowSummary["outputs"];
};

type FalQueueStatus = {
  status: string;
};

export async function loadWorkflowDefinition(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return parseWorkflowDefinition(JSON.parse(raw));
}

export function parseWorkflowDefinition(input: unknown) {
  return workflowSchema.parse(input);
}

export function buildWorkflowGraph(input: {
  workflow: WorkflowDefinition;
  projectId: string;
  projectName?: string;
  assetsById?: Map<string, UploadedWorkflowAsset>;
  dryRun?: boolean;
}): ProjectGraph {
  const idMap = new Map<string, string>();
  const nodes = input.workflow.nodes.map((definition, index) => {
    const nodeId = getWorkflowGraphNodeId(definition, input.projectId, input.dryRun ?? false);
    if (definition.id) {
      idMap.set(definition.id, nodeId);
    }

    return createWorkflowNode({
      definition,
      nodeId,
      fallbackIndex: index,
      assetsById: input.assetsById ?? new Map(),
      dryRun: input.dryRun ?? false,
    });
  });

  const edges = input.workflow.edges.map((edge) => {
    const source = idMap.get(edge.source) ?? edge.source;
    const target = idMap.get(edge.target) ?? edge.target;
    const kind = getHandleKind(edge.sourceHandle) ?? getHandleKind(edge.targetHandle);
    if (!kind) {
      throw new ApiError(400, `Unable to infer edge kind for ${edge.sourceHandle} -> ${edge.targetHandle}.`);
    }

    return {
      id: edge.id ?? `${source}-${edge.sourceHandle}-${target}-${edge.targetHandle}`,
      source,
      sourceHandle: edge.sourceHandle,
      target,
      targetHandle: edge.targetHandle,
      data: { kind: kind as EdgeKind },
    } satisfies CarvingEdge;
  });

  return validateProjectGraph({
    id: input.projectId,
    name: input.projectName ?? input.workflow.project.name,
    nodes,
    edges,
    viewport: input.workflow.viewport,
  });
}

export async function runWorkflow(workflow: WorkflowDefinition, options: WorkflowRunOptions = {}) {
  const publicUrl = normalizeBaseUrl(options.publicUrl ?? process.env.PUBLIC_URL ?? options.baseUrl ?? "http://127.0.0.1:3001");
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;

  const assetsById = dryRun
    ? createDryRunAssets(workflow.assets, publicUrl)
    : await uploadWorkflowAssets(workflow.assets, cwd, { falStorageInputs: options.falStorageInputs ?? false });

  const project = dryRun
    ? { id: workflow.project.id ?? "dry-run-project", name: workflow.project.name }
    : await resolveProject(workflow);

  const graph = buildWorkflowGraph({
    workflow,
    projectId: project.id,
    projectName: project.name,
    assetsById,
    dryRun,
  });

  if (dryRun) {
    return {
      projectId: graph.id,
      projectName: graph.name,
      dryRun: true,
      nodesRun: [],
      outputs: {},
      graph,
    } satisfies WorkflowSummary;
  }

  const { saveProjectGraph } = await import("@/lib/db/repositories/projects");
  await saveProjectGraph(graph);

  const context: RunContext = {
    projectId: graph.id,
    projectName: graph.name,
    graph,
    publicUrl,
    providerUrlsByAssetId: createProviderUrlMap(assetsById),
    nodesRun: [],
    outputs: {},
  };

  for (const nodeId of getRunnableNodeIds(workflow, project.id, dryRun)) {
    const node = context.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      throw new ApiError(400, `Runnable node ${nodeId} was not found in the graph.`);
    }

    await runNode(context, node);
    await saveProjectGraph(context.graph);
  }

  await saveProjectGraph(context.graph);

  return {
    projectId: context.projectId,
    projectName: context.projectName,
    dryRun: false,
    nodesRun: context.nodesRun,
    outputs: context.outputs,
    graph: context.graph,
  } satisfies WorkflowSummary;
}

async function resolveProject(workflow: WorkflowDefinition) {
  const { createProject, loadProject } = await import("@/lib/db/repositories/projects");
  if (workflow.project.mode === "update") {
    if (!workflow.project.id) {
      throw new ApiError(400, "project.id is required when project.mode is update.");
    }
    return loadProject(workflow.project.id);
  }

  return createProject(workflow.project.name);
}

function createWorkflowNode(input: {
  definition: WorkflowNodeDefinition;
  nodeId: string;
  fallbackIndex: number;
  assetsById: Map<string, UploadedWorkflowAsset>;
  dryRun: boolean;
}) {
  const { definition, nodeId, fallbackIndex } = input;
  const position = definition.position ?? { x: 160 + fallbackIndex * 360, y: 180 };

  switch (definition.type) {
    case "image": {
      const asset = definition.asset ? input.assetsById.get(definition.asset) : null;
      if (definition.asset && !asset) {
        throw new ApiError(400, `Unknown asset reference ${definition.asset} for image node ${definition.id ?? nodeId}.`);
      }

      return {
        id: nodeId,
        type: "image",
        position,
        data: {
          ...createImageNodeData(),
          ...definition.data,
          assetId: asset?.assetId ?? null,
          previewUrl: asset?.url ?? null,
          fileName: asset ? basename(asset.path) : null,
        } satisfies ImageNodeData,
      } satisfies CarvingNode;
    }
    case "prompt":
      return {
        id: nodeId,
        type: "prompt",
        position,
        data: { ...createPromptNodeData(), ...definition.data },
      } satisfies CarvingNode;
    case "vision":
      return {
        id: nodeId,
        type: "vision",
        position,
        data: { ...createVisionNodeData(), ...definition.data },
      } satisfies CarvingNode;
    case "video":
      return {
        id: nodeId,
        type: "video",
        position,
        data: { ...createVideoNodeData(), ...definition.data },
      } satisfies CarvingNode;
    case "mesh":
      return {
        id: nodeId,
        type: "mesh",
        position,
        data: { ...createMeshNodeData(), ...definition.data },
      } satisfies CarvingNode;
    case "viewer":
      return {
        id: nodeId,
        type: "viewer",
        position,
        data: { ...createViewerNodeData(), ...definition.data },
      } satisfies CarvingNode;
  }
}

async function uploadWorkflowAssets(
  assets: WorkflowAsset[],
  cwd: string,
  options: { falStorageInputs: boolean },
) {
  const out = new Map<string, UploadedWorkflowAsset>();

  for (const asset of assets) {
    const path = resolve(cwd, asset.path);
    const uploaded = await uploadLocalImage(path);
    const providerUrl = options.falStorageInputs ? await uploadFalStorageInput(path) : undefined;
    out.set(asset.id, {
      id: asset.id,
      assetId: uploaded.assetId,
      url: uploaded.url,
      providerUrl,
      path,
      kind: asset.kind,
    });
  }

  return out;
}

async function uploadFalStorageInput(path: string) {
  fal.config({ credentials: getServerEnv().FAL_KEY });
  const buffer = await readFile(path);
  const mimeType = lookup(path) || "application/octet-stream";
  const file = new File([buffer], basename(path), { type: mimeType });
  return fal.storage.upload(file);
}

function createProviderUrlMap(assetsById: Map<string, UploadedWorkflowAsset>) {
  const out = new Map<string, string>();
  for (const asset of assetsById.values()) {
    if (asset.providerUrl) {
      out.set(asset.assetId, asset.providerUrl);
    }
  }
  return out;
}

function createDryRunAssets(assets: WorkflowAsset[], publicUrl: string) {
  const out = new Map<string, UploadedWorkflowAsset>();

  for (const asset of assets) {
    const assetId = `dry-${asset.id}`;
    out.set(asset.id, {
      id: asset.id,
      assetId,
      url: new URL(getAssetUrl(assetId), publicUrl).toString(),
      path: asset.path,
      kind: asset.kind,
    });
  }

  return out;
}

async function uploadLocalImage(path: string) {
  const { createAssetRecord, getAssetBySha } = await import("@/lib/db/repositories/assets");
  const buffer = await readFile(path);
  const mimeType = lookup(path) || "application/octet-stream";
  const file = new File([buffer], basename(path), { type: mimeType });
  const normalized = await normalizeUpload(file);
  const hash = sha256(normalized.buffer);
  const existing = await getAssetBySha(hash, normalized.buffer.byteLength);

  if (existing) {
    return { assetId: existing.id, url: existing.url };
  }

  const ext = normalized.extension || `.${extension(normalized.mimeType) ?? "bin"}`;
  const localPath = buildAssetPath("image-upload", `${hash}${ext}`);
  await writeFileIfMissing(localPath, normalized.buffer);

  const asset = await createAssetRecord({
    id: nanoid(),
    kind: "image",
    mimeType: normalized.mimeType,
    localPath,
    sourceUrl: null,
    sha256: hash,
    bytes: normalized.buffer.byteLength,
    originalFileName: basename(path),
    width: null,
    height: null,
  });

  if (!asset) {
    throw new Error(`Failed to create asset for ${path}.`);
  }

  return { assetId: asset.id, url: asset.url };
}

function getRunnableNodeIds(workflow: WorkflowDefinition, projectId: string, dryRun: boolean) {
  const runnable = new Set(workflow.nodes.filter((node) => node.run).map((node) => node.id).filter(Boolean));
  const ordered: string[] = [];

  for (const node of topologicalSort(workflow)) {
    if (node.id && runnable.has(node.id)) {
      ordered.push(getWorkflowGraphNodeId(node, projectId, dryRun));
    }
  }

  return ordered;
}

function getWorkflowGraphNodeId(definition: WorkflowNodeDefinition, projectId: string, dryRun: boolean) {
  if (!definition.id) {
    return nanoid();
  }
  return dryRun ? definition.id : `${projectId}-${definition.id}`;
}

function topologicalSort(workflow: WorkflowDefinition) {
  const nodes = [...workflow.nodes];
  const byId = new Map(nodes.map((node) => [node.id, node]).filter((entry): entry is [string, WorkflowNodeDefinition] => typeof entry[0] === "string"));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.id) {
      indegree.set(node.id, 0);
      outgoing.set(node.id, []);
    }
  }

  for (const edge of workflow.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  const sortedIds: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    sortedIds.push(id);
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }

  if (sortedIds.length !== indegree.size) {
    throw new ApiError(400, "Workflow graph contains a cycle.");
  }

  const sorted = sortedIds.map((id) => byId.get(id)!).filter(Boolean);
  const anonymous = nodes.filter((node) => !node.id);
  return [...sorted, ...anonymous];
}

async function runNode(context: RunContext, node: CarvingNode) {
  switch (node.type) {
    case "prompt":
      return runPromptNode(context, node);
    case "video":
      return runVideoNode(context, node);
    case "mesh":
      return runMeshNode(context, node);
    case "vision":
      return runVisionNode(context, node);
    default:
      throw new ApiError(400, `${node.type} nodes are not runnable.`);
  }
}

async function runPromptNode(context: RunContext, node: Extract<CarvingNode, { type: "prompt" }>) {
  const { persistRemoteAsset } = await import("@/lib/storage/persist-remote");
  const { completeJob } = await import("@/lib/db/repositories/jobs");
  const referenceImages = getIncomingImageUrlsForNode(context, node.id);
  const slug = pickImageSlug(node.data.model, referenceImages);
  const input = buildImageRequest({
    modelBase: node.data.model,
    prompt: node.data.text,
    referenceImages,
    aspectRatio: node.data.aspectRatio,
    resolution: node.data.resolution,
    seed: node.data.seed,
  });
  const result = await submitFalJob(context, node.id, slug, input);
  const imageUrl = (result.data as { images?: Array<{ url?: string }> }).images?.[0]?.url;
  if (!imageUrl) {
    throw new Error(`Prompt node ${node.id} did not return an image URL.`);
  }

  const asset = await persistRemoteAsset({ sourceUrl: imageUrl, kind: "image", jobId: result.jobId });
  if (!asset) {
    throw new Error(`Failed to persist image output for node ${node.id}.`);
  }
  // fal fetches reference inputs itself, so later nodes must get the fal URL, not a localhost asset URL it cannot reach.
  context.providerUrlsByAssetId.set(asset.id, imageUrl);
  node.data.outputAssetIds = [...node.data.outputAssetIds, asset.id];
  node.data.activeAssetId = asset.id;
  node.data.activeJobId = null;
  node.data.inputsChangedSinceLastRun = false;
  node.data.runStatus = null;
  node.data.errorMessage = null;
  await completeJob({
    id: result.jobId,
    state: "succeeded",
    responseSummary: result.data as Record<string, unknown>,
    outputAssetIds: [asset.id],
  });
  context.nodesRun.push(node.id);
  addOutput(context, node.id, "image", asset.id);
}

async function runVideoNode(context: RunContext, node: Extract<CarvingNode, { type: "video" }>) {
  const { persistRemoteAsset } = await import("@/lib/storage/persist-remote");
  const { completeJob } = await import("@/lib/db/repositories/jobs");
  const capabilityImageLimit = node.data.mode === "text" ? 0 : undefined;
  const imageUrls = getIncomingImageUrlsForNode(context, node.id);
  const input = buildVideoRequest({
    model: node.data.model,
    mode: node.data.mode,
    tier: node.data.tier,
    prompt: node.data.text,
    imageUrls: typeof capabilityImageLimit === "number" ? [] : imageUrls,
    aspectRatio: node.data.aspectRatio,
    resolution: node.data.resolution,
    duration: node.data.duration,
    generateAudio: node.data.generateAudio,
    seed: node.data.seed,
  });
  const slug = pickVideoSlug({ model: node.data.model, mode: node.data.mode, tier: node.data.tier });
  const result = await submitFalJob(context, node.id, slug, input);
  const videoUrl = extractVideoUrl(result);
  if (!videoUrl) {
    throw new Error(`Video node ${node.id} did not return a video URL.`);
  }

  const asset = await persistRemoteAsset({ sourceUrl: videoUrl, kind: "video", jobId: result.jobId });
  if (!asset) {
    throw new Error(`Failed to persist video output for node ${node.id}.`);
  }
  node.data.outputAssetIds = [...node.data.outputAssetIds, asset.id];
  node.data.activeAssetId = asset.id;
  node.data.lastRunSeed = (result.data as { seed?: number }).seed ?? null;
  node.data.activeJobId = null;
  node.data.inputsChangedSinceLastRun = false;
  node.data.runStatus = null;
  node.data.errorMessage = null;
  await completeJob({
    id: result.jobId,
    state: "succeeded",
    responseSummary: result.data as Record<string, unknown>,
    outputAssetIds: [asset.id],
  });
  context.nodesRun.push(node.id);
  addOutput(context, node.id, "video", asset.id);
}

async function runMeshNode(context: RunContext, node: Extract<CarvingNode, { type: "mesh" }>) {
  const { persistRemoteAsset } = await import("@/lib/storage/persist-remote");
  const { completeJob } = await import("@/lib/db/repositories/jobs");
  const imageUrls = getIncomingImageUrlsForNode(context, node.id);
  const provider = node.data.provider ?? "meshy";
  const slug = pickMeshSlug(node.data.mode, provider, {
    meshyUseMultiview: node.data.meshyUseMultiview,
  });
  const input = buildMeshRequest({
    imageUrls,
    mode: node.data.mode,
    provider,
    meshyUseMultiview: node.data.meshyUseMultiview,
    meshyPolyMode: node.data.meshyPolyMode,
    meshyTopology: node.data.meshyTopology,
    meshyTargetPolycount: node.data.meshyTargetPolycount,
    meshySymmetryMode: node.data.meshySymmetryMode,
    meshyShouldRemesh: node.data.meshyShouldRemesh,
    meshyShouldTexture: node.data.meshyShouldTexture,
    meshyEnablePbr: node.data.meshyEnablePbr,
    meshyPoseMode: node.data.meshyPoseMode,
    meshyEnableRigging: node.data.meshyEnableRigging,
    meshyRiggingHeightMeters: node.data.meshyRiggingHeightMeters,
    meshyEnableAnimation: node.data.meshyEnableAnimation,
    meshyAnimationActionId: node.data.meshyAnimationActionId,
    hunyuanViewSlots: node.data.hunyuanViewSlots,
    hunyuanGenerateType: node.data.hunyuanGenerateType,
    hunyuanEnablePbr: node.data.hunyuanEnablePbr,
    hunyuanFaceCount: node.data.hunyuanFaceCount,
  });
  const result = await submitFalJob(context, node.id, slug, input);
  const artifacts = extractMeshArtifacts(result);
  const saved = await Promise.all(
    artifacts.map(async (artifact) => {
      const asset = await persistRemoteAsset({
        sourceUrl: artifact.sourceUrl,
        kind: artifact.kind,
        jobId: result.jobId,
      });
      if (!asset) {
        throw new Error(`Failed to persist ${artifact.kind} output for node ${node.id}.`);
      }
      return { kind: artifact.kind, assetId: asset.id };
    }),
  );

  const byKind = Object.fromEntries(saved.map((asset) => [asset.kind, asset.assetId]));
  node.data.outputAssetId = byKind.glb ?? null;
  node.data.thumbnailAssetId = byKind.thumbnail ?? null;
  node.data.artifactAssetIds = byKind;
  node.data.activeJobId = null;
  node.data.inputsChangedSinceLastRun = false;
  node.data.runStatus = null;
  node.data.errorMessage = null;
  await completeJob({
    id: result.jobId,
    state: "succeeded",
    responseSummary: result.data as Record<string, unknown>,
    outputAssetIds: saved.map((asset) => asset.assetId),
  });
  context.nodesRun.push(node.id);

  for (const asset of saved) {
    addOutput(context, node.id, asset.kind, asset.assetId);
  }
}

async function runVisionNode(context: RunContext, node: Extract<CarvingNode, { type: "vision" }>) {
  const { completeJob } = await import("@/lib/db/repositories/jobs");
  const imageUrls = getIncomingImageUrlsForNode(context, node.id);
  const slug = pickVisionSlug();
  const input = buildVisionRequest({
    prompt: node.data.question,
    imageUrls,
    model: node.data.model,
  });
  const result = await submitFalJob(context, node.id, slug, input);
  const answer = extractVisionAnswer(result);
  node.data.answer = answer.answer;
  node.data.lastRunCost = answer.cost;
  node.data.activeJobId = null;
  node.data.inputsChangedSinceLastRun = false;
  node.data.runStatus = null;
  node.data.errorMessage = null;
  await completeJob({
    id: result.jobId,
    state: "succeeded",
    responseSummary: result.data as Record<string, unknown>,
  });
  context.nodesRun.push(node.id);
  context.outputs[node.id] = [{ assetId: "", kind: "text", url: "" }];
}

async function submitFalJob(context: RunContext, nodeId: string, slug: string, input: Record<string, unknown>) {
  const { completeJob, createJob, markJobRunning } = await import("@/lib/db/repositories/jobs");
  fal.config({ credentials: getServerEnv().FAL_KEY });
  const submission = await fal.queue.submit(slug, { input });
  const job = await createJob({
    projectId: context.projectId,
    nodeId,
    provider: "fal",
    providerJobId: submission.request_id,
    providerSlug: slug,
    requestInput: input,
  });
  await markJobRunning(job.jobId);

  let status = (await fal.queue.status(slug, {
    requestId: submission.request_id,
    logs: true,
  })) as FalQueueStatus;

  while (status.status !== "COMPLETED" && status.status !== "FAILED") {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    status = (await fal.queue.status(slug, {
      requestId: submission.request_id,
      logs: true,
    })) as FalQueueStatus;
  }

  if (status.status === "FAILED") {
    await completeJob({ id: job.jobId, state: "failed", error: "fal generation failed" });
    throw new Error(`fal generation failed for ${slug}.`);
  }

  const result = await fal.queue.result(slug, { requestId: submission.request_id });
  return { ...result, jobId: job.jobId };
}

function getIncomingImageUrlsForNode(context: RunContext, nodeId: string) {
  const assetIds = context.graph.edges
    .filter((edge) => edge.target === nodeId && edge.targetHandle === "image-in")
    .map((edge) => context.graph.nodes.find((node) => node.id === edge.source))
    .map((node) => (node ? getNodeImageAssetId(node) : null))
    .filter((assetId): assetId is string => typeof assetId === "string" && assetId.length > 0);

  return Array.from(new Set(assetIds)).map(
    (assetId) => context.providerUrlsByAssetId.get(assetId) ?? new URL(getAssetUrl(assetId), context.publicUrl).toString(),
  );
}

function getNodeImageAssetId(node: CarvingNode) {
  if (node.type === "image") {
    return node.data.assetId;
  }
  if (node.type === "prompt") {
    const active = node.data.activeAssetId;
    return active && node.data.outputAssetIds.includes(active)
      ? active
      : node.data.outputAssetIds.at(-1) ?? null;
  }
  return null;
}

function addOutput(context: RunContext, nodeId: string, kind: string, assetId: string) {
  context.outputs[nodeId] = [
    ...(context.outputs[nodeId] ?? []),
    { assetId, kind, url: getAssetUrl(assetId) },
  ];
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
