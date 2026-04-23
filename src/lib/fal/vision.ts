import { ApiError } from "@/lib/http/errors";
import { VISION_MODEL_OPTIONS, VISION_SLUG, type VisionModel } from "@/lib/fal/models";

export type VisionInput = {
  prompt: string;
  imageUrls: string[];
  model: VisionModel;
};

const ALLOWED_MODELS = new Set(VISION_MODEL_OPTIONS.map((option) => option.value));

export function pickVisionSlug() {
  return VISION_SLUG;
}

export function buildVisionRequest(input: VisionInput) {
  if (!input.prompt.trim()) {
    throw new ApiError(400, "Enter a question before running Vision.");
  }

  if (input.imageUrls.length === 0) {
    throw new ApiError(400, "Connect an image before running Vision.");
  }

  if (!ALLOWED_MODELS.has(input.model)) {
    throw new ApiError(400, "Unsupported vision model.");
  }

  return {
    image_urls: input.imageUrls,
    prompt: input.prompt.trim(),
    model: input.model,
    system_prompt:
      "Answer clearly and directly. Use plain text only, no markdown, and keep the answer concise but specific.",
    temperature: 0.2,
  };
}

export function extractVisionAnswer(result: Record<string, unknown>) {
  const data = result.data;
  if (typeof data !== "object" || data === null) {
    throw new Error("Vision result payload was missing data.");
  }

  const output = "output" in data ? data.output : null;
  if (typeof output !== "string" || output.trim().length === 0) {
    throw new Error("Vision result did not include text output.");
  }

  const usage =
    "usage" in data && typeof data.usage === "object" && data.usage !== null ? data.usage : null;
  const cost =
    usage && "cost" in usage && typeof usage.cost === "number" ? usage.cost : null;

  return {
    answer: output.trim(),
    cost,
  };
}
