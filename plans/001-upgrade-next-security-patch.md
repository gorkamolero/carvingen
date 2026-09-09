# Plan 001: Upgrade Next.js Past Current High Advisories

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the STOP conditions section occurs, stop and report - do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 26dc007..HEAD -- package.json pnpm-lock.yaml`
> If either file changed since this plan was written, compare the current version fields against the Current State section before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `26dc007`, 2026-07-01

## Why This Matters

The repo builds and tests cleanly, but its current Next.js version is covered by high advisories in the production dependency audit. A same-minor patch should remove that public-readiness blocker before any hosted demo or repo visibility change.

## Current State

- `package.json:42` pins `next` to `16.2.4`.
- `package.json:64` pins `eslint-config-next` to `16.2.4`.
- `pnpm audit --prod --audit-level high` reports high Next.js advisories with patched versions `>=16.2.5` and `>=16.2.6`.
- `pnpm test`, `pnpm lint`, and `pnpm build` currently pass on the dirty local tree.

## Commands You Will Need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install/update | `pnpm add next@16.2.6 eslint-config-next@16.2.6 -D=false` | `package.json` and `pnpm-lock.yaml` update; exit 0 |
| Test | `pnpm test` | 8 test files pass, 36 tests pass |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm build` | exit 0 |
| Audit | `pnpm audit --prod --audit-level high` | no high Next.js advisory for the installed version |

## Scope

**In scope**:

- `package.json`
- `pnpm-lock.yaml`

**Out of scope**:

- Source code changes.
- Framework migrations beyond the minimum same-minor patch.
- Public deployment or GitHub visibility changes.

## Git Workflow

- Work on the current local branch unless the operator creates a branch.
- Commit only `package.json` and `pnpm-lock.yaml`.
- Use a direct commit message such as `Upgrade Next security patch`.
- Do not push unless the operator explicitly instructs you to push.

## Steps

### Step 1: Upgrade Next.js and matching lint config

Run:

```bash
pnpm add next@16.2.6 eslint-config-next@16.2.6 -D=false
```

Confirm `package.json` shows both packages at `16.2.6`.

**Verify**: `rg -n '"next":|"eslint-config-next":' package.json` -> both entries show `16.2.6`.

### Step 2: Run the verification suite

Run:

```bash
pnpm test
pnpm lint
pnpm build
pnpm audit --prod --audit-level high
```

**Verify**: tests, lint, and build exit 0. The audit no longer reports high advisories for `next`.

## Test Plan

- No new tests are required for a patch-only dependency update.
- Existing coverage is the verification gate: unit tests, lint, build, and production dependency audit.

## Done Criteria

- [x] `package.json` uses `next` `16.2.6`.
- [x] `package.json` uses `eslint-config-next` `16.2.6`.
- [x] `pnpm-lock.yaml` reflects the same patch versions.
- [x] `pnpm test` exits 0 with 36 tests passing.
- [x] `pnpm lint` exits 0.
- [x] `pnpm build` exits 0.
- [x] `pnpm audit --prod --audit-level high` has no high Next.js advisory for the installed version.
- [x] `plans/README.md` marks Plan 001 as DONE.

## Completion Note

Completed on 2026-07-01 in commit scope `Upgrade Carvingen Next security patch`.

Verification:

- `pnpm test`: 8 test files passed, 36 tests passed.
- `pnpm lint`: exit 0.
- `pnpm build`: exit 0 on Next.js 16.2.6; fal proxy warnings remain and are covered by Plan 002.
- `pnpm audit --prod --audit-level high`: exit 0; remaining advisories are below high severity.

## STOP Conditions

Stop and report if:

- The package manager proposes a major-version upgrade.
- `pnpm build` fails due to a framework behavior change.
- The audit still reports high Next.js advisories after the patch.
- Fixing verification requires source code changes.

## Maintenance Notes

Treat this as a baseline patch. Any later public deployment should still run `pnpm audit --prod --audit-level high` because Next advisories are time-sensitive.
