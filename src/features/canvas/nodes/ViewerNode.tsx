"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useSnapshot } from "valtio";

import { getAssetUrl } from "@/lib/assets/url";
import { graphHistory, updateViewerNode } from "@/lib/graph/store";
import { getIncomingGlbAssetId } from "@/lib/graph/selectors";
import type { ViewerNode as ViewerGraphNode } from "@/lib/graph/types";
import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";

export function ViewerNode({ id, data }: NodeProps<ViewerGraphNode>) {
  const graph = useSnapshot(graphHistory.value);
  const glbAssetId = getIncomingGlbAssetId(
    id,
    graph.nodes as unknown as import("@/lib/graph/types").CarvingNode[],
    graph.edges as unknown as import("@/lib/graph/types").CarvingEdge[],
  );

  return (
    <NodeChrome
      title="Viewer"
      accentClassName="bg-[#8cff3e]"
      className="w-[380px]"
      testId="viewer-node"
      nodeId={id}
    >
      <Handle
        data-testid="viewer-glb-in"
        type="target"
        id="glb-in"
        position={Position.Left}
      />
      <div
        data-testid="viewer-surface"
        className="nodrag nopan nowheel aspect-square overflow-hidden border-[3px] border-black bg-[#f9f5e8]"
      >
        {glbAssetId ? (
          <model-viewer
            src={getAssetUrl(glbAssetId)}
            camera-controls
            auto-rotate={data.autoRotate ? "" : undefined}
            exposure={String(data.exposure)}
            environment-image="neutral"
            shadow-intensity="1"
            class="nodrag nopan nowheel"
            style={{ width: "100%", height: "100%", background: "#fafaf5" }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,transparent_49%,rgba(0,0,0,0.08)_49%_51%,transparent_51%)] bg-[length:14px_14px] text-center font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">
            Connect a GLB
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => updateViewerNode(id, { autoRotate: !data.autoRotate })}
          className={`nodrag h-8 shrink-0 border-[3px] border-black px-2.5 text-[10px] font-black uppercase tracking-[0.14em] ${
            data.autoRotate ? "bg-black text-white" : "bg-white text-black hover:bg-[#e8ffdb]"
          }`}
        >
          {data.autoRotate ? "Auto-rotate: on" : "Auto-rotate: off"}
        </button>
        <label className="flex flex-1 items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/55">Exp</span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={data.exposure}
            onChange={(event) => updateViewerNode(id, { exposure: Number(event.target.value) })}
            className="nodrag h-2 w-full cursor-pointer appearance-none border-[3px] border-black bg-white accent-black"
          />
          <span className="w-8 text-right font-mono text-[10px] font-semibold text-black/70">
            {data.exposure.toFixed(1)}
          </span>
        </label>
      </div>
    </NodeChrome>
  );
}
