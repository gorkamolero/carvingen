"use client";

import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  type NodeTypes,
  type OnConnectEnd,
  ReactFlow,
  type ReactFlowInstance,
  SelectionMode,
} from "@xyflow/react";
import { useCallback, useRef } from "react";
import { useSnapshot } from "valtio";

import { nodeTypes } from "@/features/canvas/flow/nodeTypes";
import { uploadImageAsset } from "@/lib/assets/upload-client";
import {
  addCanvasNode,
  addConnectedPromptFromSource,
  commitGraphInteraction,
  connectNodes,
  graphHistory,
  onEdgesChange,
  onNodesChange,
  updateImageNode,
  updateViewport,
} from "@/lib/graph/store";
import type { CarvingEdge, CarvingNode } from "@/lib/graph/types";
import { getErrorMessage, showErrorToast, showLoadingToast, showSuccessToast } from "@/lib/notifications/toast";

export function CanvasFlow() {
  const graph = useSnapshot(graphHistory.value);
  const flowRef = useRef<ReactFlowInstance<CarvingNode, CarvingEdge> | null>(null);

  const onDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    const position = flowRef.current?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    if (!position) {
      return;
    }

    const paletteData = event.dataTransfer.getData("application/carvingen-node");
    if (paletteData) {
      const parsed = JSON.parse(paletteData) as {
        nodeType: "prompt" | "image" | "mesh" | "viewer" | "vision";
      };
      addCanvasNode(parsed.nodeType, position);
      return;
    }

    const files = Array.from(event.dataTransfer.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0) {
      return;
    }

    // Lay out multiple-file drops on a grid starting at the cursor.
    // STEP_X/Y account for node width + shadow + breathing room so edges
    // never overlap. cols caps at 4 so the row doesn't stretch off screen;
    // overflow wraps to the next row.
    const STEP_X = 352;
    const STEP_Y = 480;
    const cols = Math.min(files.length, 4);

    files.forEach((file, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const nodePosition = {
        x: position.x + col * STEP_X,
        y: position.y + row * STEP_Y,
      };

      const node = addCanvasNode("image", nodePosition);
      updateImageNode(node.id, {
        isUploading: true,
        fileName: file.name,
      });

      const toastId = showLoadingToast({
        title:
          files.length > 1
            ? `Uploading ${index + 1}/${files.length}`
            : "Uploading dropped image",
        description: file.name,
      });

      // Uploads run in parallel; the grid of empty nodes appears immediately
      // and each one fills in as its upload completes.
      void (async () => {
        try {
          const payload = await uploadImageAsset(file);
          updateImageNode(node.id, {
            assetId: payload.assetId,
            previewUrl: payload.url ?? null,
            isUploading: false,
            errorMessage: null,
          });
          showSuccessToast(toastId, {
            title: "Image added to canvas",
            description: file.name,
          });
        } catch (error) {
          updateImageNode(node.id, {
            isUploading: false,
            errorMessage: getErrorMessage(error, "Upload failed."),
          });
          showErrorToast(toastId, {
            title: "Drop upload failed",
            description: getErrorMessage(error, "Upload failed."),
          });
        }
      })();
    });
  }, []);

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      if (connectionState.isValid || !connectionState.fromNode || !flowRef.current) {
        return;
      }

      const point =
        "changedTouches" in event
          ? { x: event.changedTouches[0]?.clientX ?? 0, y: event.changedTouches[0]?.clientY ?? 0 }
          : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };

      const position = flowRef.current.screenToFlowPosition(point);
      addConnectedPromptFromSource(connectionState.fromNode.id, position);
    },
    [],
  );

  return (
    <div className="h-full flex-1" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
      <ReactFlow
        data-testid="canvas-flow"
        nodeTypes={nodeTypes as NodeTypes}
        nodes={[...graph.nodes] as CarvingNode[]}
        edges={[...graph.edges] as CarvingEdge[]}
        onInit={(instance) => {
          flowRef.current = instance;
          instance.setViewport(graph.viewport);
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={commitGraphInteraction}
        onSelectionDragStop={commitGraphInteraction}
        onConnect={(connection) => {
          if (!connection.source) {
            return;
          }

          // Fan-in multi-connect: if the user drags from one of several
          // selected nodes to a single target, wire every selected sibling
          // whose output handle matches the primary. Invalid sibling wires
          // (wrong handle type, duplicate) are silently rejected by
          // connectNodes' canConnect check.
          const primaryOk = connectNodes(connection);
          if (!primaryOk) {
            return;
          }

          const siblings = graph.nodes.filter(
            (node) => node.selected && node.id !== connection.source,
          );
          for (const sibling of siblings) {
            connectNodes({ ...connection, source: sibling.id });
          }
        }}
        onConnectEnd={onConnectEnd}
        connectionMode={ConnectionMode.Loose}
        fitView
        minZoom={0.05}
        maxZoom={3}
        // Figma-style selection: drag on empty canvas = marquee select.
        // Pan with middle mouse / two-finger trackpad scroll instead.
        selectionOnDrag
        panOnDrag={[1, 2]}
        panOnScroll
        selectionMode={SelectionMode.Partial}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Shift", "Meta"]}
        defaultEdgeOptions={{
          type: "default",
          animated: false,
          style: {
            stroke: "#0a0a0a",
            strokeWidth: 3,
          },
        }}
        onMoveEnd={(_event, viewport) => {
          updateViewport(viewport);
          commitGraphInteraction();
        }}
      >
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.04)" nodeStrokeColor="#0a0a0a" nodeStrokeWidth={3} nodeColor="#ffd400" />
        <Background color="#0a0a0a33" gap={20} size={1.5} />
      </ReactFlow>
    </div>
  );
}
