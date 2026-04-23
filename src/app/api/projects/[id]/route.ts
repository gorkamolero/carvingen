import { z } from "zod";

import { loadProject, renameProject } from "@/lib/db/repositories/projects";
import { ApiError } from "@/lib/http/errors";
import { jsonError, jsonOk, parseJson } from "@/lib/http/json";

const renameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return jsonOk(await loadProject(id));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = renameSchema.parse(await parseJson(request));
    return jsonOk(await renameProject(id, body.name));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues[0]?.message ?? "Invalid request."));
    }

    return jsonError(error);
  }
}
