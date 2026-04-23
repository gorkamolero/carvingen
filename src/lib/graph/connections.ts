import type { Connection } from "@xyflow/react";

import type { EdgeKind } from "@/lib/graph/types";

const HANDLE_KIND_BY_ID: Record<string, EdgeKind> = {
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
    getHandleKind(connection.sourceHandle) !== null &&
    getHandleKind(connection.sourceHandle) === getHandleKind(connection.targetHandle)
  );
}
