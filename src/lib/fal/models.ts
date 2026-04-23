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
    tagline: "best text",
    estimateByResolution: { "1K": 0.08, "2K": 0.16, "4K": 0.32 },
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    resolutions: ["1K", "2K", "4K"],
    maxReferences: 4,
    usesEditSuffix: true,
  },
  "fal-ai/nano-banana-2": {
    displayName: "Nano Banana 2",
    tagline: "fast · 14 refs",
    estimateByResolution: { "1K": 0.04 },
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    resolutions: ["1K"],
    maxReferences: 14,
    usesEditSuffix: true,
  },
  "fal-ai/nano-banana-pro": {
    displayName: "Nano Banana Pro",
    tagline: "multi-fuse",
    estimateByResolution: { "1K": 0.1, "2K": 0.18 },
    aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    resolutions: ["1K", "2K"],
    maxReferences: 6,
    usesEditSuffix: true,
  },
  "fal-ai/flux-pro/kontext": {
    displayName: "Flux Kontext Pro",
    tagline: "edits · 1 ref",
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
    tagline: "fast visual QA",
  },
  {
    value: "openai/gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    tagline: "tight captions",
  },
] as const;

export type VisionModel = (typeof VISION_MODEL_OPTIONS)[number]["value"];
export const VISION_SLUG = "openrouter/router/vision";
