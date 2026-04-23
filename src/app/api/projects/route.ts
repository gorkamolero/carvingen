import { z } from "zod";

import { createProject, listProjects } from "@/lib/db/repositories/projects";
import { ApiError } from "@/lib/http/errors";
import { jsonError, jsonOk, parseJson } from "@/lib/http/json";

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const runtime = "nodejs";

export async function GET() {
  try {
    return jsonOk(await listProjects());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createProjectSchema.parse(await parseJson(request));
    return jsonOk(await createProject(body.name), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues[0]?.message ?? "Invalid request."));
    }

    return jsonError(error);
  }
}
