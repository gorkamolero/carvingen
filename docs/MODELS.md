# Image & 3D Model Catalog

All generation runs through [fal.ai](https://fal.ai) — images AND 3D. One SDK (`@fal-ai/client`), one API key (`FAL_KEY`), one server proxy (`@fal-ai/server-proxy`).

See also:
- fal Next.js integration: https://fal.ai/docs/examples/integrations/nextjs
- fal Vercel deployment: https://fal.ai/docs/examples/integrations/vercel
- fal workflow composition (reference, not used directly in v1): https://fal.ai/docs/examples/integrations/custom-workflow-ui

## Image models

Every image model on fal has **two slugs**: the base slug for pure text-to-image, and `<slug>/edit` for image editing / image-conditioned generation with reference inputs. The Carvingen adapter picks the right one automatically: `<slug>/edit` when the node has ≥ 1 `image-in` edge, base slug when it doesn't.

| Base slug | Edit slug | Display name | Refs | Aspect ratios | Resolutions | Strengths |
|-----------|-----------|--------------|------|---------------|-------------|-----------|
| `openai/gpt-image-2` | `openai/gpt-image-2/edit` | ChatGPT Image Gen 2 | multi | `1:1`, `3:2`, `2:3`, up to `3:1` / `1:3` | `1K`, `2K`, `4K` | Strongest prompt adherence, multilingual text, native reasoning |
| `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | Nano Banana 2 | 14 | `1:1`, `3:4`, `4:3`, `9:16`, `16:9` | `1K` only | Fast, cheap, great for iterative reference-chaining |
| `fal-ai/nano-banana-pro` | `fal-ai/nano-banana-pro/edit` | Nano Banana Pro | 6 | `1:1`, `3:4`, `4:3`, `9:16`, `16:9` | `1K`, `2K` | Multi-image fusion, multilingual text |
| `fal-ai/flux-pro/kontext` | `fal-ai/flux-pro/kontext` (same) | Flux Kontext Pro | 1 | `1:1`, `3:4`, `4:3`, `9:16`, `16:9` | `1K` only | Structure-preserving edits |

**Per-model pages (canonical source for input schemas):**
- `openai/gpt-image-2`: https://fal.ai/models/openai/gpt-image-2 · `/edit`: https://fal.ai/models/openai/gpt-image-2/edit
- `fal-ai/nano-banana-2`: https://fal.ai/models/fal-ai/nano-banana-2 · `/edit`: https://fal.ai/models/fal-ai/nano-banana-2/edit
- `fal-ai/nano-banana-pro`: https://fal.ai/models/fal-ai/nano-banana-pro · `/edit`: https://fal.ai/models/fal-ai/nano-banana-pro/edit
- `fal-ai/flux-pro/kontext`: https://fal.ai/models/fal-ai/flux-pro/kontext

**OpenAPI schema per endpoint (programmatic):**
```
https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<slug>
```

### Input schema (normalized — handled by adapter)

The adapter accepts one shape and translates per-model at call time:

```ts
type ImageGenInput = {
  modelBase: "openai/gpt-image-2" | "fal-ai/nano-banana-2" | "fal-ai/nano-banana-pro" | "fal-ai/flux-pro/kontext";
  prompt: string;
  referenceImages?: string[];   // public URLs the fal endpoint can fetch — we serve via /api/assets/:id
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "3:2" | "2:3";
  resolution?: "1K" | "2K" | "4K";   // gated on model — see table above. Default 1K.
  seed?: number;                // ignored by gpt-image-2
};
```

**Resolution mapping** (adapter does this):

- `openai/gpt-image-2`: maps `1K` → short-edge 1024 + `quality: "medium"`; `2K` → 2048 + `quality: "high"`; `4K` → 3840 + `quality: "high"`.
- `fal-ai/nano-banana-pro`: maps `1K` → `output_resolution: "1K"`; `2K` → `output_resolution: "2K"`.
- `fal-ai/nano-banana-2` and `fal-ai/flux-pro/kontext`: 1K only; the resolution chip strip is hidden for these models.
- Switching models resets resolution to 1K if the current pick isn't supported.

Adapter logic:

```ts
const slug = referenceImages?.length ? `${modelBase}/edit` : modelBase;
// flux-pro/kontext uses the same slug for both; skip /edit suffix in that case
const result = await fal.subscribe(slug, { input: buildInputFor(modelBase, { prompt, referenceImages, aspectRatio, seed }) });
```

Each model's native input keys (confirm against the model page linked above before M0):

- `openai/gpt-image-2`: `prompt`, optional `image_urls[]` (on `/edit`), `aspect_ratio` (`1:1`/`3:2`/`2:3`/...), `quality` (`low`/`medium`/`high`/`auto`), `num_images` (1–10), `output_format` (`webp`/`png`/`jpeg`).
- `fal-ai/nano-banana-2`: `prompt`, optional `image_urls[]` (on `/edit`), `aspect_ratio`, `num_images`.
- `fal-ai/nano-banana-pro`: `prompt`, optional `image_urls[]` (on `/edit`), `aspect_ratio`, `num_images`, resolution options.
- `fal-ai/flux-pro/kontext`: `prompt`, optional `image_url` (single), `aspect_ratio`.

**Important quirks:**

- `openai/gpt-image-2` only supports `1:1`, `3:2`, `2:3` (plus extreme ratios up to `3:1`). The other three support the common 4:3/16:9 set. The aspect-ratio chip strip is gated on the selected model.
- Flux Kontext only supports **one** reference image. If the user wires more, Flux is marked unavailable in the picker.
- `gpt-image-2` does not accept a seed — adapter drops the `seed` field silently for that model.
- fal returns output URLs that are **CDN-hosted and can expire**. Always persist to local storage on success via `POST /api/assets/persist`.

## 3D model (Meshy v6 via fal)

Meshy is hosted on fal too, so the whole pipeline is one provider.

| Slug | Purpose | Typical duration |
|------|---------|------------------|
| `fal-ai/meshy/v6/image-to-3d` | Production-quality single-image → GLB | ~1 min |
| `fal-ai/meshy/v6-preview/image-to-3d` | Faster preview quality | ~30–60s |

**Pages:**
- https://fal.ai/models/fal-ai/meshy/v6/image-to-3d
- https://fal.ai/models/fal-ai/meshy/v6-preview/image-to-3d

**Mode selector on the Mesh node.** Maps to the two slugs: "preview" → v6-preview, "refine" → v6.

**Artifacts.** Meshy-via-fal returns URLs for GLB (plus FBX, USDZ, OBJ, STL depending on endpoint) and a thumbnail. All of them are exposed as download buttons on the Mesh node (per Decision 4 §6). Like image outputs, we persist the GLB locally on success.

## Model picker UX inside the Prompt node

Each row shows: model name · sparse tagline · **numeric per-image estimate at the currently-selected resolution**. The selected model's estimate also appears next to the Run button. Resolution chips appear only when the selected model supports more than 1K.

```
┌──────────────────────────────────────┐
│ [Prompt text area]                    │
│                                       │
│ Model: [ Nano Banana Pro     ▼ ]     │
│   • GPT Image 2     best text    ~$0.08│
│   • Nano Banana 2   fast · 14 refs ~$0.04│
│   • Nano Banana Pro multi-fuse    ~$0.10│
│   • Flux Kontext    edits · 1 ref  ~$0.04│
│                                       │
│ Aspect:     [ 1:1 ] [ 3:4 ] [ 16:9 ] │
│ Resolution: [ 1K  ] [ 2K  ]          │  ← only if model supports >1K
│                                       │
│ [ Run  ~$0.10 ]                       │
└──────────────────────────────────────┘
```

- Nano Banana 2 preselected on fresh nodes (see `OPEN_QUESTIONS.md` § Decision 1).
- Estimates live in `src/lib/fal/pricing.ts` — a static table keyed by model base slug. Validate numbers against the fal model pages at build time; update the table as prices move.
- For `openai/gpt-image-2`, the estimate assumes `quality: medium` and the selected aspect ratio at 1024px short edge.
- After a Run completes, if fal's result payload includes a `billing` or `cost` field, the node footer replaces the estimate with the actual figure for that run.

## Loading / running states

Any node that has submitted a fal job and is waiting for a result shows a clear loading state. Aesthetic stays neo-brutalist (see `SPEC.md` § 8) — no gradients, no spinners with easing; use hard shapes.

**Prompt node — running.**

- Output slot: **diagonal black-on-cream striped overlay** (`repeating-linear-gradient(45deg, #000 0 8px, transparent 8px 16px)` at ~30% opacity) over the slot area. Reads as "work in progress" tape.
- Below the slot: a single monospace status line showing the fal queue state — `IN_QUEUE`, `IN_PROGRESS`, or the log tail when `logs: true`. Left-aligned, `JetBrains Mono`, no decorations.
- Run button disabled, relabeled `… Running`, shadow punched in to `1px 1px 0 #000` for the whole duration.
- Node border gets a faint animated barber-pole: the 3px black border's dasharray cycles at 2s/loop. Optional — acceptable to ship without this; the striped overlay alone is enough.
- Cost estimate next to the Run button stays visible (grey).

**Prompt node — failed.**

- Output slot: empty (previous successful output, if any, stays in the history strip).
- Red `#ff3131` strip across the node header, overriding the yellow.
- Status line: `FAILED · {first line of error}` in mono. Run button re-enabled with label `Retry`.

**Mesh node — running.**

- Same striped-overlay treatment in the model-preview slot.
- Status line shows fal/Meshy progress: `PENDING`, `IN_PROGRESS`, etc.
- Because Meshy v6 takes ~1 minute, no progress bar is worth building — the striped overlay + status line is enough and doesn't lie about progress.

**Viewer node — loading the GLB.**

- The `<model-viewer>`'s own `poster` / loading attribute handles this. Background stays cream, stripes optional. If we want consistency, the same 45° stripe overlay as a `::before` pseudo-element while `!modelViewer.loaded`.

**Image node (upload in flight).**

- Uploaded file dropped but the `/api/assets/upload` call hasn't resolved yet: empty preview area with the striped overlay and a `UPLOADING…` mono line. Once the server returns, swap to the preview.

**Global rule.** No skeleton shimmer. No rotating spinners. Loading = striped overlay + monospace status line. Consistent across node types.
