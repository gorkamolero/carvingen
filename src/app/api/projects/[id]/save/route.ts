import { z } from "zod";

import { saveProjectGraph } from "@/lib/db/repositories/projects";
import { validateProjectGraph } from "@/lib/graph/serialization";
import { ApiError } from "@/lib/http/errors";
import { jsonError, jsonOk, parseJson } from "@/lib/http/json";

const saveSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }),
});

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = saveSchema.parse(await parseJson(request));
    const { id } = await context.params;
    const graph = validateProjectGraph({ ...body, id });
    return jsonOk(await saveProjectGraph(graph));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(new ApiError(400, error.issues[0]?.message ?? "Invalid request."));
    }

    return jsonError(error);
  }
}
