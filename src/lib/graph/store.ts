"use client";

import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange, type Viewport } from "@xyflow/react";
import { nanoid } from "nanoid";
import { proxyWithHistory } from "valtio-history";

import { canConnect, getHandleKind } from "@/lib/graph/connections";
import { markDownstreamInputsChanged } from "@/lib/graph/inputs-changed";
import {
  createImageNodeData,
  createMeshNodeData,
  createPromptNodeData,
  createVisionNodeData,
  createViewerNodeData,
  type CarvingEdge,
  type CarvingNode,
  type ImageNodeData,
  type MeshNodeData,
  type ProjectGraph,
  type PromptNodeData,
  type VisionNodeData,
  type ViewerNodeData,
} from "@/lib/graph/types";
import { DEFAULT_VIEWPORT } from "@/lib/graph/utils";

type GraphState = {
  activeProjectId: string | null;
  projectName: string;
  nodes: CarvingNode[];
  edges: CarvingEdge[];
  viewport: Viewport;
  projectsLoaded: boolean;
  isSaving: boolean;
  lastSavedAt: number | null;
};

export const graphHistory = proxyWithHistory<GraphState>({
  activeProjectId: null,
  projectName: "",
  nodes: [],
  edges: [],
  viewport: DEFAULT_VIEWPORT,
  projectsLoaded: false,
  isSaving: false,
  lastSavedAt: null,
});

function commitHistory() {
  graphHistory.saveHistory();
}

export function hydrateProject(graph: ProjectGraph) {
  graphHistory.value.activeProjectId = graph.id;
  graphHistory.value.projectName = graph.name;
  graphHistory.value.nodes = graph.nodes;
  graphHistory.value.edges = graph.edges;
  graphHistory.value.viewport = graph.viewport;
  graphHistory.value.projectsLoaded = true;
  commitHistory();
}

export function setProjectName(name: string) {
  graphHistory.value.projectName = name;
  commitHistory();
}

export function setSaving(isSaving: boolean) {
  graphHistory.value.isSaving = isSaving;
}

export function markSaved() {
  graphHistory.value.isSaving = false;
  graphHistory.value.lastSavedAt = Date.now();
}

function createNode(nodeType: CarvingNode["type"], position: { x: number; y: number }) {
  if (nodeType === "prompt") {
    return { id: nanoid(), type: "prompt", position, data: createPromptNodeData() } as CarvingNode;
  }

  if (nodeType === "image") {
    return { id: nanoid(), type: "image", position, data: createImageNodeData() } as CarvingNode;
  }

  if (nodeType === "mesh") {
    return { id: nanoid(), type: "mesh", position, data: createMeshNodeData() } as CarvingNode;
  }

  if (nodeType === "vision") {
    return { id: nanoid(), type: "vision", position, data: createVisionNodeData() } as CarvingNode;
  }

  return { id: nanoid(), type: "viewer", position, data: createViewerNodeData() } as CarvingNode;
}

export function addCanvasNode(nodeType: CarvingNode["type"], position: { x: number; y: number }) {
  const node = createNode(nodeType, position);
  graphHistory.value.nodes = [...graphHistory.value.nodes, node];
  commitHistory();
  return node;
}

export function addConnectedPromptFromSource(sourceNodeId: string, position: { x: number; y: number }) {
  const node = createNode("prompt", position);
  const edge: CarvingEdge = {
    id: nanoid(),
    source: sourceNodeId,
    sourceHandle: "image-out",
    target: node.id,
    targetHandle: "image-in",
    data: { kind: "image" },
  };

  graphHistory.value.nodes = [...graphHistory.value.nodes, node];
  graphHistory.value.edges = [...graphHistory.value.edges, edge];
  commitHistory();
  return node;
}

export function onNodesChange(changes: NodeChange<CarvingNode>[]) {
  graphHistory.value.nodes = applyNodeChanges(changes, graphHistory.value.nodes) as CarvingNode[];
}

export function onEdgesChange(changes: EdgeChange<CarvingEdge>[]) {
  graphHistory.value.edges = applyEdgeChanges(changes, graphHistory.value.edges) as CarvingEdge[];
}

export function commitGraphInteraction() {
  commitHistory();
}

export function connectNodes(connection: Connection) {
  if (!canConnect(connection) || !connection.source || !connection.target) {
    return false;
  }

  const edge: CarvingEdge = {
    ...connection,
    id: nanoid(),
    data: {
      kind: getHandleKind(connection.sourceHandle)!,
    },
  };

  graphHistory.value.edges = addEdge(edge, graphHistory.value.edges) as CarvingEdge[];
  graphHistory.value.nodes = markDownstreamInputsChanged(
    connection.source,
    graphHistory.value.nodes,
    graphHistory.value.edges,
  );
  commitHistory();
  return true;
}

export function updateViewport(viewport: Viewport) {
  graphHistory.value.viewport = viewport;
}

export function deleteSelected() {
  const selectedNodeIds = new Set(
    graphHistory.value.nodes.filter((node) => node.selected).map((node) => node.id),
  );
  graphHistory.value.nodes = graphHistory.value.nodes.filter((node) => !selectedNodeIds.has(node.id));
  graphHistory.value.edges = graphHistory.value.edges.filter(
    (edge) => !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target) && !edge.selected,
  );
  commitHistory();
}

export function updatePromptNode(nodeId: string, patch: Partial<PromptNodeData>) {
  graphHistory.value.nodes = graphHistory.value.nodes.map((node) =>
    node.id === nodeId && node.type === "prompt"
      ? { ...node, data: { ...node.data, ...patch } }
      : node,
  ) as CarvingNode[];
}

export function updateImageNode(nodeId: string, patch: Partial<ImageNodeData>) {
  graphHistory.value.nodes = graphHistory.value.nodes.map((node) =>
    node.id === nodeId && node.type === "image"
      ? { ...node, data: { ...node.data, ...patch } }
      : node,
  ) as CarvingNode[];
}

export function updateMeshNode(nodeId: string, patch: Partial<MeshNodeData>) {
  graphHistory.value.nodes = graphHistory.value.nodes.map((node) =>
    node.id === nodeId && node.type === "mesh"
      ? { ...node, data: { ...node.data, ...patch } }
      : node,
  ) as CarvingNode[];
}

export function updateViewerNode(nodeId: string, patch: Partial<ViewerNodeData>) {
  graphHistory.value.nodes = graphHistory.value.nodes.map((node) =>
    node.id === nodeId && node.type === "viewer"
      ? { ...node, data: { ...node.data, ...patch } }
      : node,
  ) as CarvingNode[];
}

export function updateVisionNode(nodeId: string, patch: Partial<VisionNodeData>) {
  graphHistory.value.nodes = graphHistory.value.nodes.map((node) =>
    node.id === nodeId && node.type === "vision"
      ? { ...node, data: { ...node.data, ...patch } }
      : node,
  ) as CarvingNode[];
}

export function markNodeDirty(nodeId: string) {
  graphHistory.value.nodes = markDownstreamInputsChanged(
    nodeId,
    graphHistory.value.nodes,
    graphHistory.value.edges,
  );
}

export function undo() {
  if (graphHistory.canUndo()) {
    graphHistory.undo();
  }
}

export function redo() {
  if (graphHistory.canRedo()) {
    graphHistory.redo();
  }
}
