# wasm-stub

## Purpose

The AssemblyScript library compiled to the deployed WebAssembly artifact.
It is deliberately trivial, a single `add` function, because its job today
is to prove the artifact pipeline end to end: compile, deploy, fetch,
instantiate. Market-generation logic arrives here later.

## Key pieces

- `src/index.ts` - the entry module the compiler consumes. Its exports are
  the contract the application-side loader validates against; the value
  types are AssemblyScript (`i32`), not application TypeScript.
- `project.json` - one cached build target (plus lint) that runs, from this
  directory:

```sh
pnpm exec asc src/index.ts --outFile ../../dist/libs/wasm-stub/wasm-stub.wasm --runtime stub
```

- `package.json` pins `assemblyscript`; `tsconfig.json` extends
  `assemblyscript/std/assembly.json`.
- Consumption is artifact-only: the application build copies
  `dist/libs/wasm-stub/*.wasm` into its browser output, and nothing
  imports this library as TypeScript. The root `tsconfig.base.json`
  excludes it from the application program, and lint parses it without
  type-aware rules.

## How to extend safely

- Grow producer logic here in AssemblyScript; keep the export surface
  small and typed, because every export is a commitment the application's
  `WasmStubExports` must mirror.
- Keep the output path aligned with the application assets entry that
  copies the artifact; the workspace runs this build before the
  application build.
- Keep application-framework and DOM imports out; this library compiles to
  Wasm and has no Angular or browser runtime.
