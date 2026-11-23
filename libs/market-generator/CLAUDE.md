# market-generator

## Purpose

The AssemblyScript market-update generator, compiled to the deployed
WebAssembly artifact. Randomness and price evolution run inside the module:
it keeps per-instrument generator state between calls and produces batches
of simulated trades with a bid/ask snapshot per trade, on a fixed record
contract the worker reads directly from linear memory.

## Key pieces

- `src/index.ts` - the entry module the compiler consumes. It implements a
  seeded integer PRNG (splitmix64: a u64 state stepped deterministically,
  drawing u32 values) so generation is reproducible from the seed passed to
  `init`. The export surface is three functions plus the default `memory`:
  `init(instrumentCount, seed)` allocates the reused record buffer once and
  resets per-instrument state, `generateBatch(updatesPerBatch)` writes the
  batch and returns the byte offset of the first record — a negative
  sentinel marks an invalid request — and `recordCount()` reports how many
  records the last call wrote. One record is seven u32 values (28 bytes):
  instrument id, trade price in cents, trade quantity, bid and ask in
  cents, and the available bid and ask quantities; capacity is fixed at
  1000 records and the buffer is reused for every call, so the reader must
  finish before the next call overwrites it. Prices stay positive and
  evolve from each instrument's reference price, the bid stays below the
  ask, trade quantities stay positive, book quantities stay nonnegative,
  and each trade price is chosen from that update's bid or ask.
- `project.json` - one cached build target (plus lint) that runs, from this
  directory:

```sh
pnpm exec asc src/index.ts --outFile ../../dist/libs/market-generator/market-generator.wasm --runtime stub
```

- `package.json` pins `assemblyscript`; `tsconfig.json` extends
  `assemblyscript/std/assembly.json`.
- Consumption is artifact-only: the application build copies
  `dist/libs/market-generator/*.wasm` into its browser output, and nothing
  imports this library as TypeScript. The root `tsconfig.base.json`
  excludes it from the application program, and lint parses it without
  type-aware rules.

## How to extend safely

- Grow generator behavior here; keep the export surface small and typed,
  because every export is a commitment the application's
  `MarketGeneratorExports` must mirror, and the record layout is a contract the
  worker's decoder follows field for field.
- Keep the output path aligned with the application assets entry that
  copies the artifact; the workspace runs this build before the
  application build.
- Keep application-framework and DOM imports out; this library compiles to
  Wasm and has no Angular or browser runtime.
