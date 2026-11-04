import type { Connection } from "@xyflow/react";

import type { EdgeKind } from "@/lib/graph/types";

const HANDLE_KIND_BY_ID: Record<string, EdgeKind> = {
  "animation-in": "animation",
  "animation-out": "animation",
  "image-in": "image",
  "image-out": "image",
  "glb-in": "glb",
  "glb-out": "glb",
};

export function getHandleKind(handleId: string | null | undefined) {
  return handleId ? HANDLE_KIND_BY_ID[handleId] ?? null : null;
}

export function canConnect(connection: Connection) {
  return (
    connection.source !== connection.target &&
    Boolean(connection.sourceHandle?.endsWith("-out")) &&
    Boolean(connection.targetHandle?.endsWith("-in")) &&
    getHandleKind(connection.sourceHandle) !== null &&
    getHandleKind(connection.sourceHandle) === getHandleKind(connection.targetHandle)
  );
}

export const NODE_HANDLES: Record<string, { inputs: string[]; outputs: string[] }> = {
  image: { inputs: [], outputs: ["image-out"] }, prompt: { inputs: ["image-in"], outputs: ["image-out"] },
  vision: { inputs: ["image-in"], outputs: [] }, video: { inputs: ["image-in"], outputs: [] },
  mesh: { inputs: ["image-in"], outputs: ["glb-out"] }, multiview: { inputs: ["image-in"], outputs: ["image-out"] },
  bake: { inputs: ["glb-in"], outputs: ["glb-out"] }, rig: { inputs: ["glb-in"], outputs: ["glb-out"] },
  motion: { inputs: ["glb-in"], outputs: ["glb-out"] },
  animate: { inputs: ["glb-in", "animation-in"], outputs: ["glb-out"] },
  animation: { inputs: [], outputs: ["animation-out"] }, export: { inputs: ["glb-in"], outputs: ["glb-out"] },
  viewer: { inputs: ["glb-in"], outputs: [] },
};
export function canConnectNodes(connection: Connection, sourceType: string, targetType: string) {
  return canConnect(connection) && !!NODE_HANDLES[sourceType]?.outputs.includes(connection.sourceHandle!) && !!NODE_HANDLES[targetType]?.inputs.includes(connection.targetHandle!);
}
