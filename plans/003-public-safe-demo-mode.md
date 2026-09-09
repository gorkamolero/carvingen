# Plan 003: Add A Public-Safe Portfolio Demo Mode

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the STOP conditions section occurs, stop and report - do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 26dc007..HEAD -- src app tests public README.md docs`
> If the canvas, graph, or route files changed since this plan was written, compare the Current State excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/002-lock-provider-and-asset-boundaries.md`
- **Category**: direction
- **Planned at**: commit `26dc007`, 2026-07-01
- **Completed at**: 2026-07-01
- **Verification**: `pnpm test`, `pnpm lint`, `pnpm build`, and `pnpm playwright test tests/e2e/portfolio-demo.spec.ts` pass.

## Why This Matters

Carvingen has enough implementation depth to be a strong portfolio project, but a live recruiter link should not expose real provider runs, private prompts, local SQLite state, or generated media. A fixture-backed demo route can prove the canvas, node taxonomy, graph persistence shape, and viewer surface while keeping the real local workspace private.

## Current State

- `src/app/page.tsx:1-4` renders the full `CanvasScreen` at `/`.
- `src/features/canvas/CanvasScreen.tsx:27-165` loads or creates real local projects through `/api/projects`.
- `src/lib/db/repositories/projects.ts:96-151` persists full graphs into SQLite.
- `src/features/canvas/nodes/PromptNode.tsx:96-195`, `src/features/canvas/nodes/MeshNode.tsx:61-172`, and `src/features/canvas/nodes/VideoNode.tsx:61-158` run real provider jobs.
- `tests/e2e/app-load.spec.ts:3-11` only verifies the shell loads.
- The command-center portfolio already uses a fake-data screenshot at `portfolio/assets/carvingen-fake-canvas.png`; the app itself does not have a `/portfolio-demo` route.

## Commands You Will Need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Unit tests | `pnpm test` | all unit tests pass |
| Local e2e | `pnpm test:e2e:local` | local canvas e2e passes |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:

- A new route such as `src/app/portfolio-demo/page.tsx`.
- Fixture data under a safe source path such as `src/features/demo/`.
- Read-only/demo canvas components where needed.
- Public-safe assets in `public/demo/` only if they are created specifically for this demo and carry no private/generated-rights risk.
- E2E tests for the demo route.
- README documentation for the demo route.

**Out of scope**:

- Real provider calls in demo mode.
- Using local `.env.local`, `carvingen.sqlite`, `outputs/`, `output/`, or `tmp/` for the demo.
- Full account/auth system.
- Publishing or deploying the app.

## Git Workflow

- Work on the current local branch unless the operator creates a branch.
- Commit the demo route and tests as one logical unit.
- Do not push unless the operator explicitly instructs you to push.

## Steps

### Step 1: Define a fixture graph

Create a fixture graph that demonstrates the actual product shape:

- One Image node using a safe placeholder reference.
- One Prompt node with fake public-demo text and one fake output image.
- One Mesh node with a fake thumbnail or local placeholder GLB reference.
- One Video or Vision node only if the UI can show it without implying real provider output.

Use current type constructors from `src/lib/graph/types.ts` and serialization expectations from `src/lib/graph/serialization.ts`.

**Verify**: a unit test imports the fixture and validates it with `validateProjectGraph`.

### Step 2: Build a read-only demo route

Add `/portfolio-demo` that renders the canvas surface with the fixture graph and disables or hides provider-spend controls:

- Run buttons should be disabled or replaced with non-spend labels.
- Project switcher should indicate demo mode.
- The route should not call `/api/projects`, `/api/jobs`, `/api/assets/persist`, or the fal proxy.
- The visual styling should match the real app so the demo is honest.

**Verify**: an e2e test opens `/portfolio-demo`, sees the Image, Prompt, Mesh, and relevant output preview surfaces, and confirms no provider/job API calls are made.

### Step 3: Add public-demo documentation

Update README with:

- `/portfolio-demo` purpose.
- What it proves.
- What it deliberately withholds.
- The command to run it locally.

**Verify**: `rg -n "portfolio-demo|provider-spend|fake|fixture" README.md src tests`.

## Test Plan

Add:

- A unit test for the fixture graph shape.
- A Playwright test for `/portfolio-demo`.
- A route/network assertion that the demo route avoids `/api/fal`, `/api/jobs`, and `/api/assets/persist`.

Use existing e2e style from `tests/e2e/app-load.spec.ts` and `tests/e2e/project-isolation.spec.ts`.

## Done Criteria

- [x] `/portfolio-demo` exists.
- [x] Demo route renders a public-safe graph with image, prompt, mesh, and viewer/proof surfaces.
- [x] Demo route does not call provider-spend or persistence routes.
- [x] Demo fixtures contain no private prompts, local file paths, generated outputs, or client media.
- [x] README documents the demo route and boundary.
- [x] `pnpm test` exits 0.
- [x] `pnpm test:e2e:local` exits 0.
- [x] `pnpm lint` exits 0.
- [x] `pnpm build` exits 0.
- [x] `plans/README.md` marks Plan 003 as DONE.

## STOP Conditions

Stop and report if:

- Rendering the real canvas in read-only mode requires a broad rewrite.
- The only way to show a convincing demo is to use private/generated media from `output/`, `outputs/`, or `tmp/`.
- The demo route needs provider keys or a database connection.
- E2E tests become flaky because they depend on external network or model providers.

## Maintenance Notes

The demo route should stay a hiring proof surface, not a second product mode. When the real node taxonomy changes, update the fixture and demo test in the same PR.
