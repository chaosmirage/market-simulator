# market-simulator

A realtime market dashboard. The application renders a live table of
fictional financial instruments whose data is generated locally by a
WebAssembly library written for this project in AssemblyScript and running
inside a Web Worker, so data generation never competes with the UI thread.
No market data is fetched from the network: every trade is simulated in the
browser.

[![CI](https://github.com/chaosmirage/market-simulator/actions/workflows/deploy.yml/badge.svg)](https://github.com/chaosmirage/market-simulator/actions/workflows/deploy.yml)

Live demo: <https://chaosmirage.github.io/market-simulator/>

## What the application does

- **Market dashboard** — a live table with one row per instrument and five
  metrics per row, in a fixed order: last traded price, bid–ask spread,
  cumulative trading volume, volume-weighted average price (VWAP), and
  order-book imbalance. Volume and VWAP are cumulative over the whole run:
  every generated trade is counted exactly once, even though the table
  refreshes less often than data is produced. Prices render as USD currency
  and imbalance as a value between −1 and +1. A metric that has no data yet,
  or whose formula has a zero denominator, renders an explicit unavailable
  marker instead of a number.
- **Producer settings** — a validated form for the three producer settings:
  instrument count (1–50, default 5), updates per batch (1–1,000, default
  100), and batch interval in milliseconds (50–2,000, default 500), all
  integers. The form derives and shows the implied nominal update rate, and
  rejects non-integer or out-of-range entries next to the field that produced
  them. Editing a value never touches the running producer; the **Apply**
  action starts a new run with the new settings and clears the previous
  run's values and totals, then returns to the dashboard when the new run
  starts successfully.
- **Run lifecycle** — a pause control stops generation while every value and
  total stands preserved (a final snapshot accounts for all events processed
  before the pause), and resuming continues from those totals with no
  catch-up generation. The producer status — initializing, running, paused,
  or error — is always visible. Navigating between the two pages preserves
  the active run; exactly one producer serves the whole application, and
  results from a replaced run are dropped rather than displayed.

## Quick start

Clone, install, and run in one block:

```sh
git clone https://github.com/chaosmirage/market-simulator.git
cd market-simulator
corepack enable
pnpm install
pnpm exec nx serve market-simulator
```

Each step is unpacked in the sections below.

## Prerequisites

- Node, its pinned major in `.nvmrc` (the same file CI reads).
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

Starts the Angular dev server with live reload for the application. The
Wasm dependency builds first and is served as a static asset.

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

The suite covers the metric math (a hand-computed worked example, zero
denominators, independence between instruments), settings validation and the
reset-on-apply behavior, pause/resume with rejection of previous-run
results, and the generator's batch sizes and value invariants. No test
depends on long real-time waits.

To run only the compiled Wasm generator artifact tests and rerun them when the
generator changes or the artifact spec is edited:

```sh
pnpm run test:market-generator:watch
```

The command runs the artifact test once at startup, then watches the generator
project and the app project. It reruns only for generator changes or changes to
`market-generator.artifact.spec.ts`; unrelated app changes are ignored. Nx
rebuilds the Wasm dependency before each test run. Stop watching with Ctrl+C.

Formatting:

```sh
pnpm exec nx format:check
pnpm exec nx format:write
```

## Deploy

There is no manual deploy step. Every push to main triggers the GitHub
Actions workflow in `.github/workflows/deploy.yml`: it installs from the
frozen lockfile on the Node version pinned in `.nvmrc`, runs the build,
lint, and test gates, builds the production bundle with the GitHub Pages
base path, and publishes the result to GitHub Pages. The workflow can also
be started manually from the Actions tab.

## How it works

Data flows through three tiers in one direction:

1. `libs/market-generator` (AssemblyScript) compiles to
   `market-generator.wasm`. The
   module keeps per-instrument state between calls and generates batches of
   market updates: one simulated trade plus a bid/ask snapshot per update.
   Randomness and price evolution run inside the Wasm module, seeded from an
   init parameter. Each update is seven 32-bit integers — instrument id,
   trade price in cents, trade quantity, bid and ask in cents, and the
   available bid and ask quantities — written as fixed-size records into the
   module's linear memory; the worker reads a batch through a typed view
   before the buffer is reused. Generated prices stay positive, the bid
   stays below the ask, and prices evolve from previous values rather than
   being redrawn from scratch.
2. The market-producer Web Worker owns the run. It drives the generator at
   the configured batch interval, folds every update into per-instrument
   analytics (the metric math is plain, separately tested TypeScript inside
   the worker), and publishes ready-made metric snapshots to the application
   about four times per second, plus one final snapshot on pause. Everything
   crossing the worker boundary belongs to a typed message contract
   validated on both sides, and every run carries a monotonic id, so results
   from a replaced run are dropped instead of overwriting the new one.
3. The Angular application renders. A signal-held store, fed by the worker
   client, backs the status band and both pages; the table's data source is
   replaced wholesale per snapshot, so the UI thread never does per-event
   work however high the generation rate is set.

All generated prices are integer cents; rounding happens only for display.

## Tech stack

- Angular with Angular Material - application shell, routing, table, form
- TypeScript - application and worker code, including the metric math
- Nx workspace - build, lint, and test orchestration across projects
- pnpm - workspace package management from a committed lockfile
- AssemblyScript - compiled to WebAssembly, loaded inside a Web Worker
- Vitest, ESLint, Prettier - unit tests, linting, and formatting
- GitHub Actions - CI gates and the GitHub Pages deployment

## Project structure

Projects follow the Nx workspace convention and live under `apps/` and
`libs/`:

- `apps/market-simulator` - the Angular application (shell, routes, pages,
  worker client, run-state store)
- `libs/market-generator` - the AssemblyScript market-update generator compiled to
  Wasm

Toolchain configuration stays at the workspace root: `package.json`,
`pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, `.nvmrc`.

## Contributing

Run the workspace gates before opening a change — the same command CI runs:

```sh
pnpm exec nx run-many -t build,lint,test
```

## Scope

The simulation is deliberately simple: it is a data generator — prices that
evolve from previous values with a bid/ask book — not an exchange model.
There is no order matching and no real market data, and settings do not
persist across a browser reload.
