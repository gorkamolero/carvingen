import { createReadStream } from "node:fs";

import { getAssetById } from "@/lib/db/repositories/assets";
import { ApiError } from "@/lib/http/errors";
import { jsonError } from "@/lib/http/json";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const asset = await getAssetById(id);

    if (!asset) {
      throw new ApiError(404, "Asset not found.");
    }

    const stream = createReadStream(asset.localPath);
    return new Response(stream as unknown as BodyInit, {
      headers: {
        "content-type": asset.mimeType,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
