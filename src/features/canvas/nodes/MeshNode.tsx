"use client";
/* eslint-disable @next/next/no-img-element */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { characterInputs, submitCharacterJob, pollCharacterJob, resultPatch } from "@/lib/character/client";
import { estimateNodeCost } from "@/lib/fal/pricing";
import { useSnapshot } from "valtio";

import { getAssetUrl } from "@/lib/assets/url";
import { graphHistory, markNodeDirty, updateMeshNode } from "@/lib/graph/store";
import { getIncomingImageUrls } from "@/lib/graph/selectors";
import type { MeshNode as MeshGraphNode } from "@/lib/graph/types";
import { getErrorMessage, showErrorToast, showLoadingToast, showSuccessToast } from "@/lib/notifications/toast";
import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";



export function MeshNode({ id, data }: NodeProps<MeshGraphNode>) {
  const graph = useSnapshot(graphHistory.value);
  const sourceImages = getIncomingImageUrls(
    id,
    graph.nodes as unknown as import("@/lib/graph/types").CarvingNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );

  const query = useQuery({ queryKey: ["character-job", data.activeJobId], queryFn: () => pollCharacterJob(data.activeJobId!), enabled: !!data.activeJobId, refetchInterval: 2000 });
  useEffect(() => {
    if (!data.activeJobId || !query.data) return;
    if (query.data.state === "succeeded" && query.data.result) {
      const patch = resultPatch(query.data.result, data);
      updateMeshNode(id, { ...patch, thumbnailAssetId: query.data.result.assets.find((a) => a.kind === "thumbnail")?.assetId ?? null });
      markNodeDirty(id);
    } else if (query.data.state === "failed") updateMeshNode(id, { activeJobId: null, errorMessage: query.data.error ?? "Mesh failed" });
  }, [query.data, data, id]);
  const runMutation = useMutation({
    mutationFn: async () => {
      if (!graph.activeProjectId) throw new Error("No active project.");
      const inputs = characterInputs({ id, type: "mesh", data, position: { x: 0, y: 0 } }, graph.nodes as unknown as import("@/lib/graph/types").CarvingNode[], graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[]);
      return submitCharacterJob("mesh", { projectId: graph.activeProjectId, nodeId: id, data, ...inputs });
    },
    onMutate: () => showLoadingToast({ title: "Mesh queued", description: "Starting generation" }),
    onSuccess: (job, _variables, toastId) => {
      updateMeshNode(id, { activeJobId: job.jobId, errorMessage: null, runStatus: "Queued" });
      showSuccessToast(toastId, { title: "Mesh submitted", description: "Progress is shown on the node." });
    },
    onError: (error, _variables, toastId) => { updateMeshNode(id, { errorMessage: getErrorMessage(error, "Mesh failed") }); showErrorToast(toastId, { title: "Mesh failed", description: getErrorMessage(error, "Mesh failed") }); },
  });
  const busy = runMutation.isPending || !!data.activeJobId;

  const runDisabled = busy || sourceImages.length === 0;

  if (data.collapsed) {
    return (
      <NodeChrome
        title="Mesh"
        accentClassName="bg-[#3e8cff]"
        testId="mesh-node"
        nodeId={id}
        collapsed
        onToggleCollapsed={() => updateMeshNode(id, { collapsed: false })}
      >
        <Handle
          data-testid="mesh-image-in"
          type="target"
          id="image-in"
          position={Position.Left}
        />
        <div className="nodrag nopan nowheel relative aspect-square w-full overflow-hidden border-[3px] border-black bg-[#f9f5e8]">
          {data.outputAssetId ? (
            <model-viewer
              src={getAssetUrl(data.outputAssetId)}
              camera-controls
              auto-rotate={data.autoRotate ? "" : undefined}
              exposure={String(data.exposure ?? 1)}
              environment-image="neutral"
              shadow-intensity="1"
              class="nodrag nopan nowheel"
              style={{ width: "100%", height: "100%", background: "#fafaf5" }}
            />
          ) : data.thumbnailAssetId ? (
            <img src={getAssetUrl(data.thumbnailAssetId)} alt="Mesh thumbnail" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">
              no mesh
            </div>
          )}
          {busy ? (
            <div className="pointer-events-none absolute inset-0 flex items-end bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.28)_0_8px,transparent_8px_16px)] p-2">
              <span className="inline-block self-start border-[2px] border-black bg-[#3e8cff] px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                {query.data?.result?.status ?? data.runStatus ?? "Running"}
              </span>
            </div>
          ) : null}
        </div>
        <Handle
          data-testid="mesh-glb-out"
          type="source"
          id="glb-out"
          position={Position.Right}
        />
      </NodeChrome>
    );
  }

  return (
    <NodeChrome
      title="Mesh"
      accentClassName="bg-[#3e8cff]"
      testId="mesh-node"
      nodeId={id}
      collapsed={false}
      onToggleCollapsed={() => updateMeshNode(id, { collapsed: true })}
    >
      <Handle
        data-testid="mesh-image-in"
        type="target"
        id="image-in"
        position={Position.Left}
      />
      <MeshParameters data={data} update={(patch) => updateMeshNode(id, { ...patch, inputsChangedSinceLastRun: true })} />
      <div className="space-y-1.5">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-black/55">Mode</div>
        <div className="flex gap-1.5">
          {(["preview", "refine"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updateMeshNode(id, { mode, inputsChangedSinceLastRun: true })}
              className={`h-8 flex-1 border-[3px] border-black px-2 text-[11px] font-black uppercase leading-none tracking-[0.14em] ${
                mode === data.mode ? "bg-black text-white" : "bg-white text-black hover:bg-[#e3eeff]"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div
        className="nodrag nopan nowheel relative aspect-square overflow-hidden border-[3px] border-black bg-[#f9f5e8]"
      >
        {data.outputAssetId ? (
          <model-viewer
            src={getAssetUrl(data.outputAssetId)}
            camera-controls
            auto-rotate={data.autoRotate ? "" : undefined}
            exposure={String(data.exposure)}
            environment-image="neutral"
            shadow-intensity="1"
            class="nodrag nopan nowheel"
            style={{ width: "100%", height: "100%", background: "#fafaf5" }}
          />
        ) : data.thumbnailAssetId ? (
          <img src={getAssetUrl(data.thumbnailAssetId)} alt="Mesh thumbnail" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,transparent_49%,rgba(0,0,0,0.08)_49%_51%,transparent_51%)] bg-[length:14px_14px] font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">
            Mesh preview
          </div>
        )}
        {busy ? (
          <div className="pointer-events-none absolute inset-0 flex items-end bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.28)_0_8px,transparent_8px_16px)] p-2">
            <span className="inline-block self-start border-[2px] border-black bg-[#3e8cff] px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
              {query.data?.result?.status ?? data.runStatus ?? "Running"}
            </span>
          </div>
        ) : null}
      </div>

      {data.outputAssetId ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateMeshNode(id, { autoRotate: !data.autoRotate })}
            className={`nodrag h-8 shrink-0 border-[3px] border-black px-2.5 text-[10px] font-black uppercase tracking-[0.14em] ${
              data.autoRotate ? "bg-black text-white" : "bg-white text-black hover:bg-[#e3eeff]"
            }`}
          >
            {data.autoRotate ? "Rotate: on" : "Rotate: off"}
          </button>
          <label className="flex flex-1 items-center gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/55">Exp</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={data.exposure ?? 1}
              onChange={(event) => updateMeshNode(id, { exposure: Number(event.target.value) })}
              className="nodrag h-2 w-full cursor-pointer appearance-none border-[3px] border-black bg-white accent-black"
            />
            <span className="w-8 text-right font-mono text-[10px] font-semibold text-black/70">
              {(data.exposure ?? 1).toFixed(1)}
            </span>
          </label>
        </div>
      ) : null}

      <button
        data-testid="mesh-run-button"
        type="button"
        onClick={() => runMutation.mutate()}
        disabled={runDisabled}
        className="flex h-11 w-full items-center justify-between gap-3 border-[3px] border-black bg-[#3e8cff] px-3 text-[12px] font-black uppercase tracking-[0.16em] text-white shadow-[4px_4px_0_0_#0a0a0a] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#0a0a0a] disabled:cursor-not-allowed disabled:bg-[#c7d1e2] disabled:text-white/60 disabled:shadow-none"
      >
        <span>{busy ? "Running…" : data.outputAssetId ? "Re-run" : "Run"}</span>
        <span className="font-mono text-[10px] font-medium text-white/80">
          {estimateNodeCost({ type: "mesh", data }).label}
        </span>
      </button>

      {Object.keys(data.artifactAssetIds).length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-black/55">Download</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.artifactAssetIds).map(([kind, assetId]) => (
              <a
                key={kind}
                href={getAssetUrl(assetId)}
                className="h-7 border-[3px] border-black bg-white px-2 font-mono text-[10px] font-bold uppercase leading-[22px] tracking-[0.14em] hover:bg-[#e3eeff]"
                download
              >
                {kind}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {data.outputAssetIds.length > 0 && <details className="nodrag text-xs"><summary>History · {data.outputAssetIds.length} files</summary>{data.outputAssetIds.map((a, i) => <a key={`${a}-${i}`} href={getAssetUrl(a)} download className="block">Output {i + 1}</a>)}</details>}
      {data.errorMessage ? (
        <p className="font-mono text-[11px] text-[#d8421b]">{data.errorMessage}</p>
      ) : null}
      <Handle
        data-testid="mesh-glb-out"
        type="source"
        id="glb-out"
        position={Position.Right}
      />
    </NodeChrome>
  );
}

function MeshParameters({ data, update }: { data: MeshGraphNode["data"]; update: (patch: Partial<MeshGraphNode["data"]>) => void }) {
  const tripo = data.provider.startsWith("tripo");
  const p2 = data.provider === "tripo-p2";
  const field = (key: keyof MeshGraphNode["data"], label: string, options?: readonly string[]) => <label key={key} className="block text-xs font-bold">{label}{options ? <select className="nodrag block w-full border-2 border-black" value={String(data[key] ?? "")} onChange={(e) => update({ [key]: e.target.value || undefined })}>{options.map((v) => <option key={v} value={v}>{v}</option>)}</select> : typeof data[key] === "boolean" ? <input className="nodrag ml-2" type="checkbox" checked={Boolean(data[key])} onChange={(e) => update({ [key]: e.target.checked })} /> : <input className="nodrag block w-full border-2 border-black" type="number" value={Number(data[key] ?? 0)} onChange={(e) => update({ [key]: Number(e.target.value) })} />}</label>;
  return <div className="space-y-2">
    {field("provider", "Engine", ["meshy", "hunyuan", "tripo-p2", "tripo-h31"])}
    {tripo ? <>
      {field("tripoFaceLimit", "Target faces")}{field("tripoQuad", "Quad topology (may return FBX)")}
      {field("tripoTexture", "Textures")}{field("tripoPbr", "PBR (also enables textures)")}
      {field("tripoTextureQuality", "Texture quality", p2 ? ["fast", "standard", "detailed", "extreme"] : ["standard", "detailed"])}
      {field("tripoAutoSize", "Real-world scale")}
      {p2 ? <>{field("tripoTextureVersion", "Texture version", ["v3.5-20260815", "v3.0-20250812", "v2.5-20250123"])}{field("tripoExportUv", "Export UVs")}{field("tripoDelight", "Remove baked lighting")}{field("tripoExportOrientation", "Forward axis", ["", "+x", "-x", "+y", "-y"])}</> : <>{field("tripoMultiview", "Multi-view input (front / left / back / right)")}{field("tripoGeometryQuality", "Geometry quality", ["standard", "detailed"])}{field("tripoTextureAlignment", "Texture alignment", ["original_image", "geometry"])}{field("tripoOrientation", "Orientation", ["default", "align_image"])}</>}
      <details className="nodrag"><summary className="text-xs">Seeds (optional)</summary>{field("tripoModelSeed", "Geometry seed")}{field("tripoTextureSeed", "Texture seed")}</details>
    </> : data.provider === "meshy" ? <>{field("meshyUseMultiview", "Multi-image")}{field("meshyTargetPolycount", "Target polygons")}{field("meshyTopology", "Topology", ["triangle", "quad"])}{field("meshyPolyMode", "Poly mode", ["standard", "low"])}{field("meshyShouldTexture", "Textures")}{field("meshyEnablePbr", "PBR")}</> : <>{field("hunyuanFaceCount", "Face count")}{field("hunyuanEnablePbr", "PBR")}{field("hunyuanGenerateType", "Generation", ["Normal", "LowPoly", "Geometry"])}</>}
  </div>;
}
