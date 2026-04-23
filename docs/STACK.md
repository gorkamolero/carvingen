# Stack & Dependencies

The stack is chosen for **single-developer speed**: every piece is a well-trodden default with shadcn-level community examples. No exotic tooling.

## Framework

**Next.js 15 (App Router) + React 19 + TypeScript strict.**

- The app has a UI and a handful of server routes. Next colocates them.
- App Router's Server Components aren't strictly needed here (the canvas is fully client-side), but Server Actions are a clean place to park project save/load.
- React 19 so we can use `use()` and `useOptimistic` in the mutation layer if it simplifies the job-submission code.

## Canvas engine — React Flow (`@xyflow/react`)

**Why not alternatives:**

- **Rete.js** — very node-editor-centric, but its docs and ecosystem are thinner than React Flow, and customizing node rendering is more awkward.
- **tldraw** — infinite canvas shines but you have to build the node-edge graph semantics on top; that's the whole thing we don't want to build from scratch.
- **Custom (SVG + hooks)** — doable in a week, breaks on multi-select, keyboard, and minimap. Not worth it.

React Flow:
- 23k+ stars, actively maintained.
- Built-in: drag, pan/zoom, minimap, multi-select, connection validation, undo-ready change stream.
- Custom nodes are plain React components.
- We get dirt-cheap handles + typed `onConnect`.

## State management

- **Valtio** for the graph (`nodes`, `edges`, `viewport`, + mutators). Proxy-based mutation pairs nicely with React Flow's imperative-feeling API, and `proxyWithHistory` from `valtio-history` (or the `valtio/utils` equivalent) gives undo/redo on every graph mutation for free.
- React Flow reads from the Valtio store via `useSnapshot`. Every user action — node create, delete, edge connect, prompt edit, model change — is a single mutation captured in the undo stack.
- **TanStack Query** for job polling and mutation lifecycles (`useQuery` with `refetchInterval: 2000` while `state` is non-terminal).
- **Nothing else.** No Redux, no Zustand, no context gymnastics.

## Styling

- **Tailwind CSS** — matches the shadcn way.
- **shadcn/ui via [neobrutalism.dev](https://www.neobrutalism.dev)** — a shadcn-compatible variant that applies a neo-brutalist aesthetic (thick black borders, hard offset shadows, saturated flat colors, no gradients). Copy-paste install like stock shadcn. We'll pull `button`, `select`, `dialog`, `sheet`, `tooltip`, `toast`, `slider`, `toggle-group`, `card`.
- Nodes themselves are hand-built on the same design tokens (border weight, shadow offset, accent colors) so they feel cohesive with the shadcn primitives.
- **No CSS-in-JS.**

## 3D preview

- **`@google/model-viewer`** — web component, one `<script>` tag. Camera controls, PBR, auto-rotate, environment images, all free.
- React 19 treats custom elements well; we declare `'model-viewer'` in a `.d.ts` for JSX.

Fallback path: if we need custom camera behavior or post-effects later, migrate that one node to `@react-three/fiber` + `@react-three/drei`. No v1 reason.

## Persistence

- **SQLite + Drizzle ORM.** One file on disk, zero infra.
- **better-sqlite3** driver (synchronous, fastest for local single-process).
- Drizzle because its types land in the editor without a codegen step.

## Async work clients

- **`@fal-ai/client`** — the official fal SDK. Used on the client side, pointed at our proxy.
- **`@fal-ai/server-proxy`** — exports `createRouteHandler()` for the App Router proxy at `/api/fal/proxy`. Hides `FAL_KEY`.
- **Vercel fal integration** (prod): https://vercel.com/integrations/fal — auto-injects the key.
- One provider = one SDK = one key. No Replicate, no Meshy SDK, no raw fetch adapters. See https://fal.ai/docs/examples/integrations/nextjs for the canonical pattern.
- **nanoid** for our internal job/asset ids (fal's `request_id` stays canonical for fal calls).
- **zod** for validating inbound route handler requests. Every `/api/*` has a schema.

## Forms / inputs

Vanilla controlled inputs inside node components. Forms aren't complex enough to warrant React Hook Form or similar.

## Testing

- **Vitest** — unit tests for the adapters (mocked `fetch`), graph mutations (staleness propagation), node input validation.
- **Playwright** — one e2e happy path against a real `FAL_KEY`: canvas load → Prompt node → Run → wait for actual image → Mesh node (preview) → wait for GLB → asset exists on disk.
- Per the user's global rules: **no mocked DB**, one test per user journey, no always-pass assertions.

## Package list (target `package.json`)

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@xyflow/react": "^12.0.0",
    "valtio": "^2.1.0",
    "valtio-history": "^0.3.0",
    "@fal-ai/client": "^1.0.0",
    "@fal-ai/server-proxy": "^1.0.0",
    "@tanstack/react-query": "^5.0.0",
    "drizzle-orm": "^0.36.0",
    "better-sqlite3": "^11.0.0",
    "zod": "^3.23.0",
    "nanoid": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "@radix-ui/react-*": "...",
    "clsx": "^2.1.0",
    "@google/model-viewer": "^4.0.0",
    "sharp": "^0.33.0",
    "heic-convert": "^2.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "drizzle-kit": "^0.28.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.48.0",
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

Pinned minors deliberately loose for `pnpm up` hygiene at init.

## Directory layout

```
carvingen/
├── README.md
├── docs/                      (this spec)
├── drizzle/
│   ├── schema.ts
│   └── migrations/
├── outputs/                   (gitignored — downloaded assets)
├── uploads/                   (gitignored — user refs)
├── src/
│   ├── app/
│   │   ├── page.tsx           (the canvas)
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── fal/
│   │       │   └── proxy/route.ts    (one-liner: createRouteHandler() from @fal-ai/server-proxy/nextjs)
│   │       ├── jobs/
│   │       │   ├── route.ts          (POST to record a submitted fal job, GET active jobs)
│   │       │   └── [id]/
│   │       │       └── complete/route.ts
│   │       ├── assets/
│   │       │   ├── upload/route.ts   (multipart, HEIC→JPEG)
│   │       │   ├── persist/route.ts  (download fal-hosted URL to local disk)
│   │       │   └── [id]/route.ts     (stream local file)
│   │       └── projects/
│   │           ├── route.ts          (GET list, POST create)
│   │           └── [id]/
│   │               ├── route.ts      (GET load, PATCH rename)
│   │               └── save/route.ts
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── Canvas.tsx
│   │   │   ├── Sidebar.tsx           (the palette: Image, Prompt, Mesh, Viewer — draggable tiles)
│   │   │   └── ProjectSwitcher.tsx   (top-bar multi-project switcher)
│   │   ├── nodes/
│   │   │   ├── PromptNode.tsx       (text + model + run + output slot + history)
│   │   │   ├── ImageNode.tsx        (palette-dropped or Finder-dragged)
│   │   │   ├── MeshNode.tsx
│   │   │   └── ViewerNode.tsx
│   │   ├── edges/
│   │   │   └── CarvingEdge.tsx
│   │   └── ui/                (shadcn generated)
│   ├── lib/
│   │   ├── fal/
│   │   │   ├── client.ts              (fal.config({ proxyUrl }) + typed wrappers)
│   │   │   ├── image.ts               (normalize ImageGenInput → per-model input payload; pick base vs /edit slug)
│   │   │   └── mesh.ts                (Meshy v6 via fal wrapper)
│   │   ├── graph/
│   │   │   ├── store.ts              (valtio proxy + proxyWithHistory)
│   │   │   ├── inputs-changed.ts     (downstream "inputs changed since last run" propagation)
│   │   │   └── connections.ts        (edge validation)
│   │   ├── upload/
│   │   │   └── heic.ts               (server-side HEIC → JPEG conversion on upload)
│   │   └── db/
│   │       ├── client.ts
│   │       └── queries.ts
│   └── styles/
│       └── globals.css
├── tests/
│   ├── unit/
│   └── e2e/
├── .env.local.example
├── drizzle.config.ts
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── package.json
```
