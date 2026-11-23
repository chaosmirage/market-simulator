// @vitest-environment node
// Node environment on purpose: this spec reads the compiled module from the
// build output and instantiates the bytes through the shared loader -- no
// DOM involved. The browser round trip (worker fetch) is exercised by the
// running app.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { instantiateWasmStub } from './wasm-loader';

const ARTIFACT_URL = new URL(
  '../../../../../dist/libs/wasm-stub/wasm-stub.wasm',
  import.meta.url
);

/** Field order of one generated update record in the module's memory. */
const RECORD_FIELD_COUNT = 7;

/** Fields of one generated update record, in wire order. */
type MarketUpdateRecord = {
  instrumentId: number;
  priceCents: number;
  tradeQuantity: number;
  bidCents: number;
  askCents: number;
  bidQuantity: number;
  askQuantity: number;
};

/**
 * The market-generator surface the compiled artifact must hand the
 * application through the instantiate path: generation-state setup, batch
 * production, the record count of the batch last produced, and the linear
 * memory the records live in.
 */
type MarketGenerator = {
  memory: WebAssembly.Memory;
  init(instrumentCount: number, seed: number): void;
  generateBatch(updatesPerBatch: number): number;
  recordCount(): number;
};

async function instantiateGenerator(): Promise<MarketGenerator> {
  const wasm = (
    await instantiateWasmStub(readFileSync(ARTIFACT_URL))
  ) as unknown as MarketGenerator;
  // The seam the artifact owes its consumer: the loader hands back the
  // generator surface. Asserted here so every batch assertion below starts
  // from a contract that actually holds.
  expect(typeof wasm.init).toBe('function');
  expect(typeof wasm.generateBatch).toBe('function');
  expect(typeof wasm.recordCount).toBe('function');
  expect(wasm.memory).toBeInstanceOf(WebAssembly.Memory);
  return wasm;
}

/** Reads the records of one produced batch from the module's memory. */
function readRecords(
  wasm: MarketGenerator,
  byteOffset: number,
  count: number
): MarketUpdateRecord[] {
  const words = new Uint32Array(
    wasm.memory.buffer,
    byteOffset,
    count * RECORD_FIELD_COUNT
  );
  const records: MarketUpdateRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = i * RECORD_FIELD_COUNT;
    records.push({
      instrumentId: words[base],
      priceCents: words[base + 1],
      tradeQuantity: words[base + 2],
      bidCents: words[base + 3],
      askCents: words[base + 4],
      bidQuantity: words[base + 5],
      askQuantity: words[base + 6],
    });
  }
  return records;
}

/** Produces one batch and reads it back as decoded records. */
function generateAndRead(
  wasm: MarketGenerator,
  updatesPerBatch: number
): MarketUpdateRecord[] {
  const byteOffset = wasm.generateBatch(updatesPerBatch);
  expect(byteOffset).toBeGreaterThanOrEqual(0);
  return readRecords(wasm, byteOffset, updatesPerBatch);
}

/** Every record must describe one plausible simulated trade and quote. */
function expectRecordsValid(
  records: MarketUpdateRecord[],
  instrumentCount: number
): void {
  for (const record of records) {
    expect(record.instrumentId).toBeLessThan(instrumentCount);
    expect(record.priceCents).toBeGreaterThan(0);
    expect(record.tradeQuantity).toBeGreaterThan(0);
    expect(record.bidQuantity).toBeGreaterThanOrEqual(0);
    expect(record.askQuantity).toBeGreaterThanOrEqual(0);
    expect(record.bidCents).toBeLessThan(record.askCents);
    expect([record.bidCents, record.askCents]).toContain(record.priceCents);
  }
}

describe('wasm-stub compiled artifact', () => {
  it('is produced by the wasm-stub build into the shared dist tree', () => {
    expect(existsSync(ARTIFACT_URL)).toBe(true);
  });

  it('exposes the market-generator surface through the shared instantiate path', async () => {
    await instantiateGenerator();
  });

  it('generates exactly the requested number of valid update records per batch', async () => {
    const wasm = await instantiateGenerator();
    const instrumentCount = 5;
    wasm.init(instrumentCount, 20260123);

    for (const requested of [1, 5, 1000]) {
      const byteOffset = wasm.generateBatch(requested);

      expect(byteOffset).toBeGreaterThanOrEqual(0);
      expect(byteOffset % 4).toBe(0);
      expect(wasm.recordCount()).toBe(requested);

      const records = readRecords(wasm, byteOffset, requested);
      expect(records).toHaveLength(requested);
      expectRecordsValid(records, instrumentCount);
    }
  });

  it('spreads records across every instrument at the largest instrument count', async () => {
    const wasm = await instantiateGenerator();
    const instrumentCount = 50;
    wasm.init(instrumentCount, 4242);

    const records = generateAndRead(wasm, 1000);

    expectRecordsValid(records, instrumentCount);
    const seen = new Set(records.map((record) => record.instrumentId));
    expect(seen.size).toBe(instrumentCount);
  });

  it('rejects out-of-range batch sizes without writing records', async () => {
    const wasm = await instantiateGenerator();
    wasm.init(5, 7);

    generateAndRead(wasm, 10);

    expect(wasm.generateBatch(0)).toBeLessThan(0);
    expect(wasm.generateBatch(1001)).toBeLessThan(0);
    expect(wasm.recordCount()).toBe(0);
  });

  it('reproduces the same record sequence from the same seed', async () => {
    const first = await instantiateGenerator();
    const second = await instantiateGenerator();
    first.init(5, 99);
    second.init(5, 99);

    const fromFirst = generateAndRead(first, 25);
    const fromSecond = generateAndRead(second, 25);

    expect(fromFirst).toEqual(fromSecond);
  });

  it('evolves generation state across batches instead of repeating the first', async () => {
    const wasm = await instantiateGenerator();
    wasm.init(5, 2026);

    const firstBatch = generateAndRead(wasm, 40);
    for (let batch = 0; batch < 5; batch += 1) {
      wasm.generateBatch(40);
    }
    const laterBatch = generateAndRead(wasm, 40);

    expectRecordsValid(laterBatch, 5);
    expect(laterBatch).not.toEqual(firstBatch);
  });
});
