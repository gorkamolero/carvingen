# Plan 002: Lock Provider And Remote-Asset Boundaries

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the STOP conditions section occurs, stop and report - do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 26dc007..HEAD -- src/app/api/fal/proxy src/app/api/assets/persist src/lib/storage src/lib/env.ts tests`
> If any in-scope file changed since this plan was written, compare the Current State excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-upgrade-next-security-patch.md`
- **Category**: security
- **Planned at**: commit `26dc007`, 2026-07-01
- **Completed at**: 2026-07-01
- **Verification**: `pnpm test`, `pnpm lint`, and `pnpm build` pass; build output no longer shows unrestricted fal proxy warnings.

## Why This Matters

Carvingen is currently safe as a trusted local single-user tool, but the portfolio goal is to make it inspectable. A public deployment must not expose an unauthenticated fal proxy or a route that downloads arbitrary remote URLs into local storage. This plan creates a public-demo-safe boundary while preserving local provider-backed development.

## Current State

- `src/app/api/fal/proxy/route.ts:5` exports `createRouteHandler()` with no config.
- `src/app/api/fal/proxy/[...path]/route.ts:5` exports the same unconfigured proxy.
- `pnpm build` prints: no allowed endpoints specified, all endpoints allowed; unauthenticated requests allowed.
- `src/app/api/assets/persist/route.ts:7-10` accepts `sourceUrl: z.url()`, `kind: z.string()`, and optional `jobId`.
- `src/lib/storage/persist-remote.ts:14-31` fetches `input.sourceUrl`, reads the entire response into memory, infers an extension from response MIME or `kind`, and writes the buffer to generated asset storage.
- `src/lib/env.ts:6-13` already centralizes environment parsing and is the right place to add public-demo and size/host configuration.
- Existing tests use Vitest under `tests/unit/`.

## Commands You Will Need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Test | `pnpm test` | all unit tests pass |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm build` | exit 0; fal proxy warnings are gone or intentionally limited to local mode |

## Scope

**In scope**:

- `src/app/api/fal/proxy/route.ts`
- `src/app/api/fal/proxy/[...path]/route.ts`
- `src/app/api/assets/persist/route.ts`
- `src/lib/storage/persist-remote.ts`
- `src/lib/storage/paths.ts`
- `src/lib/env.ts`
- New unit tests under `tests/unit/`
- README or `.env.example` documentation for new env vars

**Out of scope**:

- Full account/auth system.
- Changing the core node UI.
- Deleting generated local files.
- Public deployment.

## Git Workflow

- Work on the current local branch unless the operator creates a branch.
- Commit in one logical unit after all verification passes.
- Do not push unless the operator explicitly instructs you to push.

## Steps

### Step 1: Configure the fal proxy explicitly

Create one shared proxy config module or inline identical config in both fal proxy route files. Use the `@fal-ai/server-proxy` config options documented in `node_modules/@fal-ai/server-proxy/src/config.d.ts`:

- `allowedEndpoints`: include only endpoints currently used by Carvingen image, mesh, video, and vision adapters.
- `allowUnauthorizedRequests`: allow unauthenticated requests only when an explicit local/demo env setting says so.
- Keep `runtime = "nodejs"`.

Use endpoint values from:

- `src/lib/fal/models.ts`
- `src/lib/fal/image.ts`
- `src/lib/fal/mesh.ts`
- `src/lib/fal/video.ts`
- `src/lib/fal/vision.ts`

**Verify**: `pnpm build` -> the previous all-endpoints/unauthenticated warnings should disappear for normal configuration, or the output should clearly show they only remain when an explicit local flag enables them.

### Step 2: Constrain remote asset persistence

Replace the broad `kind: z.string()` and unconstrained fetch with a typed boundary:

- Define allowed persisted kinds: `image`, `thumbnail`, `glb`, `fbx`, `usdz`, `obj`, `stl`, `video`, plus the existing mesh artifact kind strings that `extractMeshArtifacts` can emit.
- Restrict `sourceUrl` to expected provider/CDN hosts for provider result URLs, or to an explicit env allowlist.
- Reject private/local URL hosts and protocols by default.
- Enforce a maximum persisted remote asset size before buffering the full response. Use a new env var such as `MAX_REMOTE_ASSET_BYTES`, with a conservative default suitable for portfolio demos.
- Validate response content type against the requested kind.

**Verify**: add unit tests for accepted provider URL, rejected local/private URL, rejected unknown kind, and rejected oversized response.

### Step 3: Document the public boundary

Add or update documentation so the operator knows which mode is local-provider mode and which mode is public-demo-safe mode:

- Required env vars.
- Which routes are safe to expose.
- Why provider-backed generation should stay off for a recruiter demo unless authenticated.

**Verify**: `rg -n "MAX_REMOTE_ASSET_BYTES|allowedEndpoints|allowUnauthorizedRequests|public-demo" README.md .env.example docs src`.

## Test Plan

Add focused unit tests under `tests/unit/storage/` or `tests/unit/security/`.

Cover:

- Allowed provider URL + allowed kind succeeds with mocked fetch.
- Localhost/private network URL rejects.
- Unknown kind rejects.
- Content-length over limit rejects before full persistence.
- Missing content-length still enforces the final buffer size.

Use existing tests such as `tests/unit/fal/video.test.ts` as the structure pattern: small direct function tests with `describe`, `it`, and `expect`.

## Done Criteria

- [x] fal proxy routes use explicit config.
- [x] Build output no longer shows unrestricted fal proxy warnings in normal mode.
- [x] `/api/assets/persist` rejects arbitrary URL/kind input.
- [x] Remote persistence has a size cap and tests.
- [x] `pnpm test` exits 0.
- [x] `pnpm lint` exits 0.
- [x] `pnpm build` exits 0.
- [x] Public/demo boundary is documented.
- [x] `plans/README.md` marks Plan 002 as DONE.

## STOP Conditions

Stop and report if:

- The fal proxy package cannot support the needed endpoint/auth config.
- Provider SDK calls break because the endpoint allowlist cannot match queue routes safely.
- The fix requires a full auth system.
- Tests need real network/provider calls.

## Maintenance Notes

Every new provider model must update the endpoint allowlist and persistence kind/content-type tests. Reviewers should scrutinize the public/private mode defaults and make sure safe public behavior is the default for deployed demos.
