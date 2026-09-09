# Workflow CLI Implementation Prompt

Use this prompt to add a JSON-driveable workflow runner to Carvingen.

```text
You are working in /Users/gorkolas/www/carvingen.

Build a JSON-driveable workflow CLI so we can create and run the same canvas workflows programmatically that a user would do manually.

Goal:
Add a CLI script that accepts a workflow JSON file, creates or updates a project, creates graph nodes/edges, optionally uploads local assets, runs provider-backed nodes in dependency order, persists outputs, and saves the final graph back to the project.

Existing app context:
- Next app runs on http://127.0.0.1:3001 by default.
- Project APIs:
  - POST /api/projects { name }
  - GET /api/projects
  - GET /api/projects/:id
  - POST /api/projects/:id/save with { id, name, nodes, edges, viewport }
- Asset APIs:
  - POST /api/assets/upload multipart file
  - POST /api/assets/persist { sourceUrl, kind, jobId? }
- Job APIs:
  - POST /api/jobs
  - POST /api/jobs/:id/complete
- Existing FAL adapters:
  - src/lib/fal/image.ts
  - src/lib/fal/video.ts
  - src/lib/fal/mesh.ts
  - src/lib/fal/vision.ts
- Existing graph schemas/defaults:
  - src/lib/graph/types.ts
  - src/lib/graph/serialization.ts
- Existing node types:
  - image, prompt, vision, video, mesh, viewer

Implement:
1. Add `scripts/workflow.ts`.
2. Add package scripts:
   - `workflow`: `tsx scripts/workflow.ts`
   - optionally `workflow:example`: runs an example fixture.
3. Add `docs/WORKFLOW_JSON.md`.
4. Add `examples/workflows/` with at least:
   - `image-to-video.seedance.json`
   - `reference-to-video.veo.json`
   - `image-to-3d.hunyuan.json`
   - `image-prompt-mesh.json`

Workflow JSON should be declarative and stable. Suggested shape:

{
  "project": {
    "name": "Workflow test",
    "mode": "create",
    "id": "optional-project-id"
  },
  "assets": [
    {
      "id": "front",
      "path": "./examples/assets/front.png",
      "kind": "image"
    }
  ],
  "nodes": [
    {
      "id": "image_front",
      "type": "image",
      "position": { "x": 120, "y": 160 },
      "asset": "front"
    },
    {
      "id": "video_1",
      "type": "video",
      "position": { "x": 520, "y": 160 },
      "data": {
        "model": "seedance-2.0",
        "mode": "image",
        "tier": "fast",
        "text": "Slow cinematic orbit around the carving, soft studio light",
        "aspectRatio": "16:9",
        "resolution": "720p",
        "duration": "8",
        "generateAudio": true,
        "seed": null
      },
      "run": true
    }
  ],
  "edges": [
    {
      "source": "image_front",
      "sourceHandle": "image-out",
      "target": "video_1",
      "targetHandle": "image-in"
    }
  ],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}

CLI behavior:
- Command: `pnpm workflow path/to/workflow.json --base-url http://127.0.0.1:3001`
- Validate the workflow JSON with zod.
- Upload local assets first and remember returned asset ids.
- Build graph nodes using existing create node defaults from `src/lib/graph/types.ts`, merging JSON `data`.
- Generate stable React Flow-ish node ids from JSON ids, or nanoid if omitted.
- Create image nodes with uploaded `assetId`, `previewUrl`, and `fileName`.
- Create edges with generated ids and correct `data.kind` inferred from handles.
- Save initial graph to project before running.
- If `run: true`, run runnable nodes in topological order:
  - prompt: use `buildImageRequest`, `pickImageSlug`, fal queue, persist image output, update `outputAssetIds` and `activeAssetId`.
  - video: use `buildVideoRequest`, `pickVideoSlug`, fal queue, persist video output, update `outputAssetIds` and `activeAssetId`.
  - mesh: use `buildMeshRequest`, `pickMeshSlug`, fal queue, persist artifacts, update `outputAssetId`, `artifactAssetIds`, and `thumbnailAssetId`.
  - vision: use existing vision adapter and update `answer`.
- Resolve incoming image URLs from upstream image/prompt nodes the same way `src/lib/graph/selectors.ts` does. If needed, refactor shared selector logic so it can run in Node without `window`.
- For assets sent to fal, use absolute public URLs. The CLI should support:
  - `--public-url`
  - fallback to `PUBLIC_URL`
  - fallback to `baseUrl`
- Save the graph after every successful node run, and once at the end.
- Print a machine-readable JSON summary to stdout:

{
  "projectId": "...",
  "projectName": "...",
  "nodesRun": ["..."],
  "outputs": {
    "video_1": [
      { "assetId": "...", "kind": "video", "url": "/api/assets/..." }
    ]
  }
}

Quality requirements:
- Do not duplicate large chunks of node UI logic.
- Prefer shared adapter functions already in `src/lib/fal/*`.
- Keep existing UI behavior unchanged.
- Add unit tests for workflow parsing and graph construction.
- Add a no-provider dry-run mode:
  - `pnpm workflow file.json --dry-run`
  - validates, uploads nothing, runs nothing, prints the graph that would be saved.
- Add docs explaining node types, handles, runnable data fields, and examples.

Verification:
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm workflow examples/workflows/image-to-video.seedance.json --dry-run`
- If `FAL_KEY` and `PUBLIC_URL` are present, run one real provider example.
```
