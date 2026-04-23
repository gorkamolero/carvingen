# Open Questions — Your Input Shapes These

The spec has enough detail for an agent to start building M0. Before that, three decisions need **your** call. Each is a short, meaningful contribution — not boilerplate. The outcome shapes how the app feels and costs to run.

---

## Decision 1 — Default model for a fresh ImageGen node — **DECIDED**

**Decision.** A fresh ImageGen node shows an always-visible model selector with `fal-ai/nano-banana-2` **preselected**. Each option in the selector is one row with:

- model display name
- a very sparse tagline (e.g. `fast · 14 refs`, `best text · 2K`, `edits · 1 ref`)
- the price tier

Nano Banana 2 is the preselected option because it's the cheapest and highest ref-cap — fits the "draw lots, pick one" carver iteration loop. No persisted last-pick behavior in v1 (every new node starts on Nano Banana 2). The user can change it freely.

**Flux >1 ref handling.** If the user has manually picked Flux Kontext and then wires a second reference, Flux is marked unavailable (greyed with tooltip: "only 1 reference"). The user re-picks; we do not auto-swap.

---

## Decision 2 — Node shape & run trigger — **DECIDED**

**Decision.** There is no separate Prompt node and ImageGen node — they collapse into a single node type.

**Canvas flow:**

1. User adds a **Prompt node** to the canvas. It contains, all in one:
   - text area for the prompt
   - model selector (Nano Banana 2 preselected — see Decision 1)
   - **Run** button
   - output image slot (empty until first run)
2. User drags an image file from **Finder directly onto the canvas** → spawns an **Image node** containing that image (alternate path: drag the Image tile from the sidebar, then pick a file).
3. User wires Image → Prompt, or Prompt output → another Prompt, to compose references.
4. Click **Run**. Image generates. It lands in the Prompt node's output slot.

**Run trigger.** Explicit button press only. No auto-run, no debounced run, no first-wiring run. Every generation costs money; every generation is a deliberate click.

---

## Decision 3 — Re-running a Prompt node: append + history — **DECIDED**

**Decision.** Re-running a Prompt node **appends** to a local history on the node. Nothing is ever discarded from the UI.

**UI shape.**

- The big output slot always shows the **latest** run.
- Below it, a small horizontal **thumbnail strip** of prior runs (newest first, excluding the currently-displayed one). Up to ~8 thumbs visible; overflow scrolls.
- Click a thumb → opens a lightbox for review/comparison. Does **not** change downstream behavior.
- Downstream nodes always resolve to the **latest** output. If the user wants an earlier version to be canonical, they wire a new Prompt node from it (branch).

**Staleness replaces "stale badge" with "inputs changed".**

- Since no image is ever overwritten or dimmed, there's no need for a visual "stale" state on the image itself.
- Instead, if an upstream input has changed since the last successful run, the **Run button shows a subtle dot/ping** — signalling "inputs changed, you'd probably want to Run again." No auto-run.
- Propagation is immediate (on upstream node mutation), not debounced.

**Data model change.** `PromptNode.data.outputAssetId: string | null` becomes `outputAssetIds: string[]` (newest last). The existing `jobs` table already keeps per-node run history, so no new tables.

---

## Decision 4 — Follow-up ambiguities — **DECIDED**

A second pass caught nine more real gaps. Resolved:

1. **How you create a node.** A minimal left-side sidebar / palette holds the node types. Drag a tile onto the canvas to spawn. Primary types in the palette: **Image** and **Prompt**. Secondary (below a separator): **Mesh**, **Viewer**. Dragging an image file from Finder directly onto the canvas still auto-spawns an Image node (alternate path that skips the palette).
2. **Deployment.** Local single-user for v1. `.env.local` for API keys. No auth, no hosting story. Users/multi-tenant added later.
3. **Cost display.** **Yes, pre-Run estimates.** Each model row in the selector shows a numeric per-image estimate (e.g. `$0.04`) next to the name + tagline. The currently-selected model's estimate also appears next to the Run button, so you see the cost of the click before you click. After a Run, if fal's response includes a real cost/duration, replace the estimate in the footer with the actual number for that run. No running-total HUD in v1; per-run is enough.
   - Estimates live in a static price table in `src/lib/fal/pricing.ts`, keyed by the model base slug. Build-time check against fal's model pages (e.g. https://fal.ai/models/fal-ai/nano-banana-2) to keep numbers current.
   - For `openai/gpt-image-2`, which prices by quality × resolution, the estimate assumes `quality: medium` and the currently-selected aspect ratio at 1024px on the short edge. If the user escalates quality (a future knob, not v1), re-estimate.
4. **Multi-project.** From day one. Top-bar (or sidebar top) project switcher with rename + new-project action. Each project is its own graph.
5. **First-load / onboarding.** Empty canvas. No tooltip, no example node, no splash. User discovers the sidebar.
6. **GLB download.** The Mesh node exposes every artifact Meshy returns (`glb`, `fbx`, `usdz`, `video_url`, `thumbnail_url`, etc.) as download buttons in the node. No Quest-specific helper for v1.
7. **Accepted image MIME types.** `image/jpeg`, `image/png`, `image/webp`, `image/heic`. Server-side converts HEIC to JPEG on upload (browsers don't render HEIC). Reject TIFF, PSD, and everything else with an inline toast. Max 25 MB per file.
8. **Default aspect ratio on a fresh Prompt node.** `1:1`. User can switch to any vertical or horizontal ratio the selected model supports.
9. **Canvas state + undo.** Use **Valtio** (not Zustand) from the start. Pair with `proxyWithHistory` from `valtio-history` (or the valtio/utils equivalent) so Cmd+Z / Cmd+Shift+Z cover every graph mutation — node create, delete, edge connect, edge disconnect, prompt text edits, model change, aspect change. Deleting a Prompt node with history thumbs is just another undo-able action; asset files on disk are never deleted, even on node delete (orphaned assets are garbage-collected later, not v1).

---

## Why these four and not others

Each touches a different axis of the product:

1. **Cost posture** (Decision 1): what the carver pays per session.
2. **Interaction model** (Decision 2): how magical vs. deliberate the canvas feels.
3. **Perceived value retention** (Decision 3): whether the canvas respects prior work.
4. **Surface clarity** (Decision 4): the concrete UX knobs — creation, deployment, persistence, formats, undo — that each block an agent from starting the build.

Everything else in the spec is either infrastructure (no ambiguity) or aesthetic (can be iterated on without rewriting).
