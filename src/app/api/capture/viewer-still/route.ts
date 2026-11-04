import { viewerCaptureRoute } from "@/lib/capture/route";
export const runtime = "nodejs";
export const maxDuration = 360;
export async function POST(request: Request) { return viewerCaptureRoute(request, false); }
