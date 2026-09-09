import { ApiError } from "@/lib/http/errors";
import {
  VIDEO_MODEL_CAPABILITIES,
  type AnyVideoAspectRatio,
  type AnyVideoDuration,
  type AnyVideoResolution,
  type VideoMode,
  type VideoModel,
  type VideoTier,
} from "@/lib/fal/models";

export type VideoGenInput = {
  model: VideoModel;
  mode: VideoMode;
  tier: VideoTier;
  prompt: string;
  imageUrls: string[];
  aspectRatio: AnyVideoAspectRatio;
  resolution: AnyVideoResolution;
  duration: AnyVideoDuration;
  generateAudio: boolean;
  seed?: number | null;
};

const SEEDANCE_SLUGS: Record<VideoTier, Record<VideoMode, string>> = {
  fast: {
    text: "bytedance/seedance-2.0/fast/text-to-video",
    image: "bytedance/seedance-2.0/fast/image-to-video",
    reference: "bytedance/seedance-2.0/fast/reference-to-video",
  },
  standard: {
    text: "bytedance/seedance-2.0/text-to-video",
    image: "bytedance/seedance-2.0/image-to-video",
    reference: "bytedance/seedance-2.0/reference-to-video",
  },
};

export function pickVideoSlug(input: Pick<VideoGenInput, "model" | "mode" | "tier">) {
  if (input.model === "veo3.1-fast-reference") {
    return "fal-ai/veo3.1/fast/reference-to-video";
  }

  return SEEDANCE_SLUGS[input.tier][input.mode];
}

export function validateVideoInput(input: VideoGenInput) {
  const capability = VIDEO_MODEL_CAPABILITIES[input.model];

  if (!includesValue(capability.supportedModes, input.mode)) {
    throw new ApiError(400, `${input.model} does not support ${input.mode}-to-video.`);
  }

  if (!includesValue(capability.tiers, input.tier)) {
    throw new ApiError(400, `${input.model} does not support the ${input.tier} tier.`);
  }

  if (!includesValue(capability.resolutions, input.resolution)) {
    throw new ApiError(400, `${input.model} does not support ${input.resolution}.`);
  }

  if (!includesValue(capability.durations, input.duration)) {
    throw new ApiError(400, `${input.model} does not support ${input.duration} duration.`);
  }

  if (!includesValue(capability.aspectRatios, input.aspectRatio)) {
    throw new ApiError(400, `${input.model} does not support ${input.aspectRatio}.`);
  }

  if (input.prompt.trim().length === 0) {
    throw new ApiError(400, "Enter a video prompt before running.");
  }

  const maxImages = capability.maxImagesByMode[input.mode];
  if (input.imageUrls.length < requiredImageCount(input.mode, input.model)) {
    throw new ApiError(400, imageRequirementMessage(input.mode, input.model));
  }

  if (input.imageUrls.length > maxImages) {
    throw new ApiError(400, `${input.model} supports at most ${maxImages} image references in ${input.mode} mode.`);
  }
}

export function buildVideoRequest(input: VideoGenInput) {
  validateVideoInput(input);

  const base: Record<string, unknown> = {
    prompt: input.prompt,
    resolution: input.resolution,
    duration: input.duration,
    aspect_ratio: input.aspectRatio,
    generate_audio: input.generateAudio,
  };

  if (typeof input.seed === "number") {
    base.seed = input.seed;
  }

  if (input.model === "veo3.1-fast-reference") {
    return {
      ...base,
      image_urls: input.imageUrls,
    };
  }

  if (input.mode === "image") {
    return {
      ...base,
      image_url: input.imageUrls[0],
      end_image_url: input.imageUrls[1],
    };
  }

  if (input.mode === "reference") {
    return {
      ...base,
      image_urls: input.imageUrls,
    };
  }

  return base;
}

export function extractVideoUrl(result: Record<string, unknown>) {
  const data = result.data as Record<string, unknown> | undefined;
  const video = data?.video;
  if (video && typeof video === "object" && "url" in video && typeof video.url === "string") {
    return video.url;
  }

  return null;
}

function requiredImageCount(mode: VideoMode, model: VideoModel) {
  if (model === "veo3.1-fast-reference") {
    return 1;
  }
  if (mode === "image") {
    return 1;
  }
  return 0;
}

function imageRequirementMessage(mode: VideoMode, model: VideoModel) {
  if (model === "veo3.1-fast-reference") {
    return "Connect at least one image for Veo reference-to-video.";
  }
  if (mode === "image") {
    return "Connect a start image before running image-to-video.";
  }
  return "Connect an image before running.";
}

function includesValue<T>(values: readonly T[], value: unknown): value is T {
  return (values as readonly unknown[]).includes(value);
}
