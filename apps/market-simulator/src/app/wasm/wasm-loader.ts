// Loads the compiled wasm-stub module: a same-origin fetch of the deployed
// artifact, WebAssembly.instantiate of the bytes, and a typed view of the
// module's exports. The instantiate core is split out so the worker seam
// (browser fetch) and the artifact spec (bytes read from the build output)
// share one code path.

/** The typed surface of the wasm-stub module's WebAssembly exports. */
export interface WasmStubExports {
  add(a: number, b: number): number;
}

/**
 * Instantiates wasm-stub bytes and returns the typed exports view.
 * Fails fast when the module does not expose the expected contract.
 */
export async function instantiateWasmStub(
  bytes: ArrayBuffer | Uint8Array
): Promise<WasmStubExports> {
  const { instance } = await WebAssembly.instantiate(bytes);
  const { add } = instance.exports as { add?: unknown };
  if (typeof add !== 'function') {
    throw new Error('wasm-stub module is missing its add export');
  }
  return { add } as WasmStubExports;
}

/**
 * Fetches the deployed wasm-stub artifact (same-origin) and instantiates it.
 * The default URL matches the app assets entry that copies the built module
 * into the wasm/ output directory.
 */
export async function loadWasmStub(
  url = 'wasm/wasm-stub.wasm'
): Promise<WasmStubExports> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return instantiateWasmStub(await response.arrayBuffer());
}
