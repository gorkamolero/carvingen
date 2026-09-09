import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";

import {
  HUNYUAN_MESH_SLUG,
  IMAGE_MODEL_BASES,
  MESHY_MULTI_IMAGE_SLUG,
  MESH_MODEL_SLUGS,
  VISION_SLUG,
} from "@/lib/fal/models";
import { getServerEnv } from "@/lib/env";

const VIDEO_ENDPOINTS = [
  "bytedance/seedance-2.0/fast/text-to-video",
  "bytedance/seedance-2.0/fast/image-to-video",
  "bytedance/seedance-2.0/fast/reference-to-video",
  "bytedance/seedance-2.0/text-to-video",
  "bytedance/seedance-2.0/image-to-video",
  "bytedance/seedance-2.0/reference-to-video",
  "fal-ai/veo3.1/fast/reference-to-video",
] as const;

const IMAGE_ENDPOINTS = IMAGE_MODEL_BASES.flatMap((model) => [model, `${model}/edit`]);

export const FAL_ALLOWED_ENDPOINTS = [
  ...IMAGE_ENDPOINTS,
  ...Object.values(MESH_MODEL_SLUGS),
  MESHY_MULTI_IMAGE_SLUG,
  HUNYUAN_MESH_SLUG,
  VISION_SLUG,
  ...VIDEO_ENDPOINTS,
] as const;

export const falProxyRouteHandler = createRouteHandler({
  allowedEndpoints: [...new Set(FAL_ALLOWED_ENDPOINTS)],
  allowUnauthorizedRequests: getServerEnv().FAL_PROXY_ALLOW_UNAUTHENTICATED,
});
