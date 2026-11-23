# market-simulator

An Angular realtime fintech dashboard. In its finished form the application
renders a live market view whose data is generated locally by a WebAssembly
library written for this project, running inside a Web Worker so data
generation never competes with the UI thread.

The repository is currently a scaffold: it ships the infrastructure the
product will grow on and no business logic yet. What exists today:

- an Nx workspace on pnpm with workspace-wide build, lint, and test gates
- an Angular application shell with two placeholder routes (a market
  dashboard view and a producer settings view) and navigation between them
- a wired but empty Web Worker with a typed ping/echo message contract
- a stub Wasm target (AssemblyScript) whose compiled artifact loads through
  the worker
- a GitHub Actions workflow that installs, gates, and deploys the app on
  every push to main

## Prerequisites

- Node 22. The pinned major lives in `.nvmrc` (the same file CI reads).
- pnpm, activated through corepack. The exact version is pinned by the
  `packageManager` field in `package.json`, so no separate global install
  is needed:

```sh
corepack enable
```

## Install

```sh
pnpm install
```

Restores every workspace project from the committed lockfile.

## Development serve

```sh
pnpm exec nx serve market-simulator
```

Starts the Angular dev server with live reload for the application.

## Build

```sh
pnpm exec nx build market-simulator
```

Builds the application for production. Its Wasm dependency builds first and
ships inside the output as a static asset.

## Lint and tests

The workspace-wide gates (the same commands CI runs):

```sh
pnpm exec nx run-many -t build,lint,test
```

Formatting:

```sh
pnpm exec nx format:check
pnpm exec nx format:write
```

## Deploy

There is no manual deploy step. Every push to main triggers the GitHub
Actions workflow in `.github/workflows/deploy.yml`: it installs from the
frozen lockfile on Node 22, runs the build, lint, and test gates, builds
the production bundle with the GitHub Pages base path, and publishes the
result to GitHub Pages. The workflow can also be started manually from
the Actions tab.

## Project structure

Projects follow the Nx workspace convention and live under `apps/` and
`libs/`:

- `apps/market-simulator` - the Angular application (shell, routes, worker)
- `libs/wasm-stub` - the AssemblyScript stub library compiled to Wasm

Toolchain configuration stays at the workspace root: `package.json`,
`pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, `.nvmrc`.
