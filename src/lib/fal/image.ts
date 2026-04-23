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
        aspect_ratio: input.aspectRatio,
        num_images: 1,
        output_format: "png",
        quality:
          input.resolution === "1K"
            ? "medium"
            : input.resolution === "2K"
              ? "high"
              : "high",
        image_size:
          input.resolution === "1K"
            ? "1024x1024"
            : input.resolution === "2K"
              ? "2048x2048"
              : "4096x4096",
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
