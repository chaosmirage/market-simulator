// @vitest-environment node
// Node environment on purpose: this spec reads the compiled module from the
// build output and instantiates the bytes directly -- no DOM involved. The
// browser round trip (worker fetch) is exercised by the running app.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { instantiateWasmStub } from './wasm-loader';

const ARTIFACT_URL = new URL(
  '../../../../../dist/libs/wasm-stub/wasm-stub.wasm',
  import.meta.url
);

describe('wasm-stub compiled artifact', () => {
  it('is produced by the wasm-stub build into the shared dist tree', () => {
    expect(existsSync(ARTIFACT_URL)).toBe(true);
  });

  it('instantiates through the loader and computes via its export', async () => {
    const wasm = await instantiateWasmStub(readFileSync(ARTIFACT_URL));

    expect(wasm.add(2, 3)).toBe(5);
  });
});
