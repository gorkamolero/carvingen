"use client";
/* eslint-disable @next/next/no-img-element */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useMutation } from "@tanstack/react-query";
import { fal } from "@fal-ai/client";
import { useSnapshot } from "valtio";

import { fetchJson } from "@/lib/api/client";
import { getAssetUrl } from "@/lib/assets/url";
import { buildMeshRequest, extractMeshArtifacts, pickMeshSlug } from "@/lib/fal/mesh";
import { graphHistory, markNodeDirty, updateMeshNode } from "@/lib/graph/store";
import { getIncomingImageUrls } from "@/lib/graph/selectors";
import type { MeshNode as MeshGraphNode } from "@/lib/graph/types";
import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";

type FalQueueStatus = {
  status: string;
};

export function MeshNode({ id, data }: NodeProps<MeshGraphNode>) {
  const graph = useSnapshot(graphHistory.value);
  const sourceImages = getIncomingImageUrls(
    id,
    graph.nodes as unknown as import("@/lib/graph/types").CarvingNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!graph.activeProjectId) {
        throw new Error("No active project.");
      }

      const imageUrl = sourceImages[0];
      if (!imageUrl) {
        throw new Error("Connect an image before running Mesh.");
      }

      const slug = pickMeshSlug(data.mode);
      const input = buildMeshRequest({ imageUrl, mode: data.mode });
      const submission = await fal.queue.submit(slug, { input });
      const job = await fetchJson<{ jobId: string }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          projectId: graph.activeProjectId,
          nodeId: id,
          provider: "fal",
          providerJobId: submission.request_id,
          providerSlug: slug,
          requestInput: input,
        }),
      });

      updateMeshNode(id, {
        activeJobId: job.jobId,
        runStatus: "PENDING",
        errorMessage: null,
      });

      let status = (await fal.queue.status(slug, {
        requestId: submission.request_id,
        logs: true,
      })) as FalQueueStatus;

      while (status.status !== "COMPLETED" && status.status !== "FAILED") {
        updateMeshNode(id, { runStatus: status.status });
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        status = (await fal.queue.status(slug, {
          requestId: submission.request_id,
          logs: true,
        })) as FalQueueStatus;
      }

      if (status.status === "FAILED") {
        await fetchJson(`/api/jobs/${job.jobId}/complete`, {
          method: "POST",
          body: JSON.stringify({
            state: "failed",
            error: "Mesh generation failed.",
          }),
        });
        throw new Error("Mesh generation failed.");
      }

      const result = await fal.queue.result(slug, {
        requestId: submission.request_id,
      });

      const artifacts = extractMeshArtifacts(result);
      const persisted = await Promise.all(
        artifacts.map(async (artifact) => {
          const saved = await fetchJson<{ assetId: string; url: string }>(
            "/api/assets/persist",
            {
              method: "POST",
              body: JSON.stringify({
                sourceUrl: artifact.sourceUrl,
                kind: artifact.kind,
                jobId: job.jobId,
              }),
            },
          );

          return { kind: artifact.kind, assetId: saved.assetId };
        }),
      );

      await fetchJson(`/api/jobs/${job.jobId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          state: "succeeded",
          responseSummary: result.data,
          outputAssetIds: persisted.map((item) => item.assetId),
        }),
      });

      return persisted;
    },
    onSuccess: (assets) => {
      const artifactAssetIds = Object.fromEntries(assets.map((asset) => [asset.kind, asset.assetId]));
      updateMeshNode(id, {
        activeJobId: null,
        outputAssetId: artifactAssetIds.glb ?? null,
        thumbnailAssetId: artifactAssetIds.thumbnail ?? null,
        artifactAssetIds,
        inputsChangedSinceLastRun: false,
        runStatus: null,
        errorMessage: null,
      });
      markNodeDirty(id);
    },
    onError: (error) => {
      updateMeshNode(id, {
        activeJobId: null,
        runStatus: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Mesh run failed.",
      });
    },
  });

  const runDisabled = runMutation.isPending || sourceImages.length === 0;

  return (
    <NodeChrome title="Mesh" accentClassName="bg-[#3e8cff]" testId="mesh-node" nodeId={id}>
      <Handle
        data-testid="mesh-image-in"
        type="target"
        id="image-in"
        position={Position.Left}
      />
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

      <div className="relative aspect-square overflow-hidden border-[3px] border-black bg-[#f9f5e8]">
        {data.thumbnailAssetId ? (
          <img src={getAssetUrl(data.thumbnailAssetId)} alt="Mesh thumbnail" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,transparent_49%,rgba(0,0,0,0.08)_49%_51%,transparent_51%)] bg-[length:14px_14px] font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">
            Mesh thumbnail
          </div>
        )}
        {runMutation.isPending ? (
          <div className="pointer-events-none absolute inset-0 flex items-end bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.28)_0_8px,transparent_8px_16px)] p-2">
            <span className="inline-block self-start border-[2px] border-black bg-[#3e8cff] px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
              {data.runStatus ?? "Running"}
            </span>
          </div>
        ) : null}
      </div>

      <button
        data-testid="mesh-run-button"
        type="button"
        onClick={() => runMutation.mutate()}
        disabled={runDisabled}
        className="flex h-11 w-full items-center justify-between gap-3 border-[3px] border-black bg-[#3e8cff] px-3 text-[12px] font-black uppercase tracking-[0.16em] text-white shadow-[4px_4px_0_0_#0a0a0a] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#0a0a0a] disabled:cursor-not-allowed disabled:bg-[#c7d1e2] disabled:text-white/60 disabled:shadow-none"
      >
        <span>{runMutation.isPending ? "Running…" : "Run"}</span>
        <span className="font-mono text-[10px] font-medium text-white/80">
          {data.mode === "refine" ? "~1m · refine" : "~30s · preview"}
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
