# Data Model

Three layers: **graph** (what the user sees), **jobs** (async work in flight), **assets** (downloaded files). Separation matters — the graph must survive a page reload mid-generation, and a job failure must not corrupt the graph.

## Frontend types (Valtio store + React Flow)

```ts
// graph.ts
import type { Node, Edge } from "@xyflow/react";

export type CarvingNode =
  | PromptNode
  | ImageNode
  | MeshNode
  | ViewerNode;

type Base<T extends string, D> = Node<D, T>;

/**
 * The workhorse node. Combines prompt text, model selector, run trigger, and
 * output slot with append-only history. Consumes optional image references on
 * the left handle and produces an image on the right handle after Run.
 */
export type PromptNode = Base<"prompt", {
  text: string;
  model: "openai/gpt-image-2" | "fal-ai/nano-banana-2" | "fal-ai/nano-banana-pro" | "fal-ai/flux-pro/kontext";
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "3:2" | "2:3";
  resolution: "1K" | "2K" | "4K";     // gated on model; defaults to "1K". See MODELS.md for the support matrix.
  seed?: number;                       // dropped by adapter for gpt-image-2
  activeJobId: string | null;          // currently-running job, if any; null otherwise
  outputAssetIds: string[];            // append-only history, newest last. Latest = outputAssetIds.at(-1)
  inputsChangedSinceLastRun: boolean;  // lights the Run button with an "inputs changed" ping
}>;

/**
 * A standalone image on the canvas. Created by either
 *   (a) dragging an Image tile from the sidebar palette and picking a file,
 *   (b) dragging an image file from Finder directly onto the canvas.
 * Uploaded to /api/assets/upload; HEIC is server-converted to JPEG.
 */
export type ImageNode = Base<"image", {
  assetId: string | null;        // points to Asset row after upload
  previewUrl: string | null;
}>;

export type MeshNode = Base<"mesh", {
  mode: "preview" | "refine";
  jobId: string | null;
  outputAssetId: string | null;  // .glb file
  thumbnailUrl: string | null;
  stale: boolean;
}>;

export type ViewerNode = Base<"viewer", {
  autoRotate: boolean;
  exposure: number;              // model-viewer `exposure` attr
}>;

export type CarvingEdge = Edge<{
  kind: "prompt" | "image" | "glb";
}>;
```

## Handle conventions

React Flow needs handle IDs for typed connections. We namespace them so a prompt handle can't connect to a GLB handle.

| Node type | Target handles (left) | Source handles (right) |
|-----------|-----------------------|------------------------|
| Prompt    | `image-in` (multi) | `image-out` |
| Image     | — | `image-out` |
| Mesh      | `image-in` | `glb-out` |
| Viewer    | `glb-in` | — |

Edge validation (in `onConnect`): `sourceHandle.kind === targetHandle.kind`. Reject otherwise, show a small toast.

## Persistence schema (SQLite via Drizzle)

```ts
// schema.ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),           // nanoid; many rows
  name: text("name").notNull(),          // user-editable, e.g. "raven series"
  viewportX: real("viewport_x").notNull().default(0),
  viewportY: real("viewport_y").notNull().default(0),
  viewportZoom: real("viewport_zoom").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  type: text("type").notNull(),          // "prompt" | "image" | "mesh" | "viewer"
  positionX: real("position_x").notNull(),
  positionY: real("position_y").notNull(),
  dataJson: text("data_json").notNull(), // serialized node.data
});

export const edges = sqliteTable("edges", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  source: text("source").notNull(),
  sourceHandle: text("source_handle").notNull(),
  target: text("target").notNull(),
  targetHandle: text("target_handle").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  nodeId: text("node_id").notNull(),
  provider: text("provider").notNull().default("fal"),  // fixed to "fal" in v1
  providerJobId: text("provider_job_id").notNull(),     // fal request_id
  providerSlug: text("provider_slug").notNull(),        // e.g. "fal-ai/nano-banana-2/edit"
  state: text("state").notNull(),                       // "queued" | "running" | "succeeded" | "failed" | "canceled"
  requestJson: text("request_json").notNull(),
  responseSummaryJson: text("response_summary_json"),
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  jobId: text("job_id"),                 // null for user uploads
  kind: text("kind").notNull(),          // "image" | "glb" | "fbx" | "usdz" | "video" | "thumbnail"
  mimeType: text("mime_type").notNull(),
  localPath: text("local_path").notNull(),
  sourceUrl: text("source_url"),
  bytes: integer("bytes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

## Why jobs are a separate table (not inside `node.data`)

1. **Resume on reload.** If the user closes the tab while a Meshy refine is running (~1 min), we want to reconnect via the stored `providerJobId` (fal `request_id`) using `fal.queue.status(slug, { requestId })`, not re-submit a duplicate job.
2. **History per node.** A node may be re-Run N times. We keep all jobs; only the latest's output asset id is in `outputAssetIds.at(-1)`. Prior attempts live in the history strip + jobs table.
3. **Audit.** `requestJson` captures what we sent to fal; `responseSummaryJson` captures what came back. Useful for debugging unexpected outputs.

## "Inputs changed" propagation

No image is ever dimmed or discarded — the history is append-only (see `OPEN_QUESTIONS.md` § Decision 3). But when an upstream value changes (prompt text edited, reference swapped, model changed), we want the downstream Prompt / Mesh nodes to hint "you'd probably want to Run again."

Implementation: walk the graph downstream from the mutated node, set `inputsChangedSinceLastRun: true` on every dependent Prompt / Mesh node. The node renders a small dot/ping on its Run button. The flag clears back to `false` on the next successful Run of that node.

Sketch in `src/lib/graph/inputs-changed.ts`:

```ts
export function markDownstreamInputsChanged(
  nodeId: string,
  nodes: CarvingNode[],
  edges: CarvingEdge[],
): CarvingNode[] {
  const dirty = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges) {
      if (e.source === id && !dirty.has(e.target)) {
        dirty.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return nodes.map(n =>
    dirty.has(n.id) && (n.type === "prompt" || n.type === "mesh")
      ? { ...n, data: { ...n.data, inputsChangedSinceLastRun: true } }
      : n,
  );
}
```
