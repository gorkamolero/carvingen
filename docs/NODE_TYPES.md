# Node Types

Four node types in v1. Each has: a display (`src/components/nodes/<Kind>Node.tsx`), a data schema (in `DATA_MODEL.md`), handles, and — where relevant — a run trigger.

## The sidebar palette

A narrow left-side column (~64 px wide, full-height) holds the node palette. Each tile is draggable onto the canvas. Dropping spawns that node type at the drop position.

```
┌────┐
│ Im │  ← Image
│ ── │
│ Pr │  ← Prompt
│ ── │
├────┤  (separator)
│ Me │  ← Mesh
│ ── │
│ Vw │  ← Viewer
└────┘
```

Primary tiles (Image, Prompt) at the top; secondary (Mesh, Viewer) below a thin separator. No search, no categories, no collapse — four tiles is short enough to fit.

Dragging an image file from Finder onto the canvas is an alternate path that skips the palette and spawns an Image node directly.

## The project switcher

Top-bar (above the canvas), left-aligned: current project name, clickable, opens a small popover with:

- List of existing projects (name + last-edited timestamp).
- "Rename current project" inline action.
- "New project" button → creates a blank canvas and switches to it.

No archive/delete in v1 (guard against accidental loss of work).

Multi-project plumbing: every `/api/projects/*` and `/api/jobs/*` call carries the active `projectId`. The Valtio store holds `activeProjectId` separately from the graph; switching projects loads a different graph snapshot via `/api/projects/:id`.

## 1. Prompt (the workhorse)

**Purpose.** One node does the whole "describe + generate" step. Text, model, run, output — all in a single card.

**UI.**

```
                      ┌──────────────────────────────┐
                      │ Prompt                × ⋯   │
                      │ ┌──────────────────────────┐ │
                      │ │ An ornate raven totem,   │ │
                      │ │ carved in dark walnut,   │ │
                      │ │ moon motifs...           │ │
                      │ └──────────────────────────┘ │
 image-in (multi) ●──▶│ Model: [ Nano Banana Pro ▼ ] │
                      │         multi-fuse · ~$0.10   │
                      │ Aspect: ⦿1:1 ○3:4 ○16:9      │
                      │ Res:    ⦿1K  ○2K              │ ← only when model supports >1K
                      │                              │
                      │ ┌──────────────────────────┐ │
                      │ │                          │ │
                      │ │   [latest generated      │●──▶ image-out
                      │ │    image, empty slot     │ │
                      │ │    if unrun]             │ │
                      │ └──────────────────────────┘ │
                      │ ┌──┬──┬──┬──┬──┐             │
                      │ │v4│v3│v2│v1│..│ ← history   │
                      │ └──┴──┴──┴──┴──┘             │
                      │ [ Run • ~$0.10 ]            │
                      └──────────────────────────────┘
```

- Prompt text area at top, grows up to ~10 lines, scrolls after.
- Model selector below it — always visible, Nano Banana 2 preselected. Each row in the dropdown shows the model name, a sparse tagline, and a price tier.
- Aspect ratio chips — gated on the selected model (gpt-image-2 only shows `1:1 / 3:2 / 2:3`, others show the wider set).
- **Output image slot** fills the middle. Always shows the **latest** run (`outputAssetIds.at(-1)`). Empty (dark, subtle chisel pattern) until the first successful Run.
- **History strip** just below the output slot: small thumbnails of prior runs, newest first (excluding the one currently displayed above). Click → lightbox for review/comparison. Does **not** change which image flows downstream — downstream always uses the latest.
- **Run button** at the bottom. No auto-run, no debounce — every generation is an explicit click. When upstream inputs have changed since the last successful run, the button shows a small dot/ping (the `•` in `[ Run • ]` above). The button always shows the **estimated cost** of this run (`~$0.10` above), derived from `src/lib/fal/pricing.ts` × current resolution selection.
- Footer shows **last-run actual cost** after a successful Run, if fal's result payload includes it; otherwise stays blank.

**Handles.**

- Left: `image-in` — **multi-connection**. Accepts any number of incoming image edges (from Image nodes or other Prompts' `image-out`). The UI cap is the current model's max refs; if the user wires more than the model allows, the node flags an error and Run is disabled until the model is swapped or edges removed.
- Right: `image-out` — carries the output image to downstream Prompts or a Mesh node.

**Run behavior.**

- Click Run → POST `/api/jobs/image` → store `activeJobId` → TanStack Query polls `/api/jobs/:id` every 2s.
- While running: output slot shows the neo-brutalist **diagonal-stripe loading overlay** + a monospace status line (`IN_QUEUE`, `IN_PROGRESS`, optionally the fal `logs` tail). Run button disabled, relabeled `… Running`, shadow punched in. History strip is untouched. See `MODELS.md` § "Loading / running states" for the complete visual spec across node types.
- On success: download output → create Asset → **append** the new asset id to `outputAssetIds` → `activeJobId` clears → `inputsChangedSinceLastRun` clears → slot shows the new image, the previously-displayed one shifts into the history strip.
- On failure: badge "✗ failed: {error}" on the Run button. `activeJobId` clears. Prior outputs untouched. Run button re-arms for retry.

## 2. Image

**Purpose.** A standalone image living on the canvas — used as a reference input to one or more Prompt nodes.

**UI.**

```
┌───────────────────────┐
│ Image         × ⋯    │
│ ┌───────────────────┐ │
│ │                   │ │
│ │   [image preview] │●──▶ image-out
│ │                   │ │
│ └───────────────────┘ │
│ raven.jpg · 1024×1024 │
└───────────────────────┘
```

**How it's created.**

- Drag the **Image tile** from the sidebar palette onto the canvas → drops an empty Image node with a file picker open.
- Or drag an image file (jpg/png/webp/heic) from **Finder** directly onto empty canvas → auto-spawns an Image node at the drop position.
- Either path POSTs to `/api/assets/upload`. Server writes to `./uploads/<sha256>.<ext>`, converts HEIC → JPEG via `heic-convert`, creates an Asset row.
- Max upload size: **25 MB**. Rejected MIME types (TIFF, PSD, etc.) surface an inline toast.

**Handles.**

- Right: `image-out`.

## 3. Mesh

**Purpose.** Turn an image into a 3D model via Meshy.

**UI.**

```
                      ┌──────────────────────────────┐
                      │ Mesh                  × ⋯   │
 image-in     ●──────▶│ Mode: ⦿ preview  ○ refine    │
                      │                              │
                      │ ┌──────────────────────────┐ │
                      │ │                          │ │
                      │ │  [meshy thumbnail or     │●──▶ glb-out
                      │ │   progress ring]         │ │
                      │ │                          │ │
                      │ └──────────────────────────┘ │
                      │ [ Run ]         ·  2-5 min   │
                      └──────────────────────────────┘
```

- Preview mode = fast, lower quality (`fal-ai/meshy/v6-preview/image-to-3d`). Refine mode = higher quality (`fal-ai/meshy/v6/image-to-3d`). Default preview.
- Run button triggers generation. Like the Prompt node — explicit only, no auto-run.
- While running: same neo-brutalist diagonal-stripe overlay over the preview slot + monospace status line (`PENDING`, `IN_PROGRESS`). See `MODELS.md` § "Loading / running states".
- On success, Meshy's thumbnail URL is persisted via `/api/assets/persist` and replaces the overlay. Click → opens the Viewer node if connected, or lightbox with embedded `<model-viewer>`.
- Every artifact fal/Meshy returns (GLB, FBX, USDZ, OBJ, STL, thumbnail, video) is persisted locally and surfaced as its own download button at the bottom of the node.

## 4. Viewer

**Purpose.** Full interactive GLB viewer using `@google/model-viewer`.

**UI.**

```
 glb-in   ●──────▶┌──────────────────────────────┐
                  │ Viewer                × ⋯   │
                  │ ┌──────────────────────────┐ │
                  │ │                          │ │
                  │ │    <model-viewer>        │ │
                  │ │    camera-controls       │ │
                  │ │    auto-rotate           │ │
                  │ │                          │ │
                  │ └──────────────────────────┘ │
                  │ [ Auto-rotate ]  [ Exposure ] │
                  │ [ ⛶ Fullscreen ]              │
                  └──────────────────────────────┘
```

- Node is resizable (React Flow `NodeResizer`) — carvers will want a big viewer.
- Fullscreen button expands to an overlay; `Esc` exits.
- Keyboard: `r` toggle auto-rotate, `f` fullscreen.

**Code sketch.**

```tsx
<model-viewer
  src={`/api/assets/${assetId}`}
  camera-controls
  auto-rotate={data.autoRotate ? "" : undefined}
  exposure={String(data.exposure)}
  environment-image="neutral"
  shadow-intensity="1"
  style={{ width: "100%", height: "100%", background: "#111" }}
/>
```

## Chaining Prompts without an Image node

The core ergonomic: you can wire one Prompt node's `image-out` directly into the next Prompt node's `image-in`. No intermediate Image node. The downstream Prompt resolves the upstream's latest `outputAssetIds.at(-1)` at Run time.

A typical flow on the canvas:

```
[Image: dragged-in-sketch.jpg] ──▶ [Prompt: "refine into walnut totem"] ──▶ [Prompt: "same totem, moonlit forest backdrop"] ──▶ [Mesh: preview] ──▶ [Viewer]
```

Every arrow is `image-out → image-in` except the last two (`image-out → image-in` of Mesh, then `glb-out → glb-in` of Viewer).
