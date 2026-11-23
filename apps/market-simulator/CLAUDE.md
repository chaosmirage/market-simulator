# market-simulator

## Purpose

The Angular application unit: the browser shell with two destination
routes, the embedded market-producer Web Worker, and the WebAssembly load
path. This directory carries the application's build, serve, and test
wiring; behavior inside `src/app` is documented by nested guides.

## Key pieces

- `project.json` - the unit's targets. The build uses the Angular
  application builder with `src/main.ts` as the browser entry, copies
  `public/` verbatim, and copies `dist/libs/wasm-stub/*.wasm` into the
  `wasm/` output directory (the artifact the worker fetches). Serve, lint,
  test, and a static file server round out the target set.
- Two compiled entry points, both listed in `tsconfig.app.json` `files`:
  `src/main.ts` (browser bootstrap; it also runs the worker startup proof
  at launch) and `src/app/worker/market-producer.worker.ts` (the worker
  bundle). A new separately compiled entry must be added there or it
  silently drops out of the program.
- `src/index.html` - the served document. It carries the deny-by-default
  content-security baseline in a head meta; the static host sets no
  response headers, so the policy ships in-document or never.
- `src/document-csp.spec.ts` - pins that policy directive by directive by
  reading the document bytes (node environment, no DOM).
- `src/test-setup.ts` with `vite.config.mts` - vitest on jsdom with the
  Angular test bed; specs are discovered under
  `{src,tests}/**/*.{test,spec}.{js,ts,...}`.
- Nested guides: `src/app/CLAUDE.md`, `src/app/worker/CLAUDE.md`,
  `src/app/wasm/CLAUDE.md`.

```sh
pnpm exec nx test market-simulator
pnpm exec nx lint market-simulator
```

## How to extend safely

- Change the content-security baseline only as a pair: the meta in
  `src/index.html` together with the pinned expectations in
  `src/document-csp.spec.ts`, keeping the meta inside `<head>`.
- Register new static assets in `public/`; wasm artifacts enter only
  through the project.json assets entry from the library's build output.
- Keep `tsconfig.app.json` `files` equal to the real set of compiled entry
  points.
