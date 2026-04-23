# API Contracts

Two kinds of server routes:

1. **The fal server proxy** — hides `FAL_KEY` on the backend. All generation traffic (submit, status, result) goes through this. Client uses `@fal-ai/client` as if it were hitting fal directly.
2. **Our own routes** — asset persistence, project CRUD, job records for resume-on-reload.

## Environment

```sh
# .env.local
FAL_KEY="key_id:key_secret"       # from https://fal.ai/dashboard/keys
ASSET_STORAGE_PATH=./outputs
PUBLIC_URL=http://localhost:3001   # used to build fetchable URLs for uploaded reference images
```

**No `REPLICATE_API_TOKEN`. No `MESHY_API_KEY`. No `OPENAI_API_KEY`.** Single provider = single key.

On Vercel, install the fal integration: https://vercel.com/integrations/fal — it injects `FAL_KEY` automatically. Manual setup works too per https://fal.ai/docs/examples/integrations/vercel.

## 1. The fal server proxy

**Path.** `src/app/api/fal/proxy/route.ts`

```ts
import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";

export const { GET, POST, PUT } = createRouteHandler();
```

That's the whole file. `@fal-ai/server-proxy/nextjs` exports the App Router handler. It forwards requests to fal with the `FAL_KEY` header server-side.

**Client config.** In `src/app/layout.tsx` or a client-side provider:

```ts
import { fal } from "@fal-ai/client";

fal.config({ proxyUrl: "/api/fal/proxy" });
```

**Client usage** (inside the PromptNode's Run handler):

```ts
import { fal } from "@fal-ai/client";

// Text-to-image (no references wired)
const submission = await fal.queue.submit("fal-ai/nano-banana-2", {
  input: {
    prompt,
    aspect_ratio: "1:1",
    num_images: 1,
  },
});
const requestId = submission.request_id;

// Persist to our DB for resume-on-reload
await fetch("/api/jobs", {
  method: "POST",
  body: JSON.stringify({
    projectId,
    nodeId,
    provider: "fal",
    providerJobId: requestId,
    providerSlug: "fal-ai/nano-banana-2",
    requestInput: submission.input,
  }),
});

// Poll (TanStack Query wraps this with refetchInterval: 2000)
const status = await fal.queue.status("fal-ai/nano-banana-2", { requestId, logs: true });

// On terminal
if (status.status === "COMPLETED") {
  const result = await fal.queue.result("fal-ai/nano-banana-2", { requestId });
  const falUrl = result.data.images[0].url;

  // Persist locally — fal URLs can expire
  const { assetId } = await fetch("/api/assets/persist", {
    method: "POST",
    body: JSON.stringify({ sourceUrl: falUrl, kind: "image" }),
  }).then(r => r.json());

  // append to the node's outputAssetIds
}
```

For simple fire-and-forget flows (the Run button with no need for resume), `fal.subscribe(slug, { input, onQueueUpdate })` is one-liner equivalent to submit+poll+result. We use `fal.queue.submit` explicitly so we can persist the `request_id` immediately.

## 2. `POST /api/jobs`

Record a fal job so we can resume after a reload.

**Request.**

```ts
{
  projectId: string;
  nodeId: string;
  provider: "fal";
  providerJobId: string;        // fal request_id
  providerSlug: string;         // e.g. "fal-ai/nano-banana-2/edit"
  requestInput: object;         // whatever we passed to fal.queue.submit for audit
}
```

**Response.** `{ jobId: string }` — our internal id. The fal `request_id` stays canonical for fal calls.

## 3. `GET /api/jobs?projectId=...&state=active`

List non-terminal jobs for a project. Used on page mount to resume polling.

**Response.**

```ts
Array<{
  id: string;
  nodeId: string;
  providerJobId: string;
  providerSlug: string;
  state: "queued" | "running";
  startedAt: string;
}>
```

## 4. `POST /api/jobs/:id/complete`

Client calls this when fal returns terminal status, to update our row and bind outputs to the node.

**Request.**

```ts
{
  state: "succeeded" | "failed" | "canceled";
  responseSummary?: object;           // a compact version of fal's result payload
  outputAssetIds?: string[];          // for succeeded jobs — produced by /api/assets/persist
  error?: string;
}
```

## 5. `POST /api/assets/persist`

Download a fal-hosted URL into our local `./outputs/` store and create an Asset row. Critical for GLBs and for image outputs we want to keep.

**Request.**

```ts
{
  sourceUrl: string;                // URL returned by fal
  kind: "image" | "glb" | "fbx" | "usdz" | "obj" | "stl" | "thumbnail" | "video";
}
```

**Server flow.**

1. Fetch `sourceUrl` into a buffer.
2. Compute sha256.
3. Write to `./outputs/<sha256>.<ext>`.
4. Insert `assets` row.
5. Return `{ assetId, url: "/api/assets/<id>", bytes }`.

## 6. `POST /api/assets/upload`

Multipart upload for Image nodes (both sidebar file picker + Finder drop paths).

**Request.** `multipart/form-data` with `file`.

**Server flow.**

1. Validate MIME: allow `image/jpeg`, `image/png`, `image/webp`, `image/heic`. Reject TIFF, PSD, and everything else with 415.
2. Validate size ≤ 25 MB.
3. If `image/heic`: run through `heic-convert` → JPEG buffer.
4. Compute sha256 of the final buffer.
5. Write to `./uploads/<sha256>.<ext>` (dedupe).
6. Create `assets` row with `kind: "image"`.
7. Return `{ assetId, url: "/api/assets/<id>", width, height, bytes }`.

## 7. `GET /api/assets/:id`

Stream a local asset with correct MIME, `Cache-Control: public, max-age=31536000, immutable`.

**This is also the URL we pass to fal as a reference image.** On localhost, fal needs a publicly reachable URL — the `PUBLIC_URL` env + an ngrok tunnel covers this (see "Tunnel gotcha" below).

## 8. `GET /api/projects`

List all projects.

**Response.**

```ts
Array<{ id: string; name: string; createdAt: string; updatedAt: string }>
```

## 9. `POST /api/projects`

Create. Body: `{ name: string }`. Response: the new project row.

## 10. `GET /api/projects/:id`

Load one project's graph.

**Response.**

```ts
{
  id: string;
  name: string;
  nodes: CarvingNode[];
  edges: CarvingEdge[];
  viewport: { x: number; y: number; zoom: number };
}
```

## 11. `POST /api/projects/:id/save`

Debounced save. Body:

```ts
{
  name?: string;
  nodes: CarvingNode[];
  edges: CarvingEdge[];
  viewport: { x: number; y: number; zoom: number };
}
```

Replaces rows for `nodes.project_id = :id`, `edges.project_id = :id`. Bumps `updatedAt`.

## 12. `PATCH /api/projects/:id`

Rename. Body: `{ name: string }`.

## Notes & gotchas

- **Reference image URLs.** When the user wires Image nodes into a Prompt, the adapter submits their URLs as `image_urls[]` to fal. fal fetches them. That means our `/api/assets/:id` endpoint must be reachable from fal's servers. In local dev, use `ngrok http 3001` and set `PUBLIC_URL` to the tunnel URL. On Vercel, `PUBLIC_URL` is just the deployed URL.
- **Output URLs expire.** fal's result URLs are CDN-hosted and not guaranteed permanent. **Always** call `/api/assets/persist` before considering a job done. The Asset row is the authoritative pointer.
- **No retries server-side.** Failures bubble to the client; the user decides to re-Run.
- **No rate limiting on our side.** fal's own throttling surfaces through the SDK as errors.
