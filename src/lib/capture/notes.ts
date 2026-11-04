import { estimateNodeCost } from "@/lib/fal/pricing";
import type { CarvingNode, ProjectGraph } from "@/lib/graph/types";
import { currentOutputs, orderedNodes } from "./graph";
export type CaptureJob = { id: string; nodeId: string; provider: string; providerSlug: string; state: string; requestJson: string; responseSummaryJson: string | null; outputAssetIdsJson: string | null; startedAt: string | Date | number };
function object(json: string | null): Record<string, unknown> { try { return JSON.parse(json ?? "{}") ?? {}; } catch { return {}; } }
export function buildNotes(graph: ProjectGraph, jobs: CaptureJob[]) {
  const lines = [`# ${graph.name}`, "", "Costs cover the jobs producing current outputs. Historical runs are excluded. Prices are estimates unless recorded credits are available.", ""];
  let total = 0, unknown = 0;
  const chargedJobs = new Set<string>();
  for (const node of orderedNodes(graph)) {
    const outputs = currentOutputs(node);
    const remaining = new Set(outputs);
    const matched = jobs.filter((j) => j.state === "succeeded").sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)).filter((job) => {
      const ids = JSON.parse(job.outputAssetIdsJson ?? "[]") as string[];
      if (!ids.some((id) => remaining.has(id))) return false;
      ids.forEach((id) => remaining.delete(id));
      return true;
    });
    lines.push(`## ${node.type} (${node.id})`, "");
    if (!matched.length) {
      lines.push(["image", "animation"].includes(node.type!) ? "Cost $0.00 · local input" : outputs.length ? "Producing job unavailable. Cost and result counts unknown." : "No generated current output.", "");
      if (outputs.length && !["image", "animation"].includes(node.type!)) unknown++;
      continue;
    }
    for (const job of matched) {
      const request = object(job.requestJson), result = object(job.responseSummaryJson);
      const settings = (request.data && typeof request.data === "object" ? request.data : request) as Record<string, unknown>;
      if (node.type === "prompt" && job.provider === "fal" && !settings.model) {
        settings.model = job.providerSlug.replace(/\/edit$/, "");
        settings.resolution = settings.output_resolution ?? settings.resolution ?? "1K";
      }
      // Character jobs are orchestrated locally but can contain paid provider work.
      const recordedNode = { type: node.type, data: settings } as CarvingNode;
      const credits = result.credits ?? result.costCredits;
      const nativeTripo = settings.engine === "tripo" || settings.rigEngine === "tripo" || request.inputRigEngine === "tripo" || job.provider === "tripo";
      if (request.inputRigEngine === "tripo") settings.rigEngine = "tripo";
      const local = job.provider === "local" && !job.providerSlug.startsWith("character/");
      const codex = job.provider === "codex" || job.providerSlug.includes("codex") || String(settings.model ?? settings.imageModel).includes("codex");
      let cost = nativeTripo && typeof credits === "number" ? { usd: credits * 0.01, label: `${credits} credits × $0.01` } : codex || local ? { usd: 0, label: codex ? "Codex subscription" : "local" } : estimateNodeCost(recordedNode);
      if (job.provider === "fal" && cost.usd === 0 && !codex) cost = { usd: null, label: "provider pricing unavailable" };
      if (!chargedJobs.has(job.id)) {
        if (cost.usd === null) unknown++; else total += cost.usd;
        chargedJobs.add(job.id);
      }
      lines.push(`Job ${job.id} · ${job.providerSlug}`, "", `Cost ${cost.usd === null ? "unknown" : `$${cost.usd.toFixed(2)}`} · ${cost.label}${typeof credits === "number" && nativeTripo || cost.usd === 0 ? "" : " · estimate"}`, "");
      const keys = Object.entries(settings).filter(([key, value]) => !/asset|url|prompt|^text$|job|output|error|status|key|token|secret|bone|collapsed|inputsChanged|TaskId/i.test(key) && value !== null && (typeof value !== "object" || Array.isArray(value)));
      lines.push(...keys.map(([key, value]) => `- ${key} = ${JSON.stringify(value)}`), "");
      if (["mesh", "bake", "export"].includes(node.type!)) lines.push(`Triangles ${result.triangleCount ?? "unavailable in job result"}`, "");
      if (node.type === "rig") {
        const bones = Array.isArray(result.boneNames) ? result.boneNames as string[] : null;
        lines.push(`Bones ${bones?.length ?? "unavailable"} · finger bones ${bones ? bones.filter((b) => /finger|thumb|index|middle|ring|pinky|little/i.test(b)).length : "unavailable"}`, "");
      }
      if (node.type === "animate") {
        const clips = Array.isArray(result.clips) ? result.clips as { name?: string; duration?: number; frames?: number; frameCount?: number; frameSource?: string }[] : [];
        lines.push(...clips.map((c) => `- Clip ${c.name ?? "unnamed"} · ${c.duration ?? "unknown"} s · ${c.frameCount ?? c.frames ?? "unavailable"} frames${c.frameSource ? ` (${c.frameSource})` : ""}`));
        if (!clips.length) lines.push("Clip metadata unavailable in job result.");
        lines.push("");
      }
    }
  }
  lines.push(`## Total`, "", `$${total.toFixed(2)} known current-output cost (estimate)${unknown ? ` · ${unknown} unknown cost(s) excluded` : ""}`, "");
  return lines.join("\n");
}
