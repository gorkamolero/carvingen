import { characterJobStatus } from "@/lib/character/jobs";
import { jsonOk, jsonError } from "@/lib/http/json";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return jsonOk(await characterJobStatus((await context.params).id)); } catch (error) { return jsonError(error); }
}
