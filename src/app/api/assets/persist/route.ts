import { z } from "zod";

import { persistRemoteAsset } from "@/lib/storage/persist-remote";
import { ApiError } from "@/lib/http/errors";
import { jsonError, jsonOk, parseJson } from "@/lib/http/json";

const persistSchema = z.object({
  sourceUrl: z.url(),
  kind: z.string(),
  jobId: z.string().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = persistSchema.parse(await parseJson(request));
    const asset = await persistRemoteAsset(body);
    return jsonOk({
      assetId: asset?.id,
      url: asset?.url,
      bytes: asset?.bytes,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues[0]?.message ?? "Invalid request."));
    }

    return jsonError(error);
  }
}
