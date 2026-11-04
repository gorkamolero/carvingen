import { z } from "zod";

export const PIPELINE_KINDS = ["multiview", "bake", "rig", "animate", "animation", "export"] as const;
export type PipelineKind = typeof PIPELINE_KINDS[number];
export const pipelineDataSchema = z.object({
  activeJobId: z.string().nullable().default(null),
  outputAssetId: z.string().nullable().default(null),
  outputAssetIds: z.array(z.string()).default([]),
  artifactAssetIds: z.record(z.string(), z.string()).default({}),
  activeAssetId: z.string().nullable().default(null),
  assetId: z.string().nullable().default(null),
  fileName: z.string().nullable().default(null),
  inputsChangedSinceLastRun: z.boolean().default(false),
  runStatus: z.string().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  collapsed: z.boolean().default(false),
  imageModel: z.enum(["fal-ai/nano-banana-2", "codex/gpt-image"]).default("fal-ai/nano-banana-2"),
  includeBack: z.boolean().default(true),
  equipment: z.string().default("weapons, shield, backpack"),
  engine: z.enum(["blender", "tripo"]).default("blender"),
  targetTriangles: z.number().int().min(48).max(2000000).default(12000),
  keepUvs: z.boolean().default(false),
  /** Bake: turn the model around its up axis before baking, for meshes that come out facing sideways. */
  turnDegrees: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  textureSize: z.union([z.literal(1024), z.literal(2048), z.literal(4096)]).default(2048),
  quad: z.boolean().default(false),
  heightMeters: z.number().positive().max(100).default(1.8),
  presetIds: z.array(z.number().int().min(0).max(696)).max(10).default([0, 669]),
  characterName: z.string().min(1).max(120).default("Character"),
  target: z.enum(["unity", "unreal"]).default("unity"),
  triangleBudget: z.number().int().positive().default(15000),
  triangleCount: z.number().nullable().default(null),
  boneNames: z.array(z.string()).default([]),
  budgetPass: z.boolean().nullable().default(null),
  rigTaskId: z.string().nullable().default(null),
});
export type PipelineData = z.infer<typeof pipelineDataSchema>;
export function createPipelineData() { return pipelineDataSchema.parse({}); }

export const tripoOptionsSchema = z.object({
  tripoFaceLimit: z.number().int().min(48).max(2000000).default(30000),
  tripoQuad: z.boolean().default(false),
  tripoTexture: z.boolean().default(true),
  tripoPbr: z.boolean().default(true),
  tripoTextureQuality: z.enum(["fast", "standard", "detailed", "extreme"]).default("standard"),
  tripoGeometryQuality: z.enum(["standard", "detailed"]).default("standard"),
  tripoTextureVersion: z.enum(["v3.5-20260815", "v3.0-20250812", "v2.5-20250123"]).default("v3.5-20260815"),
  tripoDelight: z.boolean().default(true),
  tripoExportUv: z.boolean().default(true),
  tripoAutoSize: z.boolean().default(false),
  tripoExportOrientation: z.enum(["+x", "-x", "-y", "+y"]).optional(),
  tripoOrientation: z.enum(["default", "align_image"]).default("default"),
  tripoTextureAlignment: z.enum(["original_image", "geometry"]).default("original_image"),
  tripoModelSeed: z.number().int().optional(),
  tripoTextureSeed: z.number().int().optional(),
  tripoMultiview: z.boolean().default(false),
});
