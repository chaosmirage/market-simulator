// @vitest-environment node
// Node environment on purpose: the loader's contract is exercised against
// synthetic module instances -- no DOM and no compiled artifact involved.
// The artifact-level round trip lives in market-generator.artifact.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instantiateMarketGenerator } from './wasm-loader';

/**
 * A synthetic export set shaped like the compiled market-data module: the
 * linear memory plus the three generator entry points.
 */
function marketDataExports(): Record<string, unknown> {
  return {
    memory: new WebAssembly.Memory({ initial: 1 }),
    init: () => undefined,
    generateBatch: () => 0,
    recordCount: () => 0,
  };
}

/**
 * Feeds the loader a synthetic module exposing exactly the given exports
 * and returns its outcome, restoring the patched global afterwards.
 */
function instantiateWith(exports: Record<string, unknown>): Promise<unknown> {
  vi.stubGlobal('WebAssembly', {
    instantiate: vi
      .fn()
      .mockResolvedValue({ instance: { exports } }),
  });
  return instantiateMarketGenerator(new Uint8Array()).finally(() =>
    vi.unstubAllGlobals()
  );
}

describe('market-generator loader export mirror', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the typed view over a module exposing the full market-data surface', async () => {
    await expect(instantiateWith(marketDataExports())).resolves.toMatchObject({
      memory: { buffer: expect.any(ArrayBuffer) },
      init: expect.any(Function),
      generateBatch: expect.any(Function),
      recordCount: expect.any(Function),
    });
  });

  it('fails fast naming the export a module leaves out', async () => {
    for (const missing of [
      'memory',
      'init',
      'generateBatch',
      'recordCount',
    ] as const) {
      const exports = marketDataExports();
      delete exports[missing];

      await expect(instantiateWith(exports)).rejects.toThrow(missing);
    }
  });

  it('fails fast when the memory export carries no linear-memory buffer', async () => {
    const exports = marketDataExports();
    exports.memory = {};

    await expect(instantiateWith(exports)).rejects.toThrow('memory');
  });
});
