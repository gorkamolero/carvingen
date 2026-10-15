import type { Edge, Node, Viewport } from "@xyflow/react";
import { z } from "zod";

import {
  VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, VIDEO_DURATIONS,
  IMAGE_ASPECT_RATIOS,
  IMAGE_MODEL_BASES,
  IMAGE_RESOLUTIONS,
  type MeshMode,
  VISION_MODEL_VALUES,
} from "@/lib/fal/models";

export const nodeTypeSchema = z.enum(["prompt", "image", "mesh", "viewer", "vision", "video"]);
export const handleIdSchema = z.enum(["image-in", "image-out", "glb-in", "glb-out"]);

const promptVersionSnapshotSchema = z.object({
  prompt: z.string(),
  model: z.enum(IMAGE_MODEL_BASES),
  aspectRatio: z.enum(IMAGE_ASPECT_RATIOS),
  resolution: z.enum(IMAGE_RESOLUTIONS),
  seed: z.number().int().nullable().optional(),
  referenceAssetIds: z.array(z.string()).optional().default([]),
  createdAt: z.number().optional(),
});

export type PromptVersionSnapshot = z.infer<typeof promptVersionSnapshotSchema>;

export const promptNodeDataSchema = z.object({
  text: z.string(),
  model: z.enum(IMAGE_MODEL_BASES),
  aspectRatio: z.enum(IMAGE_ASPECT_RATIOS),
  resolution: z.enum(IMAGE_RESOLUTIONS),
  seed: z.number().int().nullable().optional(),
  activeJobId: z.string().nullable(),
  outputAssetIds: z.array(z.string()),
  // Which asset id is "active" — shown in the big output slot AND
  // resolved as this node's image-out for downstream. Null/undefined
  // falls back to outputAssetIds.at(-1) (the latest run).
  activeAssetId: z.string().nullable().optional(),
  // Per-asset snapshot of the prompt state at generation time, so
  // clicking a history thumb can restore text/model/aspect/resolution.
  // Legacy rows may be missing entries — UI falls back gracefully.
  versionMetadata: z.record(z.string(), promptVersionSnapshotSchema).optional().default({}),
  inputsChangedSinceLastRun: z.boolean(),
  runStatus: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  lastRunCost: z.number().nullable().optional(),
  collapsed: z.boolean().optional().default(false),
  // When true, this Prompt's reference list flattens the entire upstream
  // chain: for every incoming Prompt, include its output plus its own
  // references (recursively). Off by default — each Prompt sees only its
  // direct incoming images.
  chainSources: z.boolean().optional().default(false),
});

export const imageNodeDataSchema = z.object({
  assetId: z.string().nullable(),
  previewUrl: z.string().nullable(),
  fileName: z.string().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  isUploading: z.boolean().default(false),
  errorMessage: z.string().nullable().optional(),
  collapsed: z.boolean().optional().default(false),
});

export const meshNodeDataSchema = z.object({
  provider: z.enum(["meshy", "hunyuan"]).default("meshy"),
  meshyUseMultiview: z.boolean().default(false),
  meshyPolyMode: z.enum(["standard", "low"]).default("standard"),
  meshyTopology: z.enum(["triangle", "quad"]).default("triangle"),
  meshyTargetPolycount: z.number().int().min(100).max(300000).optional(),
  meshySymmetryMode: z.enum(["auto", "on", "off"]).default("auto"),
  meshyShouldRemesh: z.boolean().default(true),
  meshyShouldTexture: z.boolean().default(true),
  meshyEnablePbr: z.boolean().default(false),
  meshyPoseMode: z.enum(["", "a-pose", "t-pose"]).default(""),
  meshyEnableRigging: z.boolean().default(false),
  meshyRiggingHeightMeters: z.number().positive().default(1.7),
  meshyEnableAnimation: z.boolean().default(false),
  meshyAnimationActionId: z.number().int().default(1001),
  hunyuanViewSlots: z.array(z.enum(["front", "left", "back", "right"])).default(["front"]),
  hunyuanGenerateType: z.enum(["Normal", "LowPoly", "Geometry"]).default("Normal"),
  hunyuanEnablePbr: z.boolean().default(false),
  hunyuanFaceCount: z.number().int().min(40000).max(1500000).default(500000),

  mode: z.enum(["preview", "refine"] satisfies [MeshMode, MeshMode]),
  activeJobId: z.string().nullable(),
  outputAssetId: z.string().nullable(),
  artifactAssetIds: z.record(z.string(), z.string()).default({}),
  thumbnailAssetId: z.string().nullable().optional(),
  inputsChangedSinceLastRun: z.boolean().default(false),
  runStatus: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  collapsed: z.boolean().optional().default(false),
  // Viewer controls (merged from the retired Viewer node).
  autoRotate: z.boolean().optional().default(true),
  exposure: z.number().optional().default(1),
});

export const viewerNodeDataSchema = z.object({
  autoRotate: z.boolean(),
  exposure: z.number(),
  collapsed: z.boolean().optional().default(false),
});

export const visionNodeDataSchema = z.object({
  question: z.string(),
  model: z.enum(VISION_MODEL_VALUES),
  activeJobId: z.string().nullable(),
  answer: z.string().nullable(),
  inputsChangedSinceLastRun: z.boolean().default(false),
  runStatus: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  lastRunCost: z.number().nullable().optional(),
  collapsed: z.boolean().optional().default(false),
});

export const videoNodeDataSchema = promptNodeDataSchema.omit({
  model: true, aspectRatio: true, resolution: true, versionMetadata: true, chainSources: true,
}).extend({
  model: z.enum(["seedance-2.0", "veo3.1-fast-reference"]),
  mode: z.enum(["text", "image", "reference"]),
  tier: z.enum(["fast", "standard"]),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  duration: z.enum(VIDEO_DURATIONS),
  generateAudio: z.boolean(),
  lastRunSeed: z.number().nullable().optional(),
});
export type VideoNodeData = z.infer<typeof videoNodeDataSchema>;
export type VideoNode = Node<VideoNodeData, "video">;
export function createVideoNodeData(): VideoNodeData {
  return videoNodeDataSchema.parse({ ...createPromptNodeData(), model: "seedance-2.0",
    mode: "text", tier: "fast", aspectRatio: "16:9", resolution: "720p", duration: "8", generateAudio: true });
}

export type PromptNodeData = z.infer<typeof promptNodeDataSchema>;
export type ImageNodeData = z.infer<typeof imageNodeDataSchema>;
export type MeshNodeData = z.infer<typeof meshNodeDataSchema>;
export type ViewerNodeData = z.infer<typeof viewerNodeDataSchema>;
export type VisionNodeData = z.infer<typeof visionNodeDataSchema>;

export type PromptNode = Node<PromptNodeData, "prompt">;
export type ImageNode = Node<ImageNodeData, "image">;
export type MeshNode = Node<MeshNodeData, "mesh">;
export type ViewerNode = Node<ViewerNodeData, "viewer">;
export type VisionNode = Node<VisionNodeData, "vision">;

export type CarvingNode = PromptNode | ImageNode | MeshNode | ViewerNode | VisionNode | VideoNode;
export type EdgeKind = "image" | "glb";
export type CarvingEdge = Edge<{ kind: EdgeKind }>;

export type ProjectGraph = {
  id: string;
  name: string;
  nodes: CarvingNode[];
  edges: CarvingEdge[];
  viewport: Viewport;
};

export function createPromptNodeData(): PromptNodeData {
  return {
    text: "",
    model: "fal-ai/nano-banana-2",
    aspectRatio: "1:1",
    resolution: "1K",
    seed: null,
    activeJobId: null,
    outputAssetIds: [],
    activeAssetId: null,
    versionMetadata: {},
    inputsChangedSinceLastRun: false,
    runStatus: null,
    errorMessage: null,
    lastRunCost: null,
    collapsed: false,
    chainSources: false,
  };
}

export function createImageNodeData(): ImageNodeData {
  return {
    assetId: null,
    previewUrl: null,
    fileName: null,
    width: null,
    height: null,
    isUploading: false,
    errorMessage: null,
    collapsed: false,
  };
}

export function createMeshNodeData(): MeshNodeData {
  return meshNodeDataSchema.parse({
    mode: "preview",
    activeJobId: null,
    outputAssetId: null,
    artifactAssetIds: {},
    thumbnailAssetId: null,
    inputsChangedSinceLastRun: false,
    runStatus: null,
    errorMessage: null,
    collapsed: false,
    autoRotate: true,
    exposure: 1,
  });
}

export function createViewerNodeData(): ViewerNodeData {
  return {
    autoRotate: true,
    exposure: 1,
    collapsed: false,
  };
}

export function createVisionNodeData(): VisionNodeData {
  return {
    question: "What object is shown here, and what material/style details stand out?",
    model: "google/gemini-2.5-flash",
    activeJobId: null,
    answer: null,
    inputsChangedSinceLastRun: false,
    runStatus: null,
    errorMessage: null,
    lastRunCost: null,
    collapsed: false,
  };
}

export function isPromptNode(node: CarvingNode): node is PromptNode {
  return node.type === "prompt";
}

export function isMeshNode(node: CarvingNode): node is MeshNode {
  return node.type === "mesh";
}

export function isImageNode(node: CarvingNode): node is ImageNode {
  return node.type === "image";
}
