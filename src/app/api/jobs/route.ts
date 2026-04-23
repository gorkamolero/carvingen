import { z } from "zod";

import {
  createJob,
  getActiveJobsByProject,
} from "@/lib/db/repositories/jobs";
import { ApiError } from "@/lib/http/errors";
import { jsonError, jsonOk, parseJson } from "@/lib/http/json";

const createJobSchema = z.object({
  projectId: z.string(),
  nodeId: z.string(),
  provider: z.literal("fal"),
  providerJobId: z.string(),
  providerSlug: z.string(),
  requestInput: z.record(z.string(), z.unknown()),
});

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      throw new ApiError(400, "projectId is required.");
    }

    return jsonOk(await getActiveJobsByProject(projectId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createJobSchema.parse(await parseJson(request));
    return jsonOk(await createJob(body), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues[0]?.message ?? "Invalid request."));
    }

    return jsonError(error);
  }
}
