import { startCharacterJob } from "@/lib/character/jobs";
import { jsonOk, jsonError, parseJson } from "@/lib/http/json";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return jsonOk(await startCharacterJob("multiview", await parseJson(request)), { status: 202 }); }
  catch (error) { return jsonError(error); }
}
