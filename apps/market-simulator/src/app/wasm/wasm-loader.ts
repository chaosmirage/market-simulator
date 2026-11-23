// Loads the compiled market-generator module: a same-origin fetch of the deployed
// artifact, WebAssembly.instantiate of the bytes, and a typed view of the
// module's market-data exports. The instantiate core is split out so the
// worker seam (browser fetch) and the artifact spec (bytes read from the
// build output) share one code path.

/** The typed surface of the market-generator module's WebAssembly exports. */
export interface MarketGeneratorExports {
  /** The linear memory the generated record buffer lives in. */
  memory: WebAssembly.Memory;
  /** Establishes a fresh, seeded generation state for the instruments. */
  init(instrumentCount: number, seed: number): void;
  /**
   * Writes one batch of update records into the reused record buffer and
   * returns the byte offset of the first record; a negative return
   * refuses the request without writing a batch.
   */
  generateBatch(updatesPerBatch: number): number;
  /** The number of records the most recent accepted batch wrote. */
  recordCount(): number;
}

/**
 * Instantiates market-generator bytes and returns the typed exports view.
 * Fails fast, naming the export, when the module does not expose the
 * expected market-data contract.
 */
export async function instantiateMarketGenerator(
  bytes: ArrayBuffer | Uint8Array
): Promise<MarketGeneratorExports> {
  // The AssemblyScript toolchain links an env abort import into every module
  // it emits; provide it so instantiation succeeds and trap-like aborts
  // surface as thrown errors instead of missing-import failures.
  const imports = {
    env: {
      abort(
        message: number,
        fileName: number,
        line: number,
        column: number
      ): never {
        throw new Error(
          `market-generator module aborted at ${fileName}:${line}:${column} (${message})`
        );
      },
    },
  };
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  const { memory, init, generateBatch, recordCount } = instance.exports as {
    memory?: unknown;
    init?: unknown;
    generateBatch?: unknown;
    recordCount?: unknown;
  };
  const linearMemoryBuffer = (memory as { buffer?: unknown } | undefined)
    ?.buffer;
  if (!(linearMemoryBuffer instanceof ArrayBuffer)) {
    throw new Error('market-generator module is missing its memory export');
  }
  if (typeof init !== 'function') {
    throw new Error('market-generator module is missing its init export');
  }
  if (typeof generateBatch !== 'function') {
    throw new Error(
      'market-generator module is missing its generateBatch export'
    );
  }
  if (typeof recordCount !== 'function') {
    throw new Error(
      'market-generator module is missing its recordCount export'
    );
  }
  return { memory, init, generateBatch, recordCount } as MarketGeneratorExports;
}

/**
 * Fetches the deployed market-generator artifact (same-origin) and instantiates it.
 * The default URL matches the app assets entry that copies the built module
 * into the wasm/ output directory.
 */
export async function loadMarketGenerator(
  url = 'wasm/market-generator.wasm'
): Promise<MarketGeneratorExports> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return instantiateMarketGenerator(await response.arrayBuffer());
}
