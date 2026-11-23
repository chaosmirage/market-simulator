# market-simulator

## Purpose

Realtime fintech dashboard. The application renders a live market view of
fictional instruments with the five dashboard metrics per row, plus a
producer settings page whose Apply action starts a fresh run; all market
data is
generated locally by a project-owned WebAssembly library running inside a
Web Worker, so data generation never competes with the UI thread. The
repository is an Nx workspace on pnpm holding one Angular application
(`apps/market-simulator`) and one AssemblyScript library compiled to Wasm
(`libs/wasm-stub`), plus an automatic GitHub Pages delivery pipeline.

## Key pieces

- Workspace substrate at the root: `package.json` (pnpm `packageManager`
  pin), `pnpm-workspace.yaml` (packages under `apps/*` and `libs/*`),
  `nx.json` (build and test targets run after the projects they depend on),
  `tsconfig.base.json` (strict; excludes `libs/wasm-stub`, which is
  AssemblyScript rather than application TypeScript), `vitest.workspace.ts`,
  and `eslint.config.mjs` (Nx module boundaries).
- Toolchain pins are single-sourced: the Node major lives in `.nvmrc` and
  the exact pnpm version plus integrity hash in the `packageManager` field;
  CI reads both files instead of duplicating literals.
- Wasm artifact flow spanning both projects: `libs/wasm-stub` compiles
  first into `dist/libs/wasm-stub/wasm-stub.wasm`; the application build
  copies it into `dist/apps/market-simulator/browser/wasm/`; the worker
  fetches it same-origin at `wasm/wasm-stub.wasm`. Treat the library output
  path, the app assets entry, and the loader URL as one contract.
- Application surface spanning both projects: the worker owns the
  authoritative run state (settings, analytics, monotonic runId) and pushes
  typed metric snapshots; the Angular shell holds one producer for the whole
  app through the single worker-client construction path, and a signal-held
  run-state store feeds the status band, the dashboard table, and the
  settings form. See the nested guides for each seam.
- Delivery (`.github/workflows/deploy.yml`): every push to main (or a
  manual dispatch) installs from the frozen lockfile on the pinned Node,
  runs the workspace gates, builds the production bundle with the GitHub
  Pages base href, and publishes it; one deployment is in flight at a time.

```sh
pnpm exec nx serve market-simulator
pnpm exec nx build market-simulator
pnpm exec nx run-many -t build,lint,test
```

- Nested guides: `apps/market-simulator/CLAUDE.md` (application unit) and
  `libs/wasm-stub/CLAUDE.md` (Wasm library).

## How to extend safely

- Add new workspace projects under `apps/` or `libs/` and register build,
  lint, and test targets so `nx run-many -t build,lint,test` keeps covering
  everything CI runs.
- Keep the artifact flow aligned when touching any of its three anchor
  points: the library build output, the assets entry in
  `apps/market-simulator/project.json`, and the default URL in the app wasm
  loader.
- Keep version pins single-sourced: change Node through `.nvmrc` and pnpm
  through the `packageManager` field; never duplicate a version into the
  workflow.
- Keep this file a short router plus the cross-project invariants above;
  put directory detail in the nested guide for the directory you touch.
