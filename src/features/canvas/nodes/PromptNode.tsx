"use client";
/* eslint-disable @next/next/no-img-element */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useMutation } from "@tanstack/react-query";
import { fal } from "@fal-ai/client";
import { useSnapshot } from "valtio";

import { getAssetUrl } from "@/lib/assets/url";
import { fetchJson } from "@/lib/api/client";
import { buildImageRequest, pickImageSlug } from "@/lib/fal/image";
import { IMAGE_MODEL_CAPABILITIES, type ImageModelBase, type ImageResolution } from "@/lib/fal/models";
import { graphHistory, markNodeDirty, updatePromptNode } from "@/lib/graph/store";
import {
  countUpstreamPromptAncestors,
  getIncomingImageAssetIds,
  getIncomingImageUrls,
} from "@/lib/graph/selectors";
import type { PromptNode as PromptGraphNode } from "@/lib/graph/types";
import { getErrorMessage, showErrorToast, showLoadingToast, showSuccessToast } from "@/lib/notifications/toast";
import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";

type FalQueueStatus = {
  status: string;
};

const ASPECT_RATIO_CLASS_BY_VALUE = {
  "1:1": "aspect-square",
  "3:4": "aspect-[3/4]",
  "4:3": "aspect-[4/3]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-[16/9]",
  "3:2": "aspect-[3/2]",
  "2:3": "aspect-[2/3]",
} as const;

export function PromptNode({ id, data }: NodeProps<PromptGraphNode>) {
  const graph = useSnapshot(graphHistory.value);
  const references = getIncomingImageUrls(
    id,
    graph.nodes as unknown as PromptGraphNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );
  const referenceAssetIds = getIncomingImageAssetIds(
    id,
    graph.nodes as unknown as PromptGraphNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );
  const upstreamPromptCount = countUpstreamPromptAncestors(
    id,
    graph.nodes as unknown as PromptGraphNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );
  const activeAssetId =
    data.activeAssetId && data.outputAssetIds.includes(data.activeAssetId)
      ? data.activeAssetId
      : data.outputAssetIds.at(-1) ?? null;
  const history = data.outputAssetIds
    .filter((assetId) => assetId !== activeAssetId)
    .reverse();

  function selectVersion(assetId: string) {
    if (assetId === activeAssetId) return;
    const meta = data.versionMetadata?.[assetId];
    const patch: {
      activeAssetId: string;
      text?: string;
      model?: PromptGraphNode["data"]["model"];
      aspectRatio?: PromptGraphNode["data"]["aspectRatio"];
      resolution?: PromptGraphNode["data"]["resolution"];
      seed?: number | null;
      inputsChangedSinceLastRun?: boolean;
    } = { activeAssetId: assetId };
    if (meta) {
      patch.text = meta.prompt;
      patch.model = meta.model;
      patch.aspectRatio = meta.aspectRatio;
      patch.resolution = meta.resolution;
      patch.seed = meta.seed ?? null;
      // If the currently-wired references match the snapshot's, this
      // version is fully re-runnable as-is — clear the "inputs changed"
      // ping. If they diverge (user rewired since), keep it lit.
      const snapRefs = meta.referenceAssetIds ?? [];
      const liveRefs = referenceAssetIds;
      const refsMatch =
        snapRefs.length === liveRefs.length &&
        snapRefs.every((snapId, i) => snapId === liveRefs[i]);
      patch.inputsChangedSinceLastRun = !refsMatch;
    }
    updatePromptNode(id, patch);
    markNodeDirty(id);
  }
  const capability = IMAGE_MODEL_CAPABILITIES[data.model];
  const aspectRatioClass = ASPECT_RATIO_CLASS_BY_VALUE[data.aspectRatio];

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!graph.activeProjectId) {
        throw new Error("No active project.");
      }

      // Cap the reference list to the model's ceiling. Chain-through can
      // surface more images than e.g. Flux Kontext's 1 — sending past the
      // cap gets a 422 from fal.
      const cappedReferences = references.slice(0, capability.maxReferences);
      const slug = pickImageSlug(data.model, cappedReferences);
      const input = buildImageRequest({
        modelBase: data.model,
        prompt: data.text,
        referenceImages: cappedReferences,
        aspectRatio: data.aspectRatio,
        resolution: data.resolution,
        seed: data.seed,
      });

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

      updatePromptNode(id, {
        activeJobId: job.jobId,
        runStatus: "IN_QUEUE",
        errorMessage: null,
      });

      let status = (await fal.queue.status(slug, {
        requestId: submission.request_id,
        logs: true,
      })) as FalQueueStatus;

      while (status.status !== "COMPLETED" && status.status !== "FAILED") {
        updatePromptNode(id, {
          runStatus: status.status,
        });

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
            error: "fal generation failed",
          }),
        });

        throw new Error("fal generation failed");
      }

      const result = await fal.queue.result(slug, {
        requestId: submission.request_id,
      });

      const imageUrl = result.data.images?.[0]?.url;
      if (!imageUrl) {
        throw new Error("No image returned by fal.");
      }

      const persisted = await fetchJson<{ assetId: string; url: string; bytes: number }>(
        "/api/assets/persist",
        {
          method: "POST",
          body: JSON.stringify({
            sourceUrl: imageUrl,
            kind: "image",
            jobId: job.jobId,
          }),
        },
      );

      await fetchJson(`/api/jobs/${job.jobId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          state: "succeeded",
          responseSummary: result.data,
          outputAssetIds: [persisted.assetId],
        }),
      });

      return persisted.assetId;
    },
    onMutate: () => {
      return showLoadingToast({
        title: "Prompt running",
        description:
          referenceAssetIds.length > 0
            ? `${referenceAssetIds.length} reference image${referenceAssetIds.length === 1 ? "" : "s"}`
            : "Text-only generation",
      });
    },
    onSuccess: (assetId, _variables, toastId) => {
      updatePromptNode(id, {
        activeJobId: null,
        outputAssetIds: [...data.outputAssetIds, assetId],
        activeAssetId: assetId,
        versionMetadata: {
          ...(data.versionMetadata ?? {}),
          [assetId]: {
            prompt: data.text,
            model: data.model,
            aspectRatio: data.aspectRatio,
            resolution: data.resolution,
            seed: data.seed ?? null,
            referenceAssetIds: referenceAssetIds.slice(0, capability.maxReferences),
            createdAt: Date.now(),
          },
        },
        inputsChangedSinceLastRun: false,
        runStatus: null,
        errorMessage: null,
      });
      markNodeDirty(id);
      showSuccessToast(toastId, {
        title: "Prompt complete",
        description: "New image added to history.",
      });
    },
    onError: (error, _variables, toastId) => {
      updatePromptNode(id, {
        activeJobId: null,
        runStatus: "FAILED",
        errorMessage: getErrorMessage(error, "Prompt run failed."),
      });
      showErrorToast(toastId, {
        title: "Prompt failed",
        description: getErrorMessage(error, "Prompt run failed."),
      });
    },
  });

  const estimate = capability.estimateByResolution[data.resolution] ?? capability.estimateByResolution["1K"];
  const runDisabled = runMutation.isPending || data.text.trim().length === 0;
  const changedDot = data.inputsChangedSinceLastRun && !runMutation.isPending;

  const promptPreview = data.text.trim().length > 0 ? data.text.trim() : "(no prompt)";

  return (
    <NodeChrome
      title="Prompt"
      accentClassName="bg-[#ffd400]"
      testId="prompt-node"
      nodeId={id}
      collapsed={data.collapsed}
      onToggleCollapsed={() => {
        updatePromptNode(id, { collapsed: !data.collapsed });
        markNodeDirty(id);
      }}
    >
      <Handle
        data-testid="prompt-image-in"
        type="target"
        id="image-in"
        position={Position.Left}
      />
      {data.collapsed ? (
        <div className="relative aspect-square w-full overflow-hidden border-[3px] border-black bg-[#f9f5e8]" title={promptPreview}>
          {activeAssetId ? (
            <img src={getAssetUrl(activeAssetId)} alt="Latest output" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-2 font-mono text-[10px] leading-[1.35] text-black/55 line-clamp-6">
              {promptPreview}
            </div>
          )}
          {runMutation.isPending ? <RunningOverlay label={data.runStatus ?? "Running"} /> : null}
        </div>
      ) : (
      <>
      <textarea
        data-testid="prompt-textarea"
        value={data.text}
        onChange={(event) => {
          updatePromptNode(id, { text: event.target.value, inputsChangedSinceLastRun: true });
          markNodeDirty(id);
        }}
        className="nodrag block min-h-[96px] w-full resize-none border-[3px] border-black bg-white p-2.5 font-mono text-[13px] font-normal leading-[1.45] outline-none placeholder:text-black/35"
        placeholder="Describe the carving concept…"
      />

      <Field label="Model">
        <select
          data-testid="prompt-model"
          value={data.model}
          onChange={(event) => {
            const model = event.target.value as ImageModelBase;
            const nextCapability = IMAGE_MODEL_CAPABILITIES[model];
            const nextResolution = nextCapability.resolutions.includes(data.resolution)
              ? data.resolution
              : "1K";
            const nextAspectRatio = nextCapability.aspectRatios.includes(data.aspectRatio)
              ? data.aspectRatio
              : nextCapability.aspectRatios[0];
            updatePromptNode(id, {
              model,
              aspectRatio: nextAspectRatio,
              resolution: nextResolution as ImageResolution,
              inputsChangedSinceLastRun: true,
            });
            markNodeDirty(id);
          }}
          className="nodrag h-9 w-full border-[3px] border-black bg-white px-2.5 text-[13px] font-semibold leading-none"
        >
          {Object.entries(IMAGE_MODEL_CAPABILITIES).map(([model, meta]) => (
            <option key={model} value={model}>
              {meta.displayName} · {meta.tagline}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Aspect">
        <ChipRow>
          {capability.aspectRatios.map((ratio: (typeof capability.aspectRatios)[number]) => (
            <Chip
              key={ratio}
              active={ratio === data.aspectRatio}
              onClick={() => {
                updatePromptNode(id, { aspectRatio: ratio, inputsChangedSinceLastRun: true });
                markNodeDirty(id);
              }}
            >
              {ratio}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field
        label={`References ${referenceAssetIds.length > 0 ? `(${referenceAssetIds.length}/${capability.maxReferences})` : ""}`}
      >
        {upstreamPromptCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              updatePromptNode(id, {
                chainSources: !(data.chainSources ?? false),
                inputsChangedSinceLastRun: true,
              });
              markNodeDirty(id);
            }}
            title="When on, this Prompt sees every upstream reference image flattened down the chain, not just the direct output."
            className={`flex items-center justify-between gap-2 border-[3px] border-black px-2 py-1.5 text-[10px] font-black uppercase leading-none tracking-[0.14em] ${
              data.chainSources
                ? "bg-black text-white"
                : "bg-white text-black hover:bg-[#fff7cc]"
            }`}
          >
            <span>Chain upstream refs</span>
            <span className={`inline-block h-2.5 w-2.5 border-[2px] border-black ${data.chainSources ? "bg-[#ffd400]" : "bg-white"}`} aria-hidden />
          </button>
        ) : null}

        {referenceAssetIds.length > 0 ? (
          <div className="space-y-2">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-black/55">
              {data.chainSources
                ? `Chained from ${upstreamPromptCount} upstream prompt${upstreamPromptCount === 1 ? "" : "s"} · sent in wire order.`
                : "Connected images are sent together in wire order."}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {referenceAssetIds.map((assetId, index) => (
                <div
                  key={`${assetId}-${index}`}
                  className="relative h-14 w-14 shrink-0 overflow-hidden border-[3px] border-black bg-[#f3efe2]"
                  title={`Reference ${index + 1}`}
                >
                  <img
                    src={getAssetUrl(assetId)}
                    alt={`Reference ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute left-0 top-0 border-r-[3px] border-b-[3px] border-black bg-[#fffdf5] px-1 py-0.5 text-[10px] font-black leading-none">
                    {index + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="border-[3px] border-dashed border-black/35 bg-[#f7f2e0] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-black/55">
            Connect up to {capability.maxReferences} reference images.
          </div>
        )}
        {referenceAssetIds.length > capability.maxReferences ? (
          data.chainSources ? (
            <p className="font-mono text-[11px] leading-[1.35] text-black/70">
              {capability.displayName} caps at {capability.maxReferences} reference image
              {capability.maxReferences === 1 ? "" : "s"}. First {capability.maxReferences} in
              wire order will be sent.
            </p>
          ) : (
            <p className="font-mono text-[11px] leading-[1.35] text-[#d8421b]">
              {capability.displayName} only accepts {capability.maxReferences} reference image
              {capability.maxReferences === 1 ? "" : "s"}. Remove extras before running.
            </p>
          )
        ) : null}
      </Field>

      {capability.resolutions.length > 1 ? (
        <Field label="Resolution">
          <ChipRow>
            {capability.resolutions.map((resolution: (typeof capability.resolutions)[number]) => (
              <Chip
                key={resolution}
                active={resolution === data.resolution}
                onClick={() => {
                  updatePromptNode(id, { resolution, inputsChangedSinceLastRun: true });
                  markNodeDirty(id);
                }}
              >
                {resolution}
              </Chip>
            ))}
          </ChipRow>
        </Field>
      ) : null}

      <div className={`relative overflow-hidden border-[3px] border-black bg-[#f9f5e8] ${aspectRatioClass}`}>
        {activeAssetId ? (
          <img src={getAssetUrl(activeAssetId)} alt="Latest output" className="h-full w-full object-cover" />
        ) : (
          <EmptySlot label="Latest output" />
        )}
        {runMutation.isPending ? <RunningOverlay label={data.runStatus ?? "Running"} /> : null}
      </div>

      {history.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-black/55">
              History · {data.outputAssetIds.length}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
              click to restore
            </span>
          </div>
          <div data-testid="history-strip" className="nodrag flex gap-2 overflow-x-auto pb-0.5">
            {history.map((assetId: string) => {
              const meta = data.versionMetadata?.[assetId];
              const promptSnippet = meta?.prompt?.trim().slice(0, 120) ?? "(no snapshot — click to switch image only)";
              return (
                <button
                  key={assetId}
                  type="button"
                  onClick={() => selectVersion(assetId)}
                  title={promptSnippet}
                  className="group relative h-12 w-12 shrink-0 overflow-hidden border-[3px] border-black bg-white transition hover:-translate-y-[1px] hover:shadow-[3px_3px_0_0_#0a0a0a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                >
                  <img
                    src={getAssetUrl(assetId)}
                    alt="Previous run"
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <button
        data-testid="run-button"
        type="button"
        disabled={runDisabled}
        onClick={() => runMutation.mutate()}
        className="flex h-11 w-full items-center justify-between gap-3 border-[3px] border-black bg-[#ffd400] px-3 text-[12px] font-black uppercase tracking-[0.16em] shadow-[4px_4px_0_0_#0a0a0a] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#0a0a0a] disabled:cursor-not-allowed disabled:bg-[#e5dfc9] disabled:text-black/40 disabled:shadow-none"
      >
        <span className="flex items-center gap-2">
          {runMutation.isPending ? "Running…" : "Run"}
          {changedDot ? <span className="inline-block h-2 w-2 bg-[#d8421b]" aria-hidden /> : null}
        </span>
        <span className="font-mono text-[11px] font-medium text-black/70">
          ~${estimate?.toFixed(2) ?? "0.00"}
        </span>
      </button>
      {data.errorMessage ? (
        <p className="font-mono text-[11px] leading-[1.3] text-[#d8421b]">{data.errorMessage}</p>
      ) : null}
      </>
      )}

      <Handle
        data-testid="prompt-image-out"
        type="source"
        id="image-out"
        position={Position.Right}
      />
    </NodeChrome>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-black/55">{label}</div>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 border-[3px] border-black px-2 font-mono text-[11px] font-semibold leading-none tracking-wide ${
        active ? "bg-black text-white" : "bg-white text-black hover:bg-[#fff7cc]"
      }`}
    >
      {children}
    </button>
  );
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[176px] items-center justify-center bg-[linear-gradient(135deg,transparent_49%,rgba(0,0,0,0.08)_49%_51%,transparent_51%)] bg-[length:14px_14px] text-center font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-black/45">
      {label}
    </div>
  );
}

function RunningOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.28)_0_8px,transparent_8px_16px)] p-2">
      <span className="inline-block self-start border-[2px] border-black bg-[#ffd400] px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
        {label}
      </span>
    </div>
  );
}
