"use client";
/* eslint-disable @next/next/no-img-element */

import { fal } from "@fal-ai/client";
import { useMutation } from "@tanstack/react-query";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useSnapshot } from "valtio";

import { fetchJson } from "@/lib/api/client";
import { getAssetUrl } from "@/lib/assets/url";
import { buildVideoRequest, extractVideoUrl, pickVideoSlug } from "@/lib/fal/video";
import {
  VIDEO_MODE_OPTIONS,
  VIDEO_MODEL_CAPABILITIES,
  VIDEO_MODEL_OPTIONS,
  VIDEO_TIER_OPTIONS,
  type AnyVideoAspectRatio,
  type AnyVideoDuration,
  type AnyVideoResolution,
  type VideoMode,
  type VideoModel,
  type VideoTier,
} from "@/lib/fal/models";
import { getIncomingImageAssetIds, getIncomingImageUrls } from "@/lib/graph/selectors";
import { graphHistory, markNodeDirty, updateVideoNode } from "@/lib/graph/store";
import type { VideoNode as VideoGraphNode } from "@/lib/graph/types";
import { getErrorMessage, showErrorToast, showLoadingToast, showSuccessToast } from "@/lib/notifications/toast";
import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";

type FalQueueStatus = {
  status: string;
};

const MODE_LABEL: Record<VideoMode, string> = {
  text: "Text to video",
  image: "Image to video",
  reference: "Reference to video",
};

export function VideoNode({ id, data }: NodeProps<VideoGraphNode>) {
  const graph = useSnapshot(graphHistory.value);
  const imageUrls = getIncomingImageUrls(
    id,
    graph.nodes as unknown as import("@/lib/graph/types").CarvingNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );
  const imageAssetIds = getIncomingImageAssetIds(
    id,
    graph.nodes as unknown as import("@/lib/graph/types").CarvingNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );
  const activeAssetId =
    data.activeAssetId && data.outputAssetIds.includes(data.activeAssetId)
      ? data.activeAssetId
      : data.outputAssetIds.at(-1) ?? null;
  const capability = VIDEO_MODEL_CAPABILITIES[data.model];
  const maxImages = capability.maxImagesByMode[data.mode];
  const sentImageUrls = imageUrls.slice(0, maxImages);
  const sentImageAssetIds = imageAssetIds.slice(0, maxImages);

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!graph.activeProjectId) {
        throw new Error("No active project.");
      }

      const input = buildVideoRequest({
        model: data.model,
        mode: data.mode,
        tier: data.tier,
        prompt: data.text,
        imageUrls: sentImageUrls,
        aspectRatio: data.aspectRatio,
        resolution: data.resolution,
        duration: data.duration,
        generateAudio: data.generateAudio,
        seed: data.seed,
      });
      const slug = pickVideoSlug({ model: data.model, mode: data.mode, tier: data.tier });

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

      updateVideoNode(id, {
        activeJobId: job.jobId,
        runStatus: "IN_QUEUE",
        errorMessage: null,
      });

      let status = (await fal.queue.status(slug, {
        requestId: submission.request_id,
        logs: true,
      })) as FalQueueStatus;

      while (status.status !== "COMPLETED" && status.status !== "FAILED") {
        updateVideoNode(id, { runStatus: status.status });
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
            error: "Video generation failed.",
          }),
        });
        throw new Error("Video generation failed.");
      }

      const result = await fal.queue.result(slug, {
        requestId: submission.request_id,
      });
      const videoUrl = extractVideoUrl(result);
      if (!videoUrl) {
        throw new Error("No video returned by fal.");
      }

      const persisted = await fetchJson<{ assetId: string; url: string; bytes: number }>(
        "/api/assets/persist",
        {
          method: "POST",
          body: JSON.stringify({
            sourceUrl: videoUrl,
            kind: "video",
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

      return {
        assetId: persisted.assetId,
        seed: (result.data as { seed?: number } | undefined)?.seed ?? null,
      };
    },
    onMutate: () => {
      return showLoadingToast({
        title: "Video running",
        description: `${VIDEO_MODEL_OPTIONS.find((model) => model.value === data.model)?.label ?? "Video"} · ${MODE_LABEL[data.mode]}`,
      });
    },
    onSuccess: (result, _variables, toastId) => {
      updateVideoNode(id, {
        activeJobId: null,
        outputAssetIds: [...data.outputAssetIds, result.assetId],
        activeAssetId: result.assetId,
        inputsChangedSinceLastRun: false,
        runStatus: null,
        errorMessage: null,
        lastRunSeed: result.seed,
      });
      markNodeDirty(id);
      showSuccessToast(toastId, {
        title: "Video complete",
        description: "New video added to the node.",
      });
    },
    onError: (error, _variables, toastId) => {
      updateVideoNode(id, {
        activeJobId: null,
        runStatus: "FAILED",
        errorMessage: getErrorMessage(error, "Video run failed."),
      });
      showErrorToast(toastId, {
        title: "Video failed",
        description: getErrorMessage(error, "Video run failed."),
      });
    },
  });

  const requiresImage = data.mode === "image" || data.model === "veo3.1-fast-reference";
  const runDisabled =
    runMutation.isPending ||
    data.text.trim().length === 0 ||
    (requiresImage && sentImageUrls.length === 0);
  const estimateSeconds = data.duration.endsWith("s")
    ? Number(data.duration.replace("s", ""))
    : data.duration === "auto"
      ? 8
      : Number(data.duration);
  const pricePerSecond = data.model === "seedance-2.0" ? VIDEO_TIER_OPTIONS[data.tier].pricePerSecond : 0.4;
  const estimate = pricePerSecond === null ? null : estimateSeconds * pricePerSecond;
  const changedDot = data.inputsChangedSinceLastRun && !runMutation.isPending;

  if (data.collapsed) {
    return (
      <NodeChrome
        title="Video"
        accentClassName="bg-[#36d399]"
        testId="video-node"
        nodeId={id}
        collapsed
        onToggleCollapsed={() => updateVideoNode(id, { collapsed: false })}
      >
        <Handle data-testid="video-image-in" type="target" id="image-in" position={Position.Left} />
        <VideoPreview assetId={activeAssetId} running={runMutation.isPending} status={data.runStatus} compact />
      </NodeChrome>
    );
  }

  return (
    <NodeChrome
      title="Video"
      accentClassName="bg-[#36d399]"
      testId="video-node"
      nodeId={id}
      collapsed={false}
      onToggleCollapsed={() => updateVideoNode(id, { collapsed: true })}
    >
      <Handle data-testid="video-image-in" type="target" id="image-in" position={Position.Left} />

      <textarea
        data-testid="video-textarea"
        value={data.text}
        onChange={(event) => {
          updateVideoNode(id, { text: event.target.value, inputsChangedSinceLastRun: true });
          markNodeDirty(id);
        }}
        className="nodrag block min-h-[92px] w-full resize-none border-[3px] border-black bg-white p-2.5 font-mono text-[13px] font-normal leading-[1.45] outline-none placeholder:text-black/35"
        placeholder="Describe motion, camera, action, and sound…"
      />

      <Field label="Model">
        <select
          data-testid="video-model"
          value={data.model}
          onChange={(event) => {
            const model = event.target.value as VideoModel;
            const nextCapability = VIDEO_MODEL_CAPABILITIES[model];
            const mode = includesValue(nextCapability.supportedModes, data.mode)
              ? data.mode
              : nextCapability.supportedModes[0];
            const tier = includesValue(nextCapability.tiers, data.tier) ? data.tier : nextCapability.tiers[0];
            updateVideoNode(id, {
              model,
              mode,
              tier,
              resolution: includesValue(nextCapability.resolutions, data.resolution) ? data.resolution : nextCapability.resolutions[0],
              duration: includesValue(nextCapability.durations, data.duration) ? data.duration : nextCapability.durations[0],
              aspectRatio: includesValue(nextCapability.aspectRatios, data.aspectRatio) ? data.aspectRatio : nextCapability.aspectRatios[0],
              inputsChangedSinceLastRun: true,
            });
            markNodeDirty(id);
          }}
          className="nodrag h-9 w-full border-[3px] border-black bg-white px-2.5 text-[13px] font-semibold leading-none"
        >
          {VIDEO_MODEL_OPTIONS.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label} · {model.tagline}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Mode">
        <ChipRow>
          {VIDEO_MODE_OPTIONS.filter((mode) => includesValue(capability.supportedModes, mode.value)).map((mode) => (
            <Chip
              key={mode.value}
              active={mode.value === data.mode}
              onClick={() => {
                updateVideoNode(id, { mode: mode.value, inputsChangedSinceLastRun: true });
                markNodeDirty(id);
              }}
            >
              {mode.label}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      {capability.tiers.length > 1 ? (
        <Field label="Tier">
          <ChipRow>
            {capability.tiers.map((tier) => (
              <Chip
                key={tier}
                active={tier === data.tier}
                onClick={() => {
                  updateVideoNode(id, { tier: tier as VideoTier, inputsChangedSinceLastRun: true });
                  markNodeDirty(id);
                }}
              >
                {VIDEO_TIER_OPTIONS[tier].label}
              </Chip>
            ))}
          </ChipRow>
        </Field>
      ) : null}

      <Field label={`Images ${maxImages > 0 ? `(${sentImageAssetIds.length}/${maxImages})` : ""}`}>
        <ImageReferences assetIds={sentImageAssetIds} mode={data.mode} maxImages={maxImages} />
        {imageAssetIds.length > maxImages ? (
          <p className="font-mono text-[11px] leading-[1.35] text-black/70">
            First {maxImages} connected images will be sent.
          </p>
        ) : null}
      </Field>

      <Field label="Output">
        <VideoPreview assetId={activeAssetId} running={runMutation.isPending} status={data.runStatus} />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <SelectField
          label="Aspect"
          value={data.aspectRatio}
          options={capability.aspectRatios}
          onChange={(value) => updateAndDirty(id, { aspectRatio: value })}
        />
        <SelectField
          label="Dur"
          value={data.duration}
          options={capability.durations}
          onChange={(value) => updateAndDirty(id, { duration: value })}
        />
        <SelectField
          label="Res"
          value={data.resolution}
          options={capability.resolutions}
          onChange={(value) => updateAndDirty(id, { resolution: value })}
        />
      </div>

      <div className="grid grid-cols-[1fr_96px] gap-2">
        <button
          type="button"
          onClick={() => updateAndDirty(id, { generateAudio: !data.generateAudio })}
          className={`nodrag h-9 border-[3px] border-black px-2 text-[10px] font-black uppercase tracking-[0.14em] ${
            data.generateAudio ? "bg-black text-white" : "bg-white text-black hover:bg-[#ddfbed]"
          }`}
        >
          Audio {data.generateAudio ? "on" : "off"}
        </button>
        <input
          type="number"
          value={data.seed ?? ""}
          onChange={(event) => {
            const value = event.target.value.trim();
            updateAndDirty(id, { seed: value.length > 0 ? Number(value) : null });
          }}
          placeholder="seed"
          className="nodrag h-9 border-[3px] border-black bg-white px-2 font-mono text-[11px] outline-none"
        />
      </div>

      <button
        data-testid="video-run-button"
        type="button"
        disabled={runDisabled}
        onClick={() => runMutation.mutate()}
        className="flex h-11 w-full items-center justify-between gap-3 border-[3px] border-black bg-[#36d399] px-3 text-[12px] font-black uppercase tracking-[0.16em] text-black shadow-[4px_4px_0_0_#0a0a0a] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#0a0a0a] disabled:cursor-not-allowed disabled:bg-[#cfe8d8] disabled:text-black/40 disabled:shadow-none"
      >
        <span className="flex items-center gap-2">
          {runMutation.isPending ? "Running…" : activeAssetId ? "Re-run" : "Run"}
          {changedDot ? <span className="inline-block h-2 w-2 bg-[#d8421b]" aria-hidden /> : null}
        </span>
        <span className="font-mono text-[11px] font-medium text-black/70">{estimate === null ? "" : `~$${estimate.toFixed(2)}`}</span>
      </button>

      {activeAssetId ? (
        <a
          href={getAssetUrl(activeAssetId)}
          download
          className="h-8 border-[3px] border-black bg-white px-2 text-center font-mono text-[10px] font-bold uppercase leading-[26px] tracking-[0.14em] hover:bg-[#ddfbed]"
        >
          Download mp4
        </a>
      ) : null}

      {data.errorMessage ? (
        <p className="font-mono text-[11px] leading-[1.3] text-[#d8421b]">{data.errorMessage}</p>
      ) : null}
    </NodeChrome>
  );
}

function updateAndDirty(nodeId: string, patch: Partial<VideoGraphNode["data"]>) {
  updateVideoNode(nodeId, { ...patch, inputsChangedSinceLastRun: true });
  markNodeDirty(nodeId);
}

function includesValue<T>(values: readonly T[], value: unknown): value is T {
  return (values as readonly unknown[]).includes(value);
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

function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 border-[3px] border-black px-2 font-mono text-[11px] font-semibold leading-none tracking-wide ${
        active ? "bg-black text-white" : "bg-white text-black hover:bg-[#ddfbed]"
      }`}
    >
      {children}
    </button>
  );
}

function SelectField<T extends AnyVideoAspectRatio | AnyVideoDuration | AnyVideoResolution>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-black/55">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="nodrag h-8 w-full border-[3px] border-black bg-white px-1.5 font-mono text-[11px] font-semibold"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ImageReferences({ assetIds, mode, maxImages }: { assetIds: string[]; mode: VideoMode; maxImages: number }) {
  if (maxImages === 0) {
    return (
      <div className="border-[3px] border-dashed border-black/35 bg-[#edf8ef] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-black/55">
        Text mode ignores connected images.
      </div>
    );
  }

  if (assetIds.length === 0) {
    return (
      <div className="border-[3px] border-dashed border-black/35 bg-[#edf8ef] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-black/55">
        {mode === "image" ? "Connect a start image. Optional second image becomes the end frame." : `Connect up to ${maxImages} reference images.`}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {assetIds.map((assetId, index) => (
        <div
          key={`${assetId}-${index}`}
          className="relative h-14 w-14 shrink-0 overflow-hidden border-[3px] border-black bg-[#f3efe2]"
          title={mode === "image" && index === 1 ? "End frame" : `Reference ${index + 1}`}
        >
          <img src={getAssetUrl(assetId)} alt={`Video input ${index + 1}`} className="h-full w-full object-cover" />
          <div className="absolute left-0 top-0 border-r-[3px] border-b-[3px] border-black bg-[#fffdf5] px-1 py-0.5 text-[10px] font-black leading-none">
            {mode === "image" && index === 1 ? "END" : index + 1}
          </div>
        </div>
      ))}
    </div>
  );
}

function VideoPreview({
  assetId,
  running,
  status,
  compact,
}: {
  assetId: string | null;
  running: boolean;
  status?: string | null;
  compact?: boolean;
}) {
  return (
    <div className={`nodrag nopan nowheel relative overflow-hidden border-[3px] border-black bg-[#f9f5e8] ${compact ? "aspect-video" : "aspect-video"}`}>
      {assetId ? (
        <video
          src={getAssetUrl(assetId)}
          controls
          playsInline
          className="h-full w-full bg-black object-contain"
        />
      ) : (
        <div className="flex h-full min-h-[168px] items-center justify-center bg-[linear-gradient(135deg,transparent_49%,rgba(0,0,0,0.08)_49%_51%,transparent_51%)] bg-[length:14px_14px] font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">
          Video output
        </div>
      )}
      {running ? (
        <div className="pointer-events-none absolute inset-0 flex items-end bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.28)_0_8px,transparent_8px_16px)] p-2">
          <span className="inline-block border-[2px] border-black bg-[#36d399] px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-black">
            {status ?? "Running"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
