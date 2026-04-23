import {
  IMAGE_MODEL_CAPABILITIES,
  type ImageAspectRatio,
  type ImageModelBase,
  type ImageResolution,
} from "@/lib/fal/models";
import { ApiError } from "@/lib/http/errors";

export type ImageGenInput = {
  modelBase: ImageModelBase;
  prompt: string;
  referenceImages: string[];
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  seed?: number | null;
};

export function pickImageSlug(
  modelBase: ImageModelBase,
  referenceImages: string[],
) {
  const capability = IMAGE_MODEL_CAPABILITIES[modelBase];
  if (referenceImages.length === 0) {
    return modelBase;
  }

  return capability.usesEditSuffix ? `${modelBase}/edit` : modelBase;
}

export function validateImageInput(input: ImageGenInput) {
  const capability = IMAGE_MODEL_CAPABILITIES[input.modelBase];

  if (!capability.aspectRatios.includes(input.aspectRatio)) {
    throw new ApiError(400, `${input.modelBase} does not support ${input.aspectRatio}.`);
  }

  if (!capability.resolutions.includes(input.resolution)) {
    throw new ApiError(400, `${input.modelBase} does not support ${input.resolution}.`);
  }

  if (input.referenceImages.length > capability.maxReferences) {
    throw new ApiError(
      400,
      `${capability.displayName} supports at most ${capability.maxReferences} reference images.`,
    );
  }
}

export function buildImageRequest(input: ImageGenInput) {
  validateImageInput(input);

  switch (input.modelBase) {
    case "openai/gpt-image-2":
      return {
        prompt: input.prompt,
        image_urls: input.referenceImages.length ? input.referenceImages : undefined,
        num_images: 1,
        output_format: "png",
        quality: input.resolution === "1K" ? "medium" : "high",
        image_size: getGptImage2Size(input.aspectRatio, input.resolution),
      };
    case "fal-ai/nano-banana-2":
      return {
        prompt: input.prompt,
        image_urls: input.referenceImages.length ? input.referenceImages : undefined,
        aspect_ratio: input.aspectRatio,
        num_images: 1,
        seed: input.seed ?? undefined,
      };
    case "fal-ai/nano-banana-pro":
      return {
        prompt: input.prompt,
        image_urls: input.referenceImages.length ? input.referenceImages : undefined,
        aspect_ratio: input.aspectRatio,
        num_images: 1,
        output_resolution: input.resolution,
        seed: input.seed ?? undefined,
      };
    case "fal-ai/flux-pro/kontext":
      return {
        prompt: input.prompt,
        image_url: input.referenceImages[0],
        aspect_ratio: input.aspectRatio,
        seed: input.seed ?? undefined,
      };
  }
}

function getGptImage2Size(
  aspectRatio: ImageAspectRatio,
  resolution: ImageResolution,
) {
  const sizeByResolution = {
    "1K": {
      "1:1": "square",
      "3:4": { width: 768, height: 1024 },
      "4:3": { width: 1024, height: 768 },
      "9:16": { width: 576, height: 1024 },
      "16:9": { width: 1024, height: 576 },
    },
    "2K": {
      "1:1": { width: 2048, height: 2048 },
      "3:4": { width: 1536, height: 2048 },
      "4:3": { width: 2048, height: 1536 },
      "9:16": { width: 1152, height: 2048 },
      "16:9": { width: 2048, height: 1152 },
    },
    "4K": {
      "1:1": { width: 2880, height: 2880 },
      "3:4": { width: 2480, height: 3312 },
      "4:3": { width: 3312, height: 2480 },
      "9:16": { width: 2160, height: 3840 },
      "16:9": { width: 3840, height: 2160 },
    },
  } as const;

  if (
    aspectRatio !== "1:1" &&
    aspectRatio !== "3:4" &&
    aspectRatio !== "4:3" &&
    aspectRatio !== "9:16" &&
    aspectRatio !== "16:9"
  ) {
    throw new ApiError(400, `openai/gpt-image-2 does not support ${aspectRatio}.`);
  }

  return sizeByResolution[resolution][aspectRatio];
}
