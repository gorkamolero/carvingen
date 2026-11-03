import { fetchJson } from "@/lib/api/client";
import { getIncomingImageAssetIds } from "@/lib/graph/selectors";
import type { CarvingNode, CarvingEdge } from "@/lib/graph/types";
import type { PipelineRequest, PipelineResult } from "./jobs";

export function characterInputs(node: CarvingNode, nodes: readonly CarvingNode[], edges: readonly CarvingEdge[]) {
  const incoming = (handle: string) => edges.filter((e) => e.target === node.id && e.targetHandle === handle).map((e) => nodes.find((n) => n.id === e.source)).filter((n): n is CarvingNode => !!n);
  let imageAssetIds = getIncomingImageAssetIds(node.id, nodes, edges);
  if (node.type === "mesh" && node.data.provider === "tripo-h31" && node.data.tripoMultiview) {
    imageAssetIds = incoming("image-in").flatMap((n) => n.type === "multiview" ? ["front", "left", "back"].map((v) => n.data.artifactAssetIds[v]).filter(Boolean) : getIncomingImageAssetIds(node.id, [n], edges));
  }
  const meshAssetIds = incoming("glb-in").flatMap((n) => {
    if (!("outputAssetId" in n.data)) return [];
    if (node.type === "export" && n.type === "animate") {
      const clips = Object.entries(n.data.artifactAssetIds).filter(([key]) => /(?:animations|custom).*glb/.test(key) && !/basic_animations/.test(key)).map(([, id]) => id);
      if (clips.length) return clips;
    }
    return n.data.outputAssetId ? [n.data.outputAssetId] : Object.entries(n.data.artifactAssetIds).filter(([k]) => /fbx/.test(k)).slice(0, 1).map(([, id]) => id);
  });
  return { imageAssetIds: [...new Set(imageAssetIds)], meshAssetIds: [...new Set(meshAssetIds)], animationAssetIds: incoming("animation-in").flatMap((n) => n.type === "animation" && n.data.assetId ? [n.data.assetId] : []) };
}
export async function submitCharacterJob(kind: string, request: PipelineRequest) {
  return fetchJson<{ jobId: string }>(`/api/jobs/${kind}`, { method: "POST", body: JSON.stringify(request) });
}
export type CharacterJobStatus = { state: string; error: string | null; result: (PipelineResult & { progress?: number; status?: string }) | null };
export function pollCharacterJob(id: string) { return fetchJson<CharacterJobStatus>(`/api/jobs/${id}`); }
export function resultPatch(result: PipelineResult, previous: { outputAssetIds: readonly string[] }) {
  const artifactAssetIds = Object.fromEntries(result.assets.map((a) => [a.name, a.assetId]));
  return { activeJobId: null, runStatus: null, errorMessage: null, inputsChangedSinceLastRun: false,
    outputAssetId: result.outputAssetId, outputAssetIds: [...previous.outputAssetIds, ...result.assets.map((a) => a.assetId)],
    artifactAssetIds, activeAssetId: artifactAssetIds.front ?? null,
    triangleCount: result.triangleCount ?? null, boneNames: result.boneNames ?? [], budgetPass: result.budgetPass ?? null, rigTaskId: result.rigTaskId ?? null };
}
