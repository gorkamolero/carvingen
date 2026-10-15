export const IMAGE_MODEL_BASES = [
  "openai/gpt-image-2",
  "fal-ai/nano-banana-2",
  "fal-ai/nano-banana-pro",
  "fal-ai/flux-pro/kontext",
] as const;

export const IMAGE_ASPECT_RATIOS = [
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "3:2",
  "2:3",
] as const;

export const IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const;

export type ImageModelBase = (typeof IMAGE_MODEL_BASES)[number];
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];

export type ModelCapability = {
  displayName: string;
  tagline: string;
  estimateByResolution: Partial<Record<ImageResolution, number>>;
  aspectRatios: ImageAspectRatio[];
  resolutions: ImageResolution[];
  maxReferences: number;
  usesEditSuffix: boolean;
};

export const IMAGE_MODEL_CAPABILITIES: Record<ImageModelBase, ModelCapability> = {
  "openai/gpt-image-2": {
    displayName: "ChatGPT Image Gen 2",
    tagline: "Follows the prompt closest",
    estimateByResolution: { "1K": 0.08, "2K": 0.16, "4K": 0.32 },
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    resolutions: ["1K", "2K", "4K"],
    maxReferences: 4,
    usesEditSuffix: true,
  },
  "fal-ai/nano-banana-2": {
    displayName: "Nano Banana 2",
    tagline: "Quick, cheap drafts",
    estimateByResolution: { "1K": 0.04 },
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    resolutions: ["1K"],
    maxReferences: 14,
    usesEditSuffix: true,
  },
  "fal-ai/nano-banana-pro": {
    displayName: "Nano Banana Pro",
    tagline: "Blend several refs",
    estimateByResolution: { "1K": 0.1, "2K": 0.18 },
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    resolutions: ["1K", "2K"],
    maxReferences: 6,
    usesEditSuffix: true,
  },
  "fal-ai/flux-pro/kontext": {
    displayName: "Flux Kontext Pro",
    tagline: "Retouch one image",
    estimateByResolution: { "1K": 0.04 },
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    resolutions: ["1K"],
    maxReferences: 1,
    usesEditSuffix: false,
  },
};

export const MESH_MODEL_SLUGS = {
  preview: "fal-ai/meshy/v6-preview/image-to-3d",
  refine: "fal-ai/meshy/v6/image-to-3d",
} as const;

export type MeshMode = keyof typeof MESH_MODEL_SLUGS;

export const VISION_MODEL_OPTIONS = [
  {
    value: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tagline: "Quick critique",
  },
  {
    value: "openai/gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    tagline: "Detailed read",
  },
] as const;

export type VisionModel = (typeof VISION_MODEL_OPTIONS)[number]["value"];
// Typed tuple of VISION_MODEL_OPTIONS values — keeps the literal union
// alive through zod's z.enum (which erases it when you .map() an array).
export const VISION_MODEL_VALUES = [
  "google/gemini-2.5-flash",
  "openai/gpt-4.1-mini",
] as const satisfies ReadonlyArray<VisionModel>;
export const VISION_SLUG = "openrouter/router/vision";

export const MESHY_MULTI_IMAGE_SLUG = "fal-ai/meshy/v6/multi-image-to-3d";
export const HUNYUAN_MESH_SLUG = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";
export const VIDEO_MODEL_OPTIONS = [
  { value: "seedance-2.0", label: "Seedance 2.0", tagline: "Text, frames and references" },
  { value: "veo3.1-fast-reference", label: "Veo 3.1 Fast Reference", tagline: "Animate image references" },
] as const;
export const VIDEO_MODE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "reference", label: "Reference" },
] as const;
// No Seedance price is documented in this repository. Do not invent an estimate.
export const VIDEO_TIER_OPTIONS: Record<"fast" | "standard", { label: string; pricePerSecond: number | null }> = {
  fast: { label: "Fast", pricePerSecond: null },
  standard: { label: "Standard", pricePerSecond: null },
} as const;
export type VideoModel = (typeof VIDEO_MODEL_OPTIONS)[number]["value"];
export type VideoMode = (typeof VIDEO_MODE_OPTIONS)[number]["value"];
export type VideoTier = keyof typeof VIDEO_TIER_OPTIONS;
export const VIDEO_ASPECT_RATIOS = ["auto", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] as const;
export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const VIDEO_DURATIONS = ["auto", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "8s"] as const;
export type AnyVideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];
export type AnyVideoResolution = (typeof VIDEO_RESOLUTIONS)[number];
export type AnyVideoDuration = (typeof VIDEO_DURATIONS)[number];
type VideoCapability = {
  supportedModes: VideoMode[];
  tiers: VideoTier[];
  aspectRatios: AnyVideoAspectRatio[];
  resolutions: AnyVideoResolution[];
  durations: AnyVideoDuration[];
  maxImagesByMode: Record<VideoMode, number>;
};
export const VIDEO_MODEL_CAPABILITIES: Record<VideoModel, VideoCapability> = {
  "seedance-2.0": {
    supportedModes: ["text", "image", "reference"], tiers: ["fast", "standard"],
    aspectRatios: [...VIDEO_ASPECT_RATIOS], resolutions: [...VIDEO_RESOLUTIONS],
    durations: VIDEO_DURATIONS.filter((duration) => duration !== "8s"),
    maxImagesByMode: { text: 0, image: 2, reference: 9 },
  },
  "veo3.1-fast-reference": {
    supportedModes: ["reference"], tiers: ["fast"],
    aspectRatios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: ["8s"],
    maxImagesByMode: { text: 0, image: 0, reference: 3 },
  },
};
