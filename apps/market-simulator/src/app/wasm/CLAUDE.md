# wasm

## Purpose

The application's WebAssembly load path: the typed view of the generator
module's exports, the instantiate core, and the same-origin fetch of the
deployed artifact. Every byte source — the worker's browser fetch and the
artifact spec's read from the build output — feeds the one instantiate
path.

## Key pieces

- `wasm-loader.ts` - `MarketGeneratorExports` is the typed surface the module
  must expose: `memory`, `init`, `generateBatch`, and `recordCount`, each
  fail-fast-checked in `instantiateMarketGenerator(bytes)` when missing.
  `loadMarketGenerator()` fetches the deployed artifact same-origin at
  `wasm/market-generator.wasm` and instantiates it. The worker calls
  `init(instrumentCount, seed)` once per run, then per acquisition calls
  `generateBatch(updatesPerBatch)` — whose return value is the byte offset
  of the first record, with a negative sentinel marking an invalid request
  — reads the record count, and decodes the batch through a fresh
  `Uint32Array` view over the module's memory (seven u32 fields per
  record), completing the read before the next call reuses the buffer.
- `market-generator.artifact.spec.ts` - proves the built artifact exists in
  `dist/libs/market-generator`, instantiates through the loader, and checks the
  generator contract with fixed seeds: requested batch sizes, record value
  invariants, reproducibility, and state that evolves across batches
  (node environment, no DOM).

## How to extend safely

- Widen the module surface in `libs/market-generator` first, then mirror every
  new export in `MarketGeneratorExports` and the fail-fast checks here.
- Keep one instantiate path: feed new byte sources to
  `instantiateMarketGenerator` rather than calling `WebAssembly.instantiate`
  directly.
- The default URL matches the app assets entry that copies the artifact
  into `wasm/`; change both together.
- Treat the module's memory as untrusted input: honor the pointer and
  count contract, and let contract violations fail visibly instead of
  being smoothed over.
- WebAssembly compilation is admitted by the `'wasm-unsafe-eval'`
  directive of the content-security baseline in the served document
  (`src/index.html`); keep script sources otherwise same-origin.
