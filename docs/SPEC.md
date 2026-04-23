# Carvingen — Full Spec

## 1. Problem & goals

**Problem.** Carvers iterate on carving concepts in chat UIs (ChatGPT, Gemini). The flow is linear, throws away lineage, can't easily carry an image forward as a reference for the next prompt, and ends with a flat PNG that still has to be turned into a 3D model by hand in another tool.

**Goal.** A single-page canvas app that:

- Makes the generation graph **visible and branchable**.
- Lets any generated image feed back as a **reference input** for the next prompt (the core loop).
- Supports four image models with the same UX (all via fal): `openai/gpt-image-2` (ChatGPT Image Gen 2), `fal-ai/nano-banana-2`, `fal-ai/nano-banana-pro`, `fal-ai/flux-kontext-pro`. Each has a `<slug>` (text-to-image) and `<slug>/edit` variant; the adapter picks `/edit` when references are present.
- Submits the final concept to **Meshy v6 image-to-3D** (via fal: `fal-ai/meshy/v6/image-to-3d`) and previews the resulting GLB in-browser (orbit/rotate/zoom) with Quest/Oculus as an eventual target.
- Stays **aesthetic** — not a Figma clone, not a Blender clone. Feels like a carver's sketchbook.

**Non-goals (for v1).**

- Multi-user collaboration.
- Asset library / marketplace.
- Mesh editing / decimation inside the app (we ship to external tools).
- Accounts, billing, team plans.
- Mobile.

## 2. Anchored choices (decided)

These are locked in. Reasons in `STACK.md`.

| Layer | Choice |
|-------|--------|
| Frontend framework | Next.js (App Router) + React 19 |
| Canvas engine | React Flow (`@xyflow/react`) |
| State | Valtio (graph, with `proxyWithHistory` for undo/redo) + TanStack Query (job polling) |
| Styling | Tailwind + shadcn/ui |
| 3D preview | `@google/model-viewer` web component |
| Image generation | [fal.ai](https://fal.ai) via `@fal-ai/client` (server proxy via `@fal-ai/server-proxy`) |
| 3D generation | Meshy via fal (`fal-ai/meshy/v6/image-to-3d`) — same SDK, same key |
| Job persistence | SQLite via Drizzle ORM, local to the dev machine |
| Asset storage | Local filesystem under `./outputs/` (hashed by prediction id) |
| Package manager | pnpm |
| Type system | TypeScript strict, zero warnings |
| Test runner | Vitest (unit) + Playwright (e2e against real fal) |

## 3. Architecture at a glance

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                      │
│                                                               │
│  ┌──────────────┐    ┌───────────────┐    ┌────────────────┐  │
│  │ React Flow   │    │ Valtio store  │    │ TanStack Query │  │
│  │ canvas UI    │◀──▶│ (graph state) │◀──▶│ (job polling)  │  │
│  └──────────────┘    └───────────────┘    └────────────────┘  │
│                                │                              │
│                                ▼                              │
│                      /api/* (Next route handlers)             │
└────────────────────────────────┬──────────────────────────────┘
                                 │
                      ┌──────────┼──────────┐
                      ▼          ▼          ▼
               ┌──────────────────┐   ┌──────────┐
               │     fal.ai       │   │  SQLite  │
               │ (@fal-ai/client  │   │ (jobs,   │
               │  via server      │   │  assets) │
               │   proxy)         │   │          │
               │  · image models  │   │          │
               │  · Meshy v6      │   │          │
               └──────────────────┘   └──────────┘
```

- **Canvas is the source of truth** for user intent. The graph (nodes + edges + per-node config) lives in a Valtio proxy store (wrapped with `proxyWithHistory` for Cmd+Z/Cmd+Shift+Z on every mutation), persisted to SQLite via debounced saves.
- **Jobs are the source of truth for results.** Each image/mesh node has a `jobId` → a row in the `jobs` table → polled by TanStack Query → written back into the node's output slot when terminal.
- **No server state sync between clients.** Single-user; single tab is authoritative.

## 4. Data model (high level — full schema in `DATA_MODEL.md`)

Three primary entities:

- **Project** — the whole canvas (one row).
- **Node** — `{id, type, position, data}`. `data` shape depends on `type`.
- **Edge** — `{id, source, sourceHandle, target, targetHandle}`.

Plus a side-table of **Jobs** (fal async work — images and Meshy alike) and **Assets** (downloaded files on disk).

The node/edge graph is what React Flow wants. The jobs and assets are separate so we can resume mid-generation, re-attach outputs on reload, and avoid tangling UI state with API state.

## 5. Node taxonomy (detailed in `NODE_TYPES.md`)

**v1 node types (all in the left-side sidebar palette):**

1. **Prompt** — the workhorse. Text area + model selector + Run button + output image slot (with history), all in one. Consumes optional `image[]` on the left handle. Outputs: `image` on the right handle.
2. **Image** — a standalone image. Created by dragging an Image tile from the sidebar and picking a file, or by dragging an image file from Finder directly onto the canvas. Outputs: `image`.
3. **Mesh** — consumes an `image`, calls Meshy image-to-3D. Outputs: `glb` (url + local path).
4. **Viewer** — consumes a `glb`, renders in `<model-viewer>`. No output.

Primary palette entries (Image, Prompt) are shown at the top of the sidebar; Mesh and Viewer sit below a separator as downstream types.

**Deferred to v2:**

- Prompt template / variable nodes.
- Background-remove / subject-isolate preprocessor nodes.
- A/B compare node.
- Export packet node (produces the Sami-style markdown packet).

## 6. Execution model

**Reactive, explicit-run, cached.**

- Nodes declare their inputs. Editing any upstream value **invalidates** the downstream node's cached output (marks it stale, keeps showing the old result dimmed).
- A stale node shows a "Regenerate" button. No automatic background re-runs — generation costs money.
- A fresh node with all inputs satisfied auto-runs the first time it's fully wired (configurable per-node).
- Running nodes show a progress state fed by TanStack Query polling every 2s against `/api/jobs/:id`.

This avoids the footgun where a fal bill quietly spirals because someone edited a prompt in an upstream chain.

## 7. API surface (Next.js route handlers)

```
ALL    /api/fal/proxy/*         — fal server proxy (created by @fal-ai/server-proxy/nextjs). Hides FAL_KEY.
POST   /api/jobs                — record a request_id after fal.queue.submit returns; persists to SQLite
GET    /api/jobs                — list active jobs for the current project (for resume on reload)
POST   /api/assets/persist      — download a fal-hosted output URL into local storage, create Asset row
POST   /api/assets/upload       — multipart upload for Image nodes (HEIC→JPEG server-side)
GET    /api/assets/:id          — streams a local asset file
GET    /api/projects            — list projects
POST   /api/projects            — create project
GET    /api/projects/:id        — load one project's graph
POST   /api/projects/:id/save   — debounced save
PATCH  /api/projects/:id        — rename
```

Wire contracts in `API_CONTRACTS.md`. Actual generation traffic (submit, status, result) goes through the fal proxy — we don't reimplement Replicate-style `/api/jobs/image`.

## 8. Aesthetic direction

**Neo-brutalist.** Source of truth: [neobrutalism.dev](https://www.neobrutalism.dev) — we use its shadcn variant for every primitive (button, select, dialog, tooltip, toast, etc.). Nodes are hand-built on the same tokens so they feel cohesive with the library.

Design tokens:

- **Canvas background.** Off-white / cream (e.g. `#fafaf5`) with a very faint dotted grid. Not dark.
- **Borders.** `3px` solid black on every node, every button, every input. Hard corners or a very small radius (`2px`).
- **Shadows.** Hard, offset, no blur — `box-shadow: 4px 4px 0 #000` on idle nodes; presses shift to `1px 1px 0 #000` on click for the physical "punched in" feel.
- **Color.** Mostly black on cream. One saturated accent per node type to colour-code them:
  - Prompt: vivid yellow `#ffd400` background on the header strip.
  - Image: bright pink `#ff6fa8` header.
  - Mesh: electric blue `#3e8cff` header.
  - Viewer: acid green `#8cff3e` header.
- **Typography.** Bold sans-serif for everything (e.g. `Archivo Black` or `Inter` at weight 800) for titles and buttons; monospace for prompt text and model ids (`JetBrains Mono`). No serifs.
- **Edges.** Thick black strokes (2–3 px), straight with 90° corners, not bezier curves. Reads as wiring, not calligraphy.
- **Interactions.** Every clickable thing punches in on press (shadow 4→1). Hover raises one pixel. Connections snap with a single-frame scale bump. No fades, no easings — instantaneous or 80 ms linear.
- **Empty states.** Pure cream + one short monospace line of copy, no illustrations.

## 9. What the user contributes to this spec

In learning mode we flag decisions where your input shapes the product more than the code. See `OPEN_QUESTIONS.md` — three meaningful choices you should make before build starts, each with 5–10 lines of code or schema to write.

## 10. Build order (detailed in `BUILD_PLAN.md`)

1. **Milestone 0 — Plumbing.** Next.js app, fal server proxy, typed image/mesh wrappers around `@fal-ai/client`, SQLite schema, env wiring.
2. **Milestone 1 — Dumb canvas.** React Flow with Prompt + Image Gen nodes, one model hardcoded, local-only state.
3. **Milestone 2 — The core loop.** Image nodes, sidebar palette, multi-project, graph persistence, job resume on reload, undo/redo.
4. **Milestone 3 — Mesh + Viewer.** Meshy integration, GLB preview node.
5. **Milestone 4 — Aesthetic pass.** Type, color, texture, edge styling, node chrome.
6. **Milestone 5 — Polish.** Keyboard shortcuts, multi-select, undo/redo, export packet.

## 11. Appendix — key external docs

- fal.ai home + model explorer: https://fal.ai · https://fal.ai/explore/models
- fal Next.js integration: https://fal.ai/docs/examples/integrations/nextjs
- fal Vercel integration: https://fal.ai/docs/examples/integrations/vercel · https://vercel.com/integrations/fal
- fal custom workflow UI reference (for any multi-step server-side chains we might build later): https://fal.ai/docs/examples/integrations/custom-workflow-ui
- fal model pages (input schemas):
  - `openai/gpt-image-2`: https://fal.ai/models/openai/gpt-image-2 · `/edit`: https://fal.ai/models/openai/gpt-image-2/edit
  - `fal-ai/nano-banana-2`: https://fal.ai/models/fal-ai/nano-banana-2 · `/edit`: https://fal.ai/models/fal-ai/nano-banana-2/edit
  - `fal-ai/nano-banana-pro`: https://fal.ai/models/fal-ai/nano-banana-pro · `/edit`: https://fal.ai/models/fal-ai/nano-banana-pro/edit
  - `fal-ai/flux-kontext-pro`: https://fal.ai/models/fal-ai/flux-pro/kontext
  - `fal-ai/meshy/v6/image-to-3d`: https://fal.ai/models/fal-ai/meshy/v6/image-to-3d
  - `fal-ai/meshy/v6-preview/image-to-3d`: https://fal.ai/models/fal-ai/meshy/v6-preview/image-to-3d
- OpenAPI schema per endpoint: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<slug>`
- `@google/model-viewer` docs: https://modelviewer.dev/
- Neobrutalism shadcn variants: https://www.neobrutalism.dev
