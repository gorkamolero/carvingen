import { z } from "zod";

import { completeJob } from "@/lib/db/repositories/jobs";
import { ApiError } from "@/lib/http/errors";
import { jsonError, jsonOk, parseJson } from "@/lib/http/json";

const completeJobSchema = z.object({
  state: z.enum(["succeeded", "failed", "canceled"]),
  responseSummary: z.record(z.string(), z.unknown()).optional(),
  outputAssetIds: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = completeJobSchema.parse(await parseJson(request));
    return jsonOk(await completeJob({ id, ...body }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues[0]?.message ?? "Invalid request."));
    }

    return jsonError(error);
  }
}
