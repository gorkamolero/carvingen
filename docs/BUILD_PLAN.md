# Build Plan

Six milestones. Each is shippable on its own — if we stop at M2 we have a usable "GPT-replacement node UI", if we stop at M3 we have the full carving-to-3D flow. M4/M5 are the polish that makes it feel like Carvingen and not "yet another node editor".

Per the user's global rules: **TDD throughout**. Every milestone has a test list written before the code. Tests hit real APIs where feasible; mocked DB is not acceptable.

## Milestone 0 — Plumbing (~1 day)

**Goal.** Next app boots, fal is reachable through the proxy, SQLite schema applied.

- `pnpm create next-app@latest carvingen --ts --app --tailwind --no-src-dir` → restructure to `/src`.
- Install deps per `STACK.md` (incl. `@fal-ai/client`, `@fal-ai/server-proxy`).
- Drizzle schema from `DATA_MODEL.md`, migration applied.
- `.env.local` with `FAL_KEY`. Zod env validation at startup.
- `src/app/api/fal/proxy/route.ts` with the one-liner `createRouteHandler()`.
- `src/lib/fal/client.ts` — `fal.config({ proxyUrl: "/api/fal/proxy" })`.
- `src/lib/fal/image.ts` — `generateImage(input)` wrapper. Picks base vs `/edit` slug based on `referenceImages.length`.
- `src/lib/fal/mesh.ts` — `generateMesh(imageUrl, mode)` wrapper against `fal-ai/meshy/v6[-preview]/image-to-3d`.
- Smoke script `pnpm tsx scripts/smoke.ts` that runs a single `fal-ai/nano-banana-2` call end-to-end through the running Next dev server and saves the output locally. **This is the M0 test.**

**Gate.** Smoke script completes; PNG lands in `./outputs/`.

## Milestone 1 — Dumb canvas (~1–2 days)

**Goal.** Can drag a Prompt tile from the sidebar onto the canvas, type, hit Run, see the result.

- Canvas page at `src/app/page.tsx`, full-viewport React Flow + left-side sidebar palette.
- Custom node: `PromptNode` (text + model selector + Run button + output slot, all in one). Styling: dark oak background, plain card for now (aesthetic pass is M4).
- Sidebar with one tile (Prompt) — multi-tile and multi-project UI arrives in M2.
- Model picker shows all 4 options, Nano Banana 2 preselected.
- Valtio store with `proxyWithHistory` wrapping the graph; no persistence yet.
- Route handlers: `/api/jobs/image`, `/api/jobs/:id`, `/api/assets/:id`.
- TanStack Query polling wired to the Prompt node's `activeJobId`.
- E2E: Playwright test that drags a Prompt tile, types a short prompt, clicks Run, waits for a real fal response, asserts image asset on disk.

**Gate.** Carvingen generates an image through the UI against the real fal API.

## Milestone 2 — Core loop (~2–3 days)

**Goal.** The gesture the whole product hinges on: drag a Prompt node's `image-out` to empty canvas → a new Prompt node spawns with the edge pre-wired as a reference, ready to type into.

- Multi-edge `image-in` handle with connection validation.
- Aspect ratio chips (gated on the selected model; `1:1` default on fresh Prompt nodes), optional seed field.
- **Image node** + sidebar Image tile + Finder drop path + `/api/assets/upload` (with HEIC→JPEG conversion via `heic-convert`; 25 MB cap; MIME whitelist).
- Auto-spawn on drag-image-out-to-empty-canvas.
- Per-node history strip: `outputAssetIds[]` with clickable thumbnails, lightbox on click.
- "Inputs changed since last run" propagation (`markDownstreamInputsChanged`) → lights the Run button ping.
- **Multi-project**: project switcher in the top bar, `GET /api/projects`, `POST /api/projects`, `GET /api/projects/:id`, `POST /api/projects/:id/save`. 500ms debounced save from the Valtio store.
- Undo/redo via `proxyWithHistory` — Cmd+Z / Cmd+Shift+Z covers every graph mutation.
- Job resume: on mount, re-attach TanStack Query to any non-terminal jobs in the DB for the active project.
- E2E: create a new project → drag an image file from Finder → wire the Image node to a Prompt → Run → drag the output to empty canvas → verify the new Prompt spawns with the reference wired → type and Run → verify the history strip shows the prior thumb, the latest slot has the new image. Switch to a second project, verify the canvas is empty. Switch back, verify the chain is intact.

**Gate.** You can build a 5-node chain, reload the page, and see all 5 nodes with their images and per-node history intact.

## Milestone 3 — Mesh + Viewer (~1–2 days)

**Goal.** Full carving → 3D → Oculus path.

- `MeshNode` with preview/refine toggle. Preview submits `fal-ai/meshy/v6-preview/image-to-3d`; refine submits `fal-ai/meshy/v6/image-to-3d`.
- On success: every artifact URL fal/Meshy returns (GLB, FBX, USDZ, thumbnail, video) goes through `POST /api/assets/persist` for local storage.
- Download menu on MeshNode exposes every persisted artifact.
- `ViewerNode` with `<model-viewer>`, fullscreen on `f`.
- E2E: build a Prompt chain → connect to Mesh (preview) → hit Run → wait (~1 min) → assert GLB file exists on disk and `model-viewer` renders. Then switch Mesh to refine, Run again, verify the new GLB appears and the node still exposes the prior preview in its history.

**Gate.** You can take a carving concept from blank canvas to a GLB ready to sideload onto a Quest.

## Milestone 4 — Aesthetic pass (~1–2 days)

**Goal.** Neo-brutalist pass. Install shadcn primitives via [neobrutalism.dev](https://www.neobrutalism.dev); apply the same design tokens to the hand-built nodes.

- Install neobrutalism-variant shadcn components: `button`, `select`, `dialog`, `sheet`, `tooltip`, `toast`, `slider`, `toggle-group`, `card`.
- Canvas: cream background (`#fafaf5`), faint dotted grid.
- Nodes: 3 px solid black border, `4px 4px 0 #000` hard shadow, 2 px radius, colour-coded header strip per node type (Prompt yellow, Image pink, Mesh blue, Viewer green).
- Edges: 2–3 px black straight lines, 90° corners (not bezier).
- Typography: `Archivo Black` or weight-800 Inter for titles/buttons, `JetBrains Mono` for prompts and model ids.
- Press-in animation: shadow `4px 4px → 1px 1px` on `:active`, instantaneous.
- Snap-to-grid off by default (feels too rigid even for this aesthetic).

**Gate.** It's pretty. You want to open it.

## Milestone 5 — Polish (~1–2 days)

**Goal.** Daily-driver ergonomics.

- Keyboard: `n` new prompt node, `g` generate focused, `Cmd+Z` undo, `Cmd+Shift+Z` redo, `Delete` remove selection, `Cmd+D` duplicate.
- Undo/redo via Valtio `proxyWithHistory` (landed in M2; M5 just adds the keyboard shortcuts and a stack-depth cap of ~50).
- Multi-select + bulk delete + bulk regenerate.
- Cost running total in the top-right HUD.
- Export packet: a zip with prompts, images, GLB, and a markdown summary of the graph.
- Bug triage pass.

**Gate.** You can work for an hour without reaching for the mouse more than necessary.

## Deferred for post-v1

- Multi-project (right now it's one "default" project).
- Cloud sync / multi-device.
- Per-node history browser (prior generations for one node).
- Batch mode: one Run → N images at once (gpt-image-2's `number_of_images` up to 10).
- Vision-based prompt suggestion ("describe this image as a carving brief").
- Native Quest sideload helper.
- User accounts.

## Rough time total

M0 + M1 + M2 + M3 = the functional product: ~5–8 days full-time.
M4 + M5 = polish: ~2–4 days.

All estimates assume the agent implementing it is fluent in the stack. Add multiplier for discovery time if not.
