# wasm

## Purpose

The application's WebAssembly load path: the typed view of the module's
exports, the instantiate core, and the same-origin fetch of the deployed
artifact.

## Key pieces

- `wasm-loader.ts` - `WasmStubExports` is the typed surface the module
  must expose (today `add`). `instantiateWasmStub(bytes)` runs
  `WebAssembly.instantiate` and fails fast when the expected export is
  missing. `loadWasmStub()` fetches the deployed artifact same-origin at
  `wasm/wasm-stub.wasm` and instantiates it. The instantiate core is
  shared: the worker reaches it through the browser fetch, the artifact
  spec through bytes read from the build output.
- `wasm-stub.artifact.spec.ts` - proves the built artifact exists in
  `dist/libs/wasm-stub` and instantiates and computes through the loader
  (node environment, no DOM).

## How to extend safely

- Widen the module surface in `libs/wasm-stub` first, then mirror every
  new export in `WasmStubExports` and the fail-fast checks here.
- Keep one instantiate path: feed new byte sources to
  `instantiateWasmStub` rather than calling `WebAssembly.instantiate`
  directly.
- The default URL matches the app assets entry that copies the artifact
  into `wasm/`; change both together.
- WebAssembly compilation is admitted by the `'wasm-unsafe-eval'`
  directive of the content-security baseline in the served document
  (`src/index.html`); keep script sources otherwise same-origin.
