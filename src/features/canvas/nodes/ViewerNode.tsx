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
    <NodeChrome title="Viewer" accentClassName="bg-[#8cff3e]" className="w-[360px]" testId="viewer-node" nodeId={id}>
      <Handle data-testid="viewer-glb-in" type="target" id="glb-in" position={Position.Left} className="!h-4 !w-4 !border-[3px] !border-black !bg-white" />
      <div
        data-testid="viewer-surface"
        className="nodrag nopan nowheel h-64 overflow-hidden border-[3px] border-black bg-[#f7f2e0]"
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
          <div className="flex h-full items-center justify-center font-mono text-xs uppercase">
            Connect a GLB to preview
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => updateViewerNode(id, { autoRotate: !data.autoRotate })}
          className="nodrag border-[3px] border-black bg-white px-2 py-1 text-xs font-black uppercase"
        >
          {data.autoRotate ? "Auto-rotate on" : "Auto-rotate off"}
        </button>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={data.exposure}
          onChange={(event) => updateViewerNode(id, { exposure: Number(event.target.value) })}
          className="nodrag w-full"
        />
      </div>
    </NodeChrome>
  );
}
